"""Build Movie Map artifacts from the linked Kaggle movie catalog."""

from __future__ import annotations

import argparse
from pathlib import Path

from collab import build_cf_vectors
from combine import build_map_coordinates
from clusters import build_cluster_hierarchy, build_local_edges
from content import DEFAULT_MODEL, build_content_vectors
from export import export_artifacts
from ingest import load_archive_movies


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive-dir", type=Path, default=PROJECT_ROOT / "archive"
    )
    parser.add_argument(
        "--ratings",
        type=Path,
        help="ratings CSV (defaults to <archive-dir>/ratings.csv)",
    )
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "data")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--cf-dimensions", type=int, default=64)
    parser.add_argument("--min-ratings", type=int, default=20)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ratings_path = args.ratings or args.archive_dir / "ratings.csv"
    movies = load_archive_movies(args.archive_dir)
    print(f"Loaded {len(movies):,} movies")

    content_vectors = build_content_vectors(movies, model_name=args.model)
    print(f"Built {content_vectors.shape[1]}-dimensional content vectors")

    cf_vectors, rating_counts = build_cf_vectors(
        movies,
        ratings_path,
        dimensions=args.cf_dimensions,
        min_ratings=args.min_ratings,
    )
    print(f"Built {cf_vectors.shape[1]}-dimensional CF vectors")

    coordinates = build_map_coordinates(content_vectors)
    clusters, cluster_assignments = build_cluster_hierarchy(
        movies,
        content_vectors,
        coordinates,
    )
    map_edges = build_local_edges(
        content_vectors,
        cluster_assignments[:, 2],
    )
    print(f"Built {len(clusters):,} map regions and {len(map_edges):,} local edges")

    export_artifacts(
        args.output,
        movies,
        content_vectors,
        cf_vectors,
        coordinates,
        rating_counts,
        clusters,
        cluster_assignments,
        map_edges,
    )
    print(f"Wrote artifacts to {args.output}")


if __name__ == "__main__":
    main()
