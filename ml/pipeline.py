"""Build all v1 Movie Map artifacts."""

from __future__ import annotations

import argparse
from pathlib import Path

from collab import build_cf_vectors
from combine import build_map_coordinates, combine_vectors
from content import DEFAULT_MODEL, build_content_vectors
from export import export_artifacts
from ingest import load_movies


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=PROJECT_ROOT / "ml-1m")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "data")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--cf-dimensions", type=int, default=64)
    parser.add_argument("--cf-weight", type=float, default=0.7)
    parser.add_argument("--min-ratings", type=int, default=20)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    movies = load_movies(args.input / "movies.dat")
    print(f"Loaded {len(movies):,} movies")

    content_vectors = build_content_vectors(movies, model_name=args.model)
    print(f"Built {content_vectors.shape[1]}-dimensional content vectors")

    cf_vectors, rating_counts = build_cf_vectors(
        movies,
        args.input / "ratings.dat",
        dimensions=args.cf_dimensions,
        min_ratings=args.min_ratings,
    )
    print(f"Built {cf_vectors.shape[1]}-dimensional CF vectors")

    combined_vectors = combine_vectors(
        content_vectors,
        cf_vectors,
        cf_weight=args.cf_weight,
    )
    coordinates = build_map_coordinates(combined_vectors)

    export_artifacts(
        args.output,
        movies,
        content_vectors,
        cf_vectors,
        coordinates,
        rating_counts,
    )
    print(f"Wrote artifacts to {args.output}")


if __name__ == "__main__":
    main()
