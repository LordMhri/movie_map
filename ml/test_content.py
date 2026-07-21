from unittest import TestCase

from content import movie_text
from ingest import Movie


class MovieTextTests(TestCase):
    def test_includes_enriched_archive_fields(self) -> None:
        text = movie_text(
            Movie(
                movie_id=2571,
                title="The Matrix",
                original_title="The Matrix",
                year=1999,
                genres=("Action", "Science Fiction"),
                overview="A hacker discovers the truth.",
                keywords=("simulation",),
                cast=("Keanu Reeves",),
                directors=("Lana Wachowski", "Lilly Wachowski"),
            )
        )

        self.assertIn("Plot: A hacker discovers the truth.", text)
        self.assertIn("Keywords: simulation.", text)
        self.assertIn("Cast: Keanu Reeves.", text)
        self.assertIn("Directed by: Lana Wachowski, Lilly Wachowski.", text)
