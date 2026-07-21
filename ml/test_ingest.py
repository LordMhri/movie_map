from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from ingest import load_movies, normalize_title


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
