"""Artifact export shared by the Python pipeline and Go API."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np

from ingest import Movie


def export_artifacts(
    output_dir: Path,
    movies: list[Movie],
    content_vectors: np.ndarray,
    cf_vectors: np.ndarray,
    coordinates: np.ndarray,
    rating_counts: np.ndarray,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    if not (
        len(movies)
        == content_vectors.shape[0]
        == cf_vectors.shape[0]
        == coordinates.shape[0]
        == rating_counts.shape[0]
    ):
        raise ValueError("all exported artifacts must have the same movie count")

    vectors = np.concatenate((content_vectors, cf_vectors), axis=1).astype("<f4")
    vectors.tofile(output_dir / "vectors.f32")

    manifest = {
        "version": 1,
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
            """
        )
        connection.executemany(
            """
            INSERT INTO movies (
                id, vector_index, title, original_title, year, genres,
                rating_count, map_x, map_y
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                )
                for index, movie in enumerate(movies)
            ),
        )
        connection.commit()
    finally:
        connection.close()
