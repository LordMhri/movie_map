"""Hierarchical map regions and a sparse local-neighbor graph."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np

from ingest import Movie


@dataclass(frozen=True)
class Cluster:
    cluster_id: int
    parent_id: int | None
    level: int
    label: str
    center_x: float
    center_y: float
    radius: float
    movie_count: int


@dataclass(frozen=True)
class MapEdge:
    source_index: int
    target_index: int
    score: float


def build_cluster_hierarchy(
    movies: list[Movie],
    vectors: np.ndarray,
    coordinates: np.ndarray,
    broad_cluster_count: int = 12,
    children_per_cluster: int = 4,
    minimum_child_size: int = 35,
    random_state: int = 42,
) -> tuple[list[Cluster], np.ndarray]:
    """Return cluster metadata and level assignments for every movie."""
    try:
        from sklearn.cluster import KMeans
    except ImportError as exc:
        raise RuntimeError(
            "scikit-learn is required; install ml/requirements.txt first"
        ) from exc

    movie_count = len(movies)
    if vectors.shape[0] != movie_count or coordinates.shape != (movie_count, 2):
        raise ValueError("movies, vectors, and coordinates must have matching rows")
    if movie_count == 0:
        return [], np.empty((0, 3), dtype=np.int32)

    assignments = np.zeros((movie_count, 3), dtype=np.int32)
    clusters = [
        _cluster_record(
            cluster_id=0,
            parent_id=None,
            level=0,
            label="All movies",
            indices=np.arange(movie_count),
            coordinates=coordinates,
        )
    ]

    broad_count = max(1, min(broad_cluster_count, movie_count))
    broad_raw = KMeans(
        n_clusters=broad_count,
        n_init=10,
        random_state=random_state,
    ).fit_predict(vectors)
    broad_groups = _spatially_sorted_groups(broad_raw, coordinates)
    used_broad_labels: set[str] = set()
    next_cluster_id = 1

    for broad_order, indices in enumerate(broad_groups):
        broad_id = next_cluster_id
        next_cluster_id += 1
        assignments[indices, 1] = broad_id
        broad_label = _genre_label(
            movies,
            indices,
            used_labels=used_broad_labels,
            maximum_genres=2,
        )
        used_broad_labels.add(broad_label)
        clusters.append(
            _cluster_record(
                cluster_id=broad_id,
                parent_id=0,
                level=1,
                label=broad_label,
                indices=indices,
                coordinates=coordinates,
            )
        )

        child_count = min(
            children_per_cluster,
            max(1, len(indices) // minimum_child_size),
        )
        if child_count == 1:
            child_groups = [indices]
        else:
            child_raw = KMeans(
                n_clusters=child_count,
                n_init=10,
                random_state=random_state + broad_order + 1,
            ).fit_predict(vectors[indices])
            child_groups = [
                indices[group]
                for group in _spatially_sorted_groups(
                    child_raw,
                    coordinates[indices],
                    return_positions=True,
                )
            ]

        used_child_labels: set[str] = set()
        for child_indices in child_groups:
            child_id = next_cluster_id
            next_cluster_id += 1
            assignments[child_indices, 2] = child_id
            child_label = _genre_label(
                movies,
                child_indices,
                used_labels=used_child_labels,
                maximum_genres=2,
            )
            if child_label == broad_label:
                child_label = _add_decade(child_label, movies, child_indices)
            used_child_labels.add(child_label)
            clusters.append(
                _cluster_record(
                    cluster_id=child_id,
                    parent_id=broad_id,
                    level=2,
                    label=child_label,
                    indices=child_indices,
                    coordinates=coordinates,
                )
            )

    return clusters, assignments


def build_local_edges(
    vectors: np.ndarray,
    child_assignments: np.ndarray,
    neighbors_per_movie: int = 4,
) -> list[MapEdge]:
    """Build undirected nearest-neighbor edges inside each child cluster."""
    try:
        from sklearn.neighbors import NearestNeighbors
    except ImportError as exc:
        raise RuntimeError(
            "scikit-learn is required; install ml/requirements.txt first"
        ) from exc

    if vectors.shape[0] != child_assignments.shape[0]:
        raise ValueError("vectors and assignments must have matching rows")

    edges: dict[tuple[int, int], float] = {}
    for cluster_id in np.unique(child_assignments):
        indices = np.flatnonzero(child_assignments == cluster_id)
        if len(indices) < 2:
            continue
        neighbor_count = min(neighbors_per_movie + 1, len(indices))
        model = NearestNeighbors(n_neighbors=neighbor_count, metric="cosine")
        model.fit(vectors[indices])
        distances, neighbors = model.kneighbors(vectors[indices])

        for local_source, (row_distances, row_neighbors) in enumerate(
            zip(distances, neighbors, strict=True)
        ):
            source = int(indices[local_source])
            for distance, local_target in zip(
                row_distances[1:],
                row_neighbors[1:],
                strict=True,
            ):
                target = int(indices[local_target])
                key = (min(source, target), max(source, target))
                edges[key] = max(edges.get(key, 0.0), float(1.0 - distance))

    return [
        MapEdge(source_index=source, target_index=target, score=score)
        for (source, target), score in sorted(edges.items())
    ]


def _spatially_sorted_groups(
    labels: np.ndarray,
    coordinates: np.ndarray,
    return_positions: bool = False,
) -> list[np.ndarray]:
    groups = [np.flatnonzero(labels == label) for label in np.unique(labels)]
    groups.sort(
        key=lambda positions: (
            float(coordinates[positions, 0].mean()),
            float(coordinates[positions, 1].mean()),
        )
    )
    if return_positions:
        return groups
    return groups


def _cluster_record(
    cluster_id: int,
    parent_id: int | None,
    level: int,
    label: str,
    indices: np.ndarray,
    coordinates: np.ndarray,
) -> Cluster:
    points = coordinates[indices]
    center = points.mean(axis=0)
    radius = np.linalg.norm(points - center, axis=1).max(initial=0)
    return Cluster(
        cluster_id=cluster_id,
        parent_id=parent_id,
        level=level,
        label=label,
        center_x=float(center[0]),
        center_y=float(center[1]),
        radius=float(radius),
        movie_count=len(indices),
    )


def _genre_label(
    movies: list[Movie],
    indices: np.ndarray,
    used_labels: set[str],
    maximum_genres: int,
) -> str:
    counts = Counter(
        genre
        for index in indices
        for genre in movies[int(index)].genres
        if genre != "Unknown"
    )
    ranked = [genre for genre, _ in counts.most_common(maximum_genres + 1)]
    if not ranked:
        return "Unclassified"

    for width in range(1, min(maximum_genres, len(ranked)) + 1):
        label = " · ".join(ranked[:width])
        if label not in used_labels:
            return label
    return " · ".join(ranked[:maximum_genres])


def _add_decade(label: str, movies: list[Movie], indices: np.ndarray) -> str:
    years = sorted(
        movies[int(index)].year
        for index in indices
        if movies[int(index)].year is not None
    )
    if not years:
        return f"{label} · Other"
    decade = (years[len(years) // 2] // 10) * 10
    return f"{label} · {decade}s"
