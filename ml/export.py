"""Artifact export shared by the Python pipeline and Go API."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np

from clusters import Cluster, MapEdge
from ingest import Movie


def export_artifacts(
    output_dir: Path,
    movies: list[Movie],
    content_vectors: np.ndarray,
    cf_vectors: np.ndarray,
    coordinates: np.ndarray,
    rating_counts: np.ndarray,
    clusters: list[Cluster],
    cluster_assignments: np.ndarray,
    map_edges: list[MapEdge],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    if not (
        len(movies)
        == content_vectors.shape[0]
        == cf_vectors.shape[0]
        == coordinates.shape[0]
        == rating_counts.shape[0]
        == cluster_assignments.shape[0]
    ):
        raise ValueError("all exported artifacts must have the same movie count")
    if cluster_assignments.shape[1] != 3:
        raise ValueError("cluster assignments must contain levels 0, 1, and 2")

    vectors = np.concatenate((content_vectors, cf_vectors), axis=1).astype("<f4")
    vectors.tofile(output_dir / "vectors.f32")

    manifest = {
        "version": 2,
        "movie_count": len(movies),
        "content_dimensions": int(content_vectors.shape[1]),
        "cf_dimensions": int(cf_vectors.shape[1]),
        "vector_file": "vectors.f32",
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    database_path = output_dir / "movies.db"
    database_path.unlink(missing_ok=True)
    connection = sqlite3.connect(database_path)
    try:
        connection.executescript(
            """
            CREATE TABLE movies (
                id INTEGER PRIMARY KEY,
                vector_index INTEGER NOT NULL UNIQUE,
                title TEXT NOT NULL,
                original_title TEXT NOT NULL,
                year INTEGER,
                genres TEXT NOT NULL,
                rating_count INTEGER NOT NULL,
                map_x REAL NOT NULL,
                map_y REAL NOT NULL,
                source TEXT NOT NULL DEFAULT 'movielens-1m'
            );
            CREATE INDEX movies_title_idx ON movies(title COLLATE NOCASE);

            CREATE TABLE clusters (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER REFERENCES clusters(id),
                level INTEGER NOT NULL,
                label TEXT NOT NULL,
                center_x REAL NOT NULL,
                center_y REAL NOT NULL,
                radius REAL NOT NULL,
                movie_count INTEGER NOT NULL
            );
            CREATE INDEX clusters_level_idx ON clusters(level);

            CREATE TABLE movie_clusters (
                movie_id INTEGER NOT NULL REFERENCES movies(id),
                level INTEGER NOT NULL,
                cluster_id INTEGER NOT NULL REFERENCES clusters(id),
                PRIMARY KEY (movie_id, level)
            );
            CREATE INDEX movie_clusters_cluster_idx
                ON movie_clusters(cluster_id);

            CREATE TABLE map_edges (
                source_id INTEGER NOT NULL REFERENCES movies(id),
                target_id INTEGER NOT NULL REFERENCES movies(id),
                score REAL NOT NULL,
                PRIMARY KEY (source_id, target_id)
            );
            """
        )
        connection.executemany(
            """
            INSERT INTO movies (
                id, vector_index, title, original_title, year, genres,
                rating_count, map_x, map_y, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (
                    movie.movie_id,
                    index,
                    movie.title,
                    movie.original_title,
                    movie.year,
                    "|".join(movie.genres),
                    int(rating_counts[index]),
                    float(coordinates[index, 0]),
                    float(coordinates[index, 1]),
                    movie.source,
                )
                for index, movie in enumerate(movies)
            ),
        )
        connection.executemany(
            """
            INSERT INTO clusters (
                id, parent_id, level, label, center_x, center_y, radius, movie_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (
                    cluster.cluster_id,
                    cluster.parent_id,
                    cluster.level,
                    cluster.label,
                    cluster.center_x,
                    cluster.center_y,
                    cluster.radius,
                    cluster.movie_count,
                )
                for cluster in clusters
            ),
        )
        connection.executemany(
            """
            INSERT INTO movie_clusters (movie_id, level, cluster_id)
            VALUES (?, ?, ?)
            """,
            (
                (movie.movie_id, level, int(cluster_assignments[index, level]))
                for index, movie in enumerate(movies)
                for level in range(cluster_assignments.shape[1])
            ),
        )
        connection.executemany(
            """
            INSERT INTO map_edges (source_id, target_id, score)
            VALUES (?, ?, ?)
            """,
            (
                (
                    movies[edge.source_index].movie_id,
                    movies[edge.target_index].movie_id,
                    edge.score,
                )
                for edge in map_edges
            ),
        )
        connection.commit()
    finally:
        connection.close()
