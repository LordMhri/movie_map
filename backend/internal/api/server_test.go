package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"moviemap/backend/internal/artifacts"
)

func TestGeneratedArtifactsServeCoreRoutes(t *testing.T) {
	dataDirectory := filepath.Join("..", "..", "..", "data")
	store, err := artifacts.Load(dataDirectory)
	if err != nil {
		t.Skipf("generated artifacts are unavailable: %v", err)
	}
	handler := New(store)

	t.Run("health", func(t *testing.T) {
		response := request(t, handler, "/health")
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
		}
	})

	t.Run("search", func(t *testing.T) {
		response := request(t, handler, "/movies/search?q=matrix&limit=3")
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
		}
		var movies []artifacts.Movie
		if err := json.Unmarshal(response.Body.Bytes(), &movies); err != nil {
			t.Fatal(err)
		}
		if len(movies) == 0 {
			t.Fatal("expected Matrix search results")
		}
	})

	t.Run("similar", func(t *testing.T) {
		response := request(t, handler, "/movies/2571/similar?k=5&w=0.7")
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
		}
		var payload similarResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		if len(payload.Results) != 5 {
			t.Fatalf("expected 5 recommendations, got %d", len(payload.Results))
		}
	})

	t.Run("map hierarchy", func(t *testing.T) {
		response := request(t, handler, "/map")
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
		}
		var payload mapResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		if len(payload.Movies) != store.Manifest.MovieCount {
			t.Fatalf("expected %d movies, got %d", store.Manifest.MovieCount, len(payload.Movies))
		}
		if len(payload.Clusters) == 0 || len(payload.Edges) == 0 {
			t.Fatal("expected cluster metadata and map edges")
		}

		movieIDs := make(map[int]struct{}, len(payload.Movies))
		for _, movie := range payload.Movies {
			movieIDs[movie.ID] = struct{}{}
			if movie.BroadClusterID == 0 || movie.ChildClusterID == 0 {
				t.Fatalf("movie %d is missing cluster assignments", movie.ID)
			}
		}
		for _, edge := range payload.Edges {
			if _, ok := movieIDs[edge.Source]; !ok {
				t.Fatalf("edge source %d is not a movie", edge.Source)
			}
			if _, ok := movieIDs[edge.Target]; !ok {
				t.Fatalf("edge target %d is not a movie", edge.Target)
			}
		}
	})
}

func TestConfiguredCORS(t *testing.T) {
	const allowedOrigin = "https://movie-map.pages.dev"
	handler := withMiddleware(http.HandlerFunc(func(
		response http.ResponseWriter,
		_ *http.Request,
	) {
		response.WriteHeader(http.StatusOK)
	}), allowedOrigin)

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", allowedOrigin)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if origin := response.Header().Get("Access-Control-Allow-Origin"); origin != allowedOrigin {
		t.Fatalf("expected CORS origin %q, got %q", allowedOrigin, origin)
	}
}

func request(t *testing.T, handler http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, target, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
