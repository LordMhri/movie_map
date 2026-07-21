"""Collaborative-filtering vectors built with truncated matrix factorization."""

from __future__ import annotations

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
    ratings = list(iter_ratings(ratings_path, set(movie_index)))
    user_ids = sorted({rating.user_id for rating in ratings})
    user_index = {user_id: index for index, user_id in enumerate(user_ids)}

    rows = np.fromiter(
        (user_index[rating.user_id] for rating in ratings), dtype=np.int32
    )
    columns = np.fromiter(
        (movie_index[rating.movie_id] for rating in ratings), dtype=np.int32
    )
    values = np.fromiter((rating.rating - 3.0 for rating in ratings), dtype=np.float32)

    matrix = coo_matrix(
        (values, (rows, columns)),
        shape=(len(user_ids), len(movies)),
        dtype=np.float32,
    ).tocsr()
    counts = np.bincount(columns, minlength=len(movies)).astype(np.int32)

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
