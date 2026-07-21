"""MovieLens 1M parsing and title normalization."""

from __future__ import annotations

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


def iter_ratings(path: Path, valid_movie_ids: set[int]) -> Iterator[Rating]:
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
