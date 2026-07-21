"""Hybrid vectors and stable two-dimensional map coordinates."""

from __future__ import annotations

import numpy as np

from content import normalize_rows


def combine_vectors(
    content_vectors: np.ndarray,
    cf_vectors: np.ndarray,
    cf_weight: float = 0.7,
) -> np.ndarray:
    if content_vectors.shape[0] != cf_vectors.shape[0]:
        raise ValueError("content and CF vectors must have the same row count")
    if not 0 <= cf_weight <= 1:
        raise ValueError("cf_weight must be between 0 and 1")

    content_scale = np.sqrt(1.0 - cf_weight)
    cf_scale = np.sqrt(cf_weight)
    return normalize_rows(
        np.concatenate(
            (content_vectors * content_scale, cf_vectors * cf_scale),
            axis=1,
        )
    )


def build_map_coordinates(
    combined_vectors: np.ndarray,
    neighbors: int = 30,
    min_distance: float = 0.12,
    random_state: int = 42,
) -> np.ndarray:
    try:
        import umap
    except ImportError as exc:
        raise RuntimeError(
            "umap-learn is required; install ml/requirements.txt first"
        ) from exc

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=neighbors,
        min_dist=min_distance,
        metric="cosine",
        random_state=random_state,
    )
    coordinates = reducer.fit_transform(combined_vectors)
    return np.asarray(coordinates, dtype=np.float32)
