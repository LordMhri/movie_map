package search

import (
	"math"
	"runtime"
	"sort"
	"sync"

	"moviemap/backend/internal/artifacts"
)

type Result struct {
	Movie        artifacts.Movie `json:"movie"`
	Score        float32         `json:"score"`
	ContentScore float32         `json:"contentScore"`
	CFScore      float32         `json:"cfScore"`
}

type Engine struct {
	store *artifacts.Store
}

func New(store *artifacts.Store) *Engine {
	return &Engine{store: store}
}

func (engine *Engine) Similar(movieID int, limit int, cfWeight float32) ([]Result, bool) {
	query, ok := engine.store.Movie(movieID)
	if !ok {
		return nil, false
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	cfWeight = max(0, min(1, cfWeight))

	queryContent, queryCF := engine.store.Vector(query.VectorIndex)
	workers := min(runtime.GOMAXPROCS(0), len(engine.store.Movies))
	chunkSize := (len(engine.store.Movies) + workers - 1) / workers

	resultChannel := make(chan []Result, workers)
	var waitGroup sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		start := worker * chunkSize
		stop := min(start+chunkSize, len(engine.store.Movies))
		if start >= stop {
			continue
		}

		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			results := make([]Result, 0, stop-start)
			for index := start; index < stop; index++ {
				candidate := engine.store.Movies[index]
				if candidate.ID == query.ID {
					continue
				}
				content, cf := engine.store.Vector(candidate.VectorIndex)
				contentScore := cosine(queryContent, content)
				cfScore, cfAvailable := cosineAvailable(queryCF, cf)
				score := contentScore
				if cfAvailable {
					cfScore *= ratingConfidence(query.RatingCount) *
						ratingConfidence(candidate.RatingCount)
					score = (1-cfWeight)*contentScore + cfWeight*cfScore
				}
				results = append(results, Result{
					Movie:        candidate,
					Score:        score,
					ContentScore: contentScore,
					CFScore:      cfScore,
				})
			}
			resultChannel <- results
		}()
	}

	go func() {
		waitGroup.Wait()
		close(resultChannel)
	}()

	results := make([]Result, 0, len(engine.store.Movies)-1)
	for partial := range resultChannel {
		results = append(results, partial...)
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})
	if len(results) > limit {
		results = results[:limit]
	}
	return results, true
}

func cosine(left, right []float32) float32 {
	score, _ := cosineAvailable(left, right)
	return score
}

func cosineAvailable(left, right []float32) (float32, bool) {
	var dot, leftNorm, rightNorm float64
	for index, leftValue := range left {
		rightValue := right[index]
		dot += float64(leftValue * rightValue)
		leftNorm += float64(leftValue * leftValue)
		rightNorm += float64(rightValue * rightValue)
	}
	if leftNorm == 0 || rightNorm == 0 {
		return 0, false
	}
	return float32(dot / math.Sqrt(leftNorm*rightNorm)), true
}

func ratingConfidence(ratingCount int) float32 {
	const shrinkage = 25
	if ratingCount <= 0 {
		return 0
	}
	return float32(ratingCount) / float32(ratingCount+shrinkage)
}
