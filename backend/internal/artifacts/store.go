package artifacts

import (
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

type Manifest struct {
	Version           int    `json:"version"`
	MovieCount        int    `json:"movie_count"`
	ContentDimensions int    `json:"content_dimensions"`
	CFDimensions      int    `json:"cf_dimensions"`
	VectorFile        string `json:"vector_file"`
}

type Movie struct {
	ID          int      `json:"id"`
	VectorIndex int      `json:"-"`
	Title       string   `json:"title"`
	Year        *int     `json:"year"`
	Genres      []string `json:"genres"`
	RatingCount int      `json:"ratingCount"`
	MapX        float32  `json:"x"`
	MapY        float32  `json:"y"`
	Source      string   `json:"source"`
}

type Store struct {
	Manifest Manifest
	Movies   []Movie
	Vectors  []float32
	byID     map[int]int
}

func Load(directory string) (*Store, error) {
	manifestBytes, err := os.ReadFile(filepath.Join(directory, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("decode manifest: %w", err)
	}
	if manifest.Version != 1 || manifest.MovieCount <= 0 {
		return nil, errors.New("unsupported or empty artifact manifest")
	}

	movies, err := loadMovies(filepath.Join(directory, "movies.db"))
	if err != nil {
		return nil, err
	}
	if len(movies) != manifest.MovieCount {
		return nil, fmt.Errorf(
			"artifact mismatch: manifest has %d movies, database has %d",
			manifest.MovieCount,
			len(movies),
		)
	}

	vectors, err := loadVectors(filepath.Join(directory, manifest.VectorFile))
	if err != nil {
		return nil, err
	}
	expectedValues := manifest.MovieCount *
		(manifest.ContentDimensions + manifest.CFDimensions)
	if len(vectors) != expectedValues {
		return nil, fmt.Errorf(
			"artifact mismatch: expected %d vector values, got %d",
			expectedValues,
			len(vectors),
		)
	}

	byID := make(map[int]int, len(movies))
	for index, movie := range movies {
		byID[movie.ID] = index
	}
	return &Store{
		Manifest: manifest,
		Movies:   movies,
		Vectors:  vectors,
		byID:     byID,
	}, nil
}

func (store *Store) Movie(id int) (Movie, bool) {
	index, ok := store.byID[id]
	if !ok {
		return Movie{}, false
	}
	return store.Movies[index], true
}

func (store *Store) Vector(index int) (content []float32, cf []float32) {
	width := store.Manifest.ContentDimensions + store.Manifest.CFDimensions
	start := index * width
	split := start + store.Manifest.ContentDimensions
	return store.Vectors[start:split], store.Vectors[split : start+width]
}

func (store *Store) Search(query string, limit int) []Movie {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" || limit <= 0 {
		return []Movie{}
	}

	type match struct {
		movie Movie
		rank  int
	}
	matches := make([]match, 0, limit)
	for _, movie := range store.Movies {
		title := strings.ToLower(movie.Title)
		position := strings.Index(title, query)
		if position >= 0 {
			matches = append(matches, match{movie: movie, rank: position})
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].rank != matches[j].rank {
			return matches[i].rank < matches[j].rank
		}
		return len(matches[i].movie.Title) < len(matches[j].movie.Title)
	})
	if len(matches) > limit {
		matches = matches[:limit]
	}

	result := make([]Movie, len(matches))
	for index, item := range matches {
		result[index] = item.movie
	}
	return result
}

func loadMovies(path string) ([]Movie, error) {
	database, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open movie database: %w", err)
	}
	defer database.Close()

	rows, err := database.Query(`
		SELECT id, vector_index, title, year, genres, rating_count, map_x, map_y, source
		FROM movies
		ORDER BY vector_index
	`)
	if err != nil {
		return nil, fmt.Errorf("query movies: %w", err)
	}
	defer rows.Close()

	var movies []Movie
	for rows.Next() {
		var movie Movie
		var year sql.NullInt64
		var genres string
		if err := rows.Scan(
			&movie.ID,
			&movie.VectorIndex,
			&movie.Title,
			&year,
			&genres,
			&movie.RatingCount,
			&movie.MapX,
			&movie.MapY,
			&movie.Source,
		); err != nil {
			return nil, fmt.Errorf("scan movie: %w", err)
		}
		if year.Valid {
			value := int(year.Int64)
			movie.Year = &value
		}
		movie.Genres = strings.Split(genres, "|")
		movies = append(movies, movie)
	}
	return movies, rows.Err()
}

func loadVectors(path string) ([]float32, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read vectors: %w", err)
	}
	if len(data)%4 != 0 {
		return nil, errors.New("vector file size is not divisible by four")
	}

	vectors := make([]float32, len(data)/4)
	for index := range vectors {
		bits := binary.LittleEndian.Uint32(data[index*4 : index*4+4])
		vectors[index] = math.Float32frombits(bits)
	}
	return vectors, nil
}
