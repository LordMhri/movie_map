package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"moviemap/backend/internal/artifacts"
	"moviemap/backend/internal/search"
)

type Server struct {
	store  *artifacts.Store
	engine *search.Engine
}

type similarResponse struct {
	Query   artifacts.Movie `json:"query"`
	Results []search.Result `json:"results"`
}

type graphLink struct {
	Source int     `json:"source"`
	Target int     `json:"target"`
	Score  float32 `json:"score"`
}

type graphResponse struct {
	Nodes []artifacts.Movie `json:"nodes"`
	Links []graphLink       `json:"links"`
}

type mapResponse struct {
	Movies   []artifacts.Movie   `json:"movies"`
	Clusters []artifacts.Cluster `json:"clusters"`
	Edges    []artifacts.MapEdge `json:"edges"`
}

func New(store *artifacts.Store) http.Handler {
	return NewWithAllowedOrigin(store, "http://localhost:5173")
}

func NewWithAllowedOrigin(store *artifacts.Store, allowedOrigin string) http.Handler {
	server := &Server{store: store, engine: search.New(store)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", server.health)
	mux.HandleFunc("GET /movies/search", server.searchMovies)
	mux.HandleFunc("GET /movies/{id}/similar", server.similarMovies)
	mux.HandleFunc("GET /map", server.movieMap)
	mux.HandleFunc("GET /graph/{id}", server.movieGraph)
	return withMiddleware(mux, allowedOrigin)
}

func (server *Server) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]any{
		"status": "ok",
		"movies": len(server.store.Movies),
	})
}

func (server *Server) searchMovies(response http.ResponseWriter, request *http.Request) {
	limit := intParameter(request, "limit", 8)
	limit = max(1, min(25, limit))
	writeJSON(
		response,
		http.StatusOK,
		server.store.Search(request.URL.Query().Get("q"), limit),
	)
}

func (server *Server) similarMovies(response http.ResponseWriter, request *http.Request) {
	movieID, err := strconv.Atoi(request.PathValue("id"))
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid movie id")
		return
	}
	movie, ok := server.store.Movie(movieID)
	if !ok {
		writeError(response, http.StatusNotFound, "movie not found")
		return
	}

	results, _ := server.engine.Similar(
		movieID,
		intParameter(request, "k", 12),
		floatParameter(request, "w", 0.7),
	)
	writeJSON(response, http.StatusOK, similarResponse{Query: movie, Results: results})
}

func (server *Server) movieMap(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, mapResponse{
		Movies:   server.store.Movies,
		Clusters: server.store.Clusters,
		Edges:    server.store.MapEdges,
	})
}

func (server *Server) movieGraph(response http.ResponseWriter, request *http.Request) {
	movieID, err := strconv.Atoi(request.PathValue("id"))
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid movie id")
		return
	}
	query, ok := server.store.Movie(movieID)
	if !ok {
		writeError(response, http.StatusNotFound, "movie not found")
		return
	}
	results, _ := server.engine.Similar(
		movieID,
		intParameter(request, "k", 12),
		floatParameter(request, "w", 0.7),
	)

	graph := graphResponse{
		Nodes: []artifacts.Movie{query},
		Links: make([]graphLink, 0, len(results)),
	}
	for _, result := range results {
		graph.Nodes = append(graph.Nodes, result.Movie)
		graph.Links = append(graph.Links, graphLink{
			Source: query.ID,
			Target: result.Movie.ID,
			Score:  result.Score,
		})
	}
	writeJSON(response, http.StatusOK, graph)
}

func intParameter(request *http.Request, key string, fallback int) int {
	value, err := strconv.Atoi(request.URL.Query().Get(key))
	if err != nil {
		return fallback
	}
	return value
}

func floatParameter(request *http.Request, key string, fallback float32) float32 {
	value, err := strconv.ParseFloat(request.URL.Query().Get(key), 32)
	if err != nil {
		return fallback
	}
	return float32(value)
}

func writeError(response http.ResponseWriter, status int, message string) {
	writeJSON(response, status, map[string]string{"error": message})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(value); err != nil {
		slog.Error("write JSON response", "error", err)
	}
}

func withMiddleware(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if allowedOrigin == "*" || origin == allowedOrigin {
			response.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			response.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			response.Header().Set("Access-Control-Allow-Methods", http.MethodGet)
			response.Header().Add("Vary", "Origin")
		}
		if request.Method == http.MethodOptions {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(response, request)
	})
}
