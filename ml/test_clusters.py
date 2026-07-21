from unittest import TestCase

import numpy as np

from clusters import build_cluster_hierarchy, build_local_edges
from ingest import Movie


class ClusterHierarchyTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        generator = np.random.default_rng(7)
        centers = np.asarray(
            [
                [-4.0, 0.0, 0.0, 0.0],
                [0.0, 4.0, 0.0, 0.0],
                [4.0, 0.0, 0.0, 0.0],
            ],
            dtype=np.float32,
        )
        cls.vectors = np.concatenate(
            [center + generator.normal(0, 0.3, (40, 4)) for center in centers]
        ).astype(np.float32)
        cls.coordinates = cls.vectors[:, :2].copy()
        genres = ("Comedy", "Horror", "Drama")
        cls.movies = [
            Movie(
                movie_id=index + 1,
                title=f"Movie {index + 1}",
                original_title=f"Movie {index + 1} (1995)",
                year=1995 + index % 5,
                genres=(genres[index // 40],),
            )
            for index in range(120)
        ]

    def test_builds_complete_deterministic_hierarchy(self) -> None:
        first_clusters, first_assignments = build_cluster_hierarchy(
            self.movies,
            self.vectors,
            self.coordinates,
            broad_cluster_count=3,
            children_per_cluster=2,
            minimum_child_size=10,
        )
        second_clusters, second_assignments = build_cluster_hierarchy(
            self.movies,
            self.vectors,
            self.coordinates,
            broad_cluster_count=3,
            children_per_cluster=2,
            minimum_child_size=10,
        )

        self.assertEqual(first_clusters, second_clusters)
        np.testing.assert_array_equal(first_assignments, second_assignments)
        self.assertTrue(np.all(first_assignments[:, 0] == 0))
        self.assertTrue(np.all(first_assignments[:, 1] > 0))
        self.assertTrue(np.all(first_assignments[:, 2] > 0))

        by_id = {cluster.cluster_id: cluster for cluster in first_clusters}
        for broad_id, child_id in first_assignments[:, 1:]:
            self.assertEqual(by_id[int(child_id)].parent_id, int(broad_id))

        broad_labels = {
            cluster.label for cluster in first_clusters if cluster.level == 1
        }
        self.assertEqual(broad_labels, {"Comedy", "Drama", "Horror"})

    def test_local_edges_stay_inside_child_clusters(self) -> None:
        _, assignments = build_cluster_hierarchy(
            self.movies,
            self.vectors,
            self.coordinates,
            broad_cluster_count=3,
            children_per_cluster=2,
            minimum_child_size=10,
        )

        edges = build_local_edges(
            self.vectors,
            assignments[:, 2],
            neighbors_per_movie=3,
        )

        self.assertGreater(len(edges), len(self.movies))
        self.assertEqual(
            len(edges),
            len({(edge.source_index, edge.target_index) for edge in edges}),
        )
        for edge in edges:
            self.assertEqual(
                assignments[edge.source_index, 2],
                assignments[edge.target_index, 2],
            )
            self.assertGreater(edge.score, 0)
