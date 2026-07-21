"""Collaborative-filtering vectors built with truncated matrix factorization."""

from __future__ import annotations

from array import array
from pathlib import Path

import numpy as np

from content import normalize_rows
from ingest import Movie, iter_ratings


def build_cf_vectors(
    movies: list[Movie],
    ratings_path: Path,
    dimensions: int = 64,
    min_ratings: int = 20,
    shrinkage: float = 25.0,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    try:
        from scipy.sparse import coo_matrix
        from sklearn.decomposition import TruncatedSVD
    except ImportError as exc:
        raise RuntimeError(
            "scipy and scikit-learn are required; install ml/requirements.txt first"
        ) from exc

    movie_index = {movie.movie_id: index for index, movie in enumerate(movies)}
    row_buffer = array("i")
    column_buffer = array("i")
    value_buffer = array("f")
    maximum_user_id = 0
    for rating in iter_ratings(ratings_path, set(movie_index)):
        row_buffer.append(rating.user_id)
        column_buffer.append(movie_index[rating.movie_id])
        value_buffer.append(rating.rating - 3.0)
        maximum_user_id = max(maximum_user_id, rating.user_id)

    columns = np.frombuffer(column_buffer, dtype=np.int32)
    counts = np.bincount(columns, minlength=len(movies)).astype(np.int32)
    if not row_buffer:
        return np.zeros((len(movies), dimensions), dtype=np.float32), counts

    rows = np.frombuffer(row_buffer, dtype=np.int32)
    values = np.frombuffer(value_buffer, dtype=np.float32)

    matrix = coo_matrix(
        (values, (rows, columns)),
        shape=(maximum_user_id + 1, len(movies)),
        dtype=np.float32,
    ).tocsr()

    component_count = min(dimensions, min(matrix.shape) - 1)
    factorizer = TruncatedSVD(
        n_components=component_count,
        n_iter=7,
        random_state=random_state,
    )
    factorizer.fit(matrix)

    vectors = factorizer.components_.T * np.sqrt(factorizer.singular_values_)
    vectors = normalize_rows(vectors)

    confidence = counts.astype(np.float32) / (counts + shrinkage)
    confidence[counts < min_ratings] = 0
    vectors *= confidence[:, None]
    return vectors.astype(np.float32), counts
