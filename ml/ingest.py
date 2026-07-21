"""MovieLens and Kaggle movie-data parsing."""

from __future__ import annotations

import ast
import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


TITLE_YEAR = re.compile(r"^(?P<title>.*?)(?: \((?P<year>\d{4})\))?$")
TRAILING_ARTICLE = re.compile(r"^(?P<title>.+), (?P<article>The|A|An)$", re.IGNORECASE)


@dataclass(frozen=True)
class Movie:
    movie_id: int
    title: str
    original_title: str
    year: int | None
    genres: tuple[str, ...]
    overview: str = ""
    keywords: tuple[str, ...] = ()
    cast: tuple[str, ...] = ()
    directors: tuple[str, ...] = ()
    source: str = "movielens-1m"


@dataclass(frozen=True)
class Rating:
    user_id: int
    movie_id: int
    rating: float
    timestamp: int


def normalize_title(raw_title: str) -> tuple[str, int | None]:
    match = TITLE_YEAR.match(raw_title.strip())
    if match is None:
        return raw_title.strip(), None

    title = match.group("title").strip()
    article_match = TRAILING_ARTICLE.match(title)
    if article_match:
        title = f"{article_match.group('article')} {article_match.group('title')}"

    year_text = match.group("year")
    return title, int(year_text) if year_text else None


def load_movies(path: Path) -> list[Movie]:
    movies: list[Movie] = []
    seen_ids: set[int] = set()

    with path.open("r", encoding="latin-1") as source:
        for line_number, line in enumerate(source, start=1):
            parts = line.rstrip("\n").split("::")
            if len(parts) != 3:
                raise ValueError(f"{path}:{line_number}: expected 3 fields")

            movie_id = int(parts[0])
            if movie_id in seen_ids:
                continue

            title, year = normalize_title(parts[1])
            if not title:
                continue

            seen_ids.add(movie_id)
            movies.append(
                Movie(
                    movie_id=movie_id,
                    title=title,
                    original_title=parts[1],
                    year=year,
                    genres=tuple(genre for genre in parts[2].split("|") if genre),
                )
            )

    return movies


def load_archive_movies(archive_dir: Path) -> list[Movie]:
    """Load the linked Kaggle catalog while retaining MovieLens movie IDs."""
    movie_ids_by_tmdb_id: dict[int, int] = {}
    with (archive_dir / "links.csv").open("r", encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            movie_id = _parse_int(row.get("movieId"))
            tmdb_id = _parse_int(row.get("tmdbId"))
            if movie_id is not None and tmdb_id is not None:
                movie_ids_by_tmdb_id.setdefault(tmdb_id, movie_id)

    keywords_by_tmdb_id: dict[int, tuple[str, ...]] = {}
    with (archive_dir / "keywords.csv").open(
        "r", encoding="utf-8", newline=""
    ) as source:
        for row in csv.DictReader(source):
            tmdb_id = _parse_int(row.get("id"))
            if tmdb_id is not None and tmdb_id in movie_ids_by_tmdb_id:
                keywords_by_tmdb_id.setdefault(
                    tmdb_id, _literal_names(row.get("keywords"), limit=20)
                )

    credits_by_tmdb_id: dict[int, tuple[tuple[str, ...], tuple[str, ...]]] = {}
    with (archive_dir / "credits.csv").open(
        "r", encoding="utf-8", newline=""
    ) as source:
        for row in csv.DictReader(source):
            tmdb_id = _parse_int(row.get("id"))
            if tmdb_id is None or tmdb_id not in movie_ids_by_tmdb_id:
                continue
            cast = _literal_names(row.get("cast"), limit=8)
            directors = _literal_names(
                row.get("crew"), limit=3, required_job="Director"
            )
            credits_by_tmdb_id.setdefault(tmdb_id, (cast, directors))

    movies: list[Movie] = []
    seen_movie_ids: set[int] = set()
    with (archive_dir / "movies_metadata.csv").open(
        "r", encoding="utf-8", newline=""
    ) as source:
        for row in csv.DictReader(source):
            tmdb_id = _parse_int(row.get("id"))
            if tmdb_id is None:
                continue
            movie_id = movie_ids_by_tmdb_id.get(tmdb_id)
            if movie_id is None or movie_id in seen_movie_ids:
                continue

            title = (row.get("title") or row.get("original_title") or "").strip()
            if not title:
                continue
            release_date = (row.get("release_date") or "").strip()
            year = (
                int(release_date[:4])
                if len(release_date) >= 4 and release_date[:4].isdigit()
                else None
            )
            cast, directors = credits_by_tmdb_id.get(tmdb_id, ((), ()))
            movies.append(
                Movie(
                    movie_id=movie_id,
                    title=title,
                    original_title=(
                        row.get("original_title") or row.get("title") or title
                    ).strip(),
                    year=year,
                    genres=_literal_names(row.get("genres")),
                    overview=(row.get("overview") or "").strip(),
                    keywords=keywords_by_tmdb_id.get(tmdb_id, ()),
                    cast=cast,
                    directors=directors,
                    source="kaggle-the-movies-dataset",
                )
            )
            seen_movie_ids.add(movie_id)

    movies.sort(key=lambda movie: movie.movie_id)
    return movies


def iter_ratings(path: Path, valid_movie_ids: set[int]) -> Iterator[Rating]:
    if path.suffix.lower() == ".csv":
        yield from iter_csv_ratings(path, valid_movie_ids)
        return

    with path.open("r", encoding="ascii") as source:
        for line_number, line in enumerate(source, start=1):
            parts = line.rstrip("\n").split("::")
            if len(parts) != 4:
                raise ValueError(f"{path}:{line_number}: expected 4 fields")

            movie_id = int(parts[1])
            if movie_id not in valid_movie_ids:
                continue

            rating = float(parts[2])
            if not 1 <= rating <= 5:
                continue

            yield Rating(
                user_id=int(parts[0]),
                movie_id=movie_id,
                rating=rating,
                timestamp=int(parts[3]),
            )


def iter_csv_ratings(path: Path, valid_movie_ids: set[int]) -> Iterator[Rating]:
    with path.open("r", encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            movie_id = _parse_int(row.get("movieId"))
            user_id = _parse_int(row.get("userId"))
            timestamp = _parse_int(row.get("timestamp"))
            if (
                movie_id is None
                or movie_id not in valid_movie_ids
                or user_id is None
                or timestamp is None
            ):
                continue
            try:
                rating = float(row.get("rating", ""))
            except (TypeError, ValueError):
                continue
            if not 0.5 <= rating <= 5:
                continue
            yield Rating(
                user_id=user_id,
                movie_id=movie_id,
                rating=rating,
                timestamp=timestamp,
            )


def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        number = float(value.strip())
    except (TypeError, ValueError):
        return None
    if not number.is_integer():
        return None
    return int(number)


def _literal_names(
    value: str | None,
    limit: int | None = None,
    required_job: str | None = None,
) -> tuple[str, ...]:
    if not value:
        return ()
    try:
        records = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return ()
    if not isinstance(records, list):
        return ()

    names: list[str] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        if required_job is not None and record.get("job") != required_job:
            continue
        name = record.get("name")
        if isinstance(name, str) and name.strip() and name.strip() not in names:
            names.append(name.strip())
            if limit is not None and len(names) >= limit:
                break
    return tuple(names)
