"""Regression checks for inclusive coastal/island rasterization, using synthetic geography."""
import unittest
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin


class LandIntersectionTests(unittest.TestCase):
    def mask(self, polygon):
        return rasterize([(polygon, 1)], out_shape=(4, 4),
                         transform=from_origin(0, 1, 0.25, 0.25), all_touched=True, dtype="uint8")

    def test_tiny_island_away_from_cell_center_survives(self):
        mask = self.mask({"type": "Polygon", "coordinates": [[[0.01, .99], [.02, .99], [.02, .98], [.01, .98], [.01, .99]]]})
        self.assertEqual(mask[0, 0], 1)
        self.assertEqual(int(mask.sum()), 1)

    def test_coastal_sliver_selects_every_intersected_cell(self):
        mask = self.mask({"type": "Polygon", "coordinates": [[[.24, .99], [.26, .99], [.26, .01], [.24, .01], [.24, .99]]]})
        np.testing.assert_array_equal(mask[:, :2], np.ones((4, 2)))
        self.assertEqual(int(mask[:, 2:].sum()), 0)


if __name__ == "__main__":
    unittest.main()
