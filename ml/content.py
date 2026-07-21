"""Content text construction and semantic embedding."""

from __future__ import annotations

import numpy as np

from ingest import Movie


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def movie_text(movie: Movie) -> str:
    year = f" Release year: {movie.year}." if movie.year else ""
    genres = ", ".join(movie.genres)
    return f"Title: {movie.title}.{year} Genres: {genres}."


def normalize_rows(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return np.divide(vectors, norms, out=np.zeros_like(vectors), where=norms > 0)


def build_content_vectors(
    movies: list[Movie],
    model_name: str = DEFAULT_MODEL,
    batch_size: int = 64,
) -> np.ndarray:
    try:
        from fastembed import TextEmbedding
    except ImportError as exc:
        raise RuntimeError(
            "fastembed is required; install ml/requirements.txt first"
        ) from exc

    model = TextEmbedding(model_name=model_name)
    vectors = np.asarray(
        list(
            model.embed(
                [movie_text(movie) for movie in movies],
                batch_size=batch_size,
                parallel=0,
            )
        ),
        dtype=np.float32,
    )
    return normalize_rows(vectors)
