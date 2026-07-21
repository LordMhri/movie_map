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
	ID             int      `json:"id"`
	VectorIndex    int      `json:"-"`
	Title          string   `json:"title"`
	Year           *int     `json:"year"`
	Genres         []string `json:"genres"`
	RatingCount    int      `json:"ratingCount"`
	MapX           float32  `json:"x"`
	MapY           float32  `json:"y"`
	Source         string   `json:"source"`
	BroadClusterID int      `json:"broadClusterId"`
	ChildClusterID int      `json:"childClusterId"`
}

type Cluster struct {
	ID         int     `json:"id"`
	ParentID   *int    `json:"parentId"`
	Level      int     `json:"level"`
	Label      string  `json:"label"`
	X          float32 `json:"x"`
	Y          float32 `json:"y"`
	Radius     float32 `json:"radius"`
	MovieCount int     `json:"movieCount"`
}

type MapEdge struct {
	Source int     `json:"source"`
	Target int     `json:"target"`
	Score  float32 `json:"score"`
}

type Store struct {
	Manifest Manifest
	Movies   []Movie
	Clusters []Cluster
	MapEdges []MapEdge
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
	if manifest.Version != 2 || manifest.MovieCount <= 0 {
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
	clusters, err := loadClusters(filepath.Join(directory, "movies.db"))
	if err != nil {
		return nil, err
	}
	mapEdges, err := loadMapEdges(filepath.Join(directory, "movies.db"))
	if err != nil {
		return nil, err
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
		Clusters: clusters,
		MapEdges: mapEdges,
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
		SELECT
			m.id, m.vector_index, m.title, m.year, m.genres, m.rating_count,
			m.map_x, m.map_y, m.source,
			COALESCE(broad.cluster_id, 0), COALESCE(child.cluster_id, 0)
		FROM movies m
		LEFT JOIN movie_clusters broad
			ON broad.movie_id = m.id AND broad.level = 1
		LEFT JOIN movie_clusters child
			ON child.movie_id = m.id AND child.level = 2
		ORDER BY m.vector_index
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
			&movie.BroadClusterID,
			&movie.ChildClusterID,
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

func loadClusters(path string) ([]Cluster, error) {
	database, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open cluster database: %w", err)
	}
	defer database.Close()

	rows, err := database.Query(`
		SELECT id, parent_id, level, label, center_x, center_y, radius, movie_count
		FROM clusters
		ORDER BY level, id
	`)
	if err != nil {
		return nil, fmt.Errorf("query clusters: %w", err)
	}
	defer rows.Close()

	var clusters []Cluster
	for rows.Next() {
		var cluster Cluster
		var parentID sql.NullInt64
		if err := rows.Scan(
			&cluster.ID,
			&parentID,
			&cluster.Level,
			&cluster.Label,
			&cluster.X,
			&cluster.Y,
			&cluster.Radius,
			&cluster.MovieCount,
		); err != nil {
			return nil, fmt.Errorf("scan cluster: %w", err)
		}
		if parentID.Valid {
			value := int(parentID.Int64)
			cluster.ParentID = &value
		}
		clusters = append(clusters, cluster)
	}
	return clusters, rows.Err()
}

func loadMapEdges(path string) ([]MapEdge, error) {
	database, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open edge database: %w", err)
	}
	defer database.Close()

	rows, err := database.Query(`
		SELECT source_id, target_id, score
		FROM map_edges
		ORDER BY source_id, target_id
	`)
	if err != nil {
		return nil, fmt.Errorf("query map edges: %w", err)
	}
	defer rows.Close()

	var edges []MapEdge
	for rows.Next() {
		var edge MapEdge
		if err := rows.Scan(&edge.Source, &edge.Target, &edge.Score); err != nil {
			return nil, fmt.Errorf("scan map edge: %w", err)
		}
		edges = append(edges, edge)
	}
	return edges, rows.Err()
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
