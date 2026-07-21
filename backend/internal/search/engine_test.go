package search

import (
	"math"
	"testing"
)

func TestCosineAvailable(t *testing.T) {
	t.Parallel()

	score, available := cosineAvailable([]float32{1, 0}, []float32{1, 1})
	if !available {
		t.Fatal("expected non-zero vectors to be available")
	}
	if difference := math.Abs(float64(score) - 1/math.Sqrt2); difference > 1e-6 {
		t.Fatalf("unexpected cosine score: %f", score)
	}
}

func TestCosineUnavailableForZeroVector(t *testing.T) {
	t.Parallel()

	if _, available := cosineAvailable([]float32{0, 0}, []float32{1, 0}); available {
		t.Fatal("expected a zero vector to be unavailable")
	}
}

func TestRatingConfidenceShrinksSparseMovies(t *testing.T) {
	t.Parallel()

	sparse := ratingConfidence(5)
	popular := ratingConfidence(500)
	if sparse >= popular {
		t.Fatalf("expected sparse confidence %f to be below popular %f", sparse, popular)
	}
	if popular >= 1 {
		t.Fatalf("expected confidence below one, got %f", popular)
	}
}
