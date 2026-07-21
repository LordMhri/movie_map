import csv
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from ingest import iter_ratings, load_archive_movies, load_movies, normalize_title


class NormalizeTitleTests(TestCase):
    def test_extracts_year_and_uninverts_article(self) -> None:
        self.assertEqual(normalize_title("Matrix, The (1999)"), ("The Matrix", 1999))
        self.assertEqual(
            normalize_title("American in Paris, An (1951)"),
            ("An American in Paris", 1951),
        )

    def test_handles_title_without_year(self) -> None:
        self.assertEqual(normalize_title("Unknown"), ("Unknown", None))


class LoadMoviesTests(TestCase):
    def test_reads_latin_1_and_skips_duplicate_ids(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "movies.dat"
            path.write_bytes(
                "1::Amélie (2001)::Comedy|Romance\n"
                "1::Duplicate (2001)::Drama\n".encode("latin-1")
            )

            movies = load_movies(path)

        self.assertEqual(len(movies), 1)
        self.assertEqual(movies[0].title, "Amélie")
        self.assertEqual(movies[0].genres, ("Comedy", "Romance"))


class LoadArchiveMoviesTests(TestCase):
    def test_joins_metadata_keywords_and_credits_using_tmdb_id(self) -> None:
        with TemporaryDirectory() as directory:
            archive = Path(directory)
            _write_csv(
                archive / "links.csv",
                ["movieId", "imdbId", "tmdbId"],
                [{"movieId": 2571, "imdbId": "0133093", "tmdbId": 603}],
            )
            _write_csv(
                archive / "movies_metadata.csv",
                ["id", "title", "original_title", "release_date", "genres", "overview"],
                [
                    {
                        "id": 603,
                        "title": "The Matrix",
                        "original_title": "The Matrix",
                        "release_date": "1999-03-30",
                        "genres": "[{'id': 28, 'name': 'Action'}]",
                        "overview": "A hacker discovers the truth.",
                    }
                ],
            )
            _write_csv(
                archive / "keywords.csv",
                ["id", "keywords"],
                [{"id": 603, "keywords": "[{'id': 1, 'name': 'simulation'}]"}],
            )
            _write_csv(
                archive / "credits.csv",
                ["id", "cast", "crew"],
                [
                    {
                        "id": 603,
                        "cast": "[{'name': 'Keanu Reeves'}]",
                        "crew": "[{'job': 'Director', 'name': 'Lana Wachowski'}]",
                    }
                ],
            )

            movies = load_archive_movies(archive)

        self.assertEqual(len(movies), 1)
        self.assertEqual(movies[0].movie_id, 2571)
        self.assertEqual(movies[0].genres, ("Action",))
        self.assertEqual(movies[0].keywords, ("simulation",))
        self.assertEqual(movies[0].cast, ("Keanu Reeves",))
        self.assertEqual(movies[0].directors, ("Lana Wachowski",))

    def test_reads_half_star_csv_ratings_and_filters_unknown_movies(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "ratings.csv"
            _write_csv(
                path,
                ["userId", "movieId", "rating", "timestamp"],
                [
                    {"userId": 1, "movieId": 10, "rating": 0.5, "timestamp": 1},
                    {"userId": 1, "movieId": 11, "rating": 4.0, "timestamp": 2},
                ],
            )

            ratings = list(iter_ratings(path, {10}))

        self.assertEqual(len(ratings), 1)
        self.assertEqual(ratings[0].rating, 0.5)


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
