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
}

func request(t *testing.T, handler http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, target, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
