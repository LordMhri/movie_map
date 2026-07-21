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

func TestHybridCosineMatchesCombinedVectorGeometry(t *testing.T) {
	t.Parallel()

	score, contentScore, cfScore := hybridCosine(
		[]float32{1, 0},
		[]float32{0.5, float32(math.Sqrt(0.75))},
		[]float32{1, 0},
		[]float32{0.6, 0},
		0.7,
	)
	expected := (0.3*0.5 + 0.7*0.6) / math.Sqrt(0.3+0.7*0.36)
	if difference := math.Abs(float64(score) - expected); difference > 1e-6 {
		t.Fatalf("unexpected hybrid score: got %f, want %f", score, expected)
	}
	if difference := math.Abs(float64(contentScore) - 0.5); difference > 1e-6 {
		t.Fatalf("unexpected content score: %f", contentScore)
	}
	if difference := math.Abs(float64(cfScore) - 0.6); difference > 1e-6 {
		t.Fatalf("unexpected confidence-adjusted CF score: %f", cfScore)
	}
}

func TestHybridCosineDoesNotPromoteMissingCFToFullContent(t *testing.T) {
	t.Parallel()

	score, _, cfScore := hybridCosine(
		[]float32{1, 0},
		[]float32{1, 0},
		[]float32{1, 0},
		[]float32{0, 0},
		0.7,
	)
	expected := math.Sqrt(0.3)
	if difference := math.Abs(float64(score) - expected); difference > 1e-6 {
		t.Fatalf("unexpected missing-CF score: got %f, want %f", score, expected)
	}
	if cfScore != 0 {
		t.Fatalf("expected zero CF score, got %f", cfScore)
	}
}
