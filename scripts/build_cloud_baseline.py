"""Build the prototype cloud baseline from a single ISCCP HGM Basic month.

Install the build-only reader with ``python -m pip install netCDF4``, then run:

    python scripts/build_cloud_baseline.py ISCCP-Basic.HGM.v01r00.GLOBAL.2013.01.99.9999.GPC.10KM.CS00.EA1.00.nc

This interim asset repeats that month's spatial cloud map across all 12 calendar
months. Replace it with the selected 2004-2013 monthly climatology when source
retrieval is reliable.
"""

from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

import numpy as np
from netCDF4 import Dataset


ROWS = 180
COLUMNS = 360
TABLE_BYTES = 12 * ROWS * COLUMNS
SOURCE_URL = "https://www.ncei.noaa.gov/products/international-satellite-cloud-climatology"
DOI = "10.7289/V5QZ281S"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fill_nearest(masked: np.ma.MaskedArray) -> tuple[np.ndarray, int]:
    """Fill source-masked cells from the nearest valid 1-degree neighbor."""
    values = np.asarray(masked.filled(0), dtype=np.float64)
    missing = np.ma.getmaskarray(masked).copy()
    missing_count = int(missing.sum())
    if missing_count == 0:
        return values, 0
    if missing_count == values.size:
        raise ValueError("cldamt contains no valid cells")

    queue: deque[tuple[int, int]] = deque()
    visited = ~missing
    for row, column in np.argwhere(visited):
        queue.append((int(row), int(column)))

    # Fixed neighbor order and a row-major initial queue make ties reproducible.
    while queue:
        row, column = queue.popleft()
        for next_row, next_column in (
            (row - 1, column),
            (row, (column - 1) % COLUMNS),
            (row, (column + 1) % COLUMNS),
            (row + 1, column),
        ):
            if not 0 <= next_row < ROWS or visited[next_row, next_column]:
                continue
            values[next_row, next_column] = values[row, column]
            visited[next_row, next_column] = True
            queue.append((next_row, next_column))
    return values, missing_count


def load_month(source: Path) -> tuple[np.ndarray, str, int]:
    match = re.search(r"\.GLOBAL\.(\d{4})\.(\d{2})\.", source.name)
    if not match:
        raise ValueError("Source filename must include .GLOBAL.YYYY.MM.")
    source_month = f"{match.group(1)}-{match.group(2)}"

    with Dataset(source, "r") as dataset:
        if "cldamt" not in dataset.variables or "lat" not in dataset.variables or "lon" not in dataset.variables:
            raise ValueError("Source must contain cldamt, lat, and lon variables")
        cloud = dataset.variables["cldamt"]
        if cloud.dimensions != ("time", "lat", "lon") or cloud.shape != (1, ROWS, COLUMNS):
            raise ValueError(f"Unexpected cldamt layout: {cloud.dimensions} {cloud.shape}")
        if str(getattr(cloud, "units", "")).lower() != "percent":
            raise ValueError(f"Expected cldamt in percent, got {getattr(cloud, 'units', None)!r}")

        latitude = np.asarray(dataset.variables["lat"][:], dtype=np.float64)
        longitude = np.asarray(dataset.variables["lon"][:], dtype=np.float64)
        if not np.allclose(latitude, np.arange(-89.5, 90, 1)):
            raise ValueError("Unexpected latitude centers or order")
        if not np.allclose(longitude, np.arange(0.5, 360, 1)):
            raise ValueError("Unexpected longitude centers or order")

        source_grid, imputed = fill_nearest(cloud[0, :, :])

    if not np.isfinite(source_grid).all() or source_grid.min() < 0 or source_grid.max() > 100:
        raise ValueError("Cloud cover values must be finite and between 0 and 100 percent")

    # Runtime cell order is north-to-south and -180..180 longitude.
    runtime_grid = np.concatenate((source_grid[::-1, 180:], source_grid[::-1, :180]), axis=1)
    return np.rint(runtime_grid).astype(np.uint8), source_month, imputed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="one global monthly ISCCP HGM Basic NetCDF file")
    parser.add_argument("--output-dir", type=Path, default=Path("public/data/weather"))
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_file():
        parser.error(f"source file does not exist: {source}")

    grid, source_month, imputed = load_month(source)
    table = np.tile(grid.ravel(order="C"), 12)
    if table.size != TABLE_BYTES:
        raise ValueError(f"Generated {table.size} values; expected {TABLE_BYTES}")

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    table_path = output_dir / "cloud-baseline.bin"
    table.tofile(table_path)

    manifest = {
        "version": 1,
        "product": "NOAA/NCEI ISCCP-H HGM Basic",
        "productVersion": "v01r00 Basic",
        "variable": "cldamt",
        "units": "whole percentage points",
        "sourceMonth": source_month,
        "baselineMethod": "single-month spatial snapshot repeated across all 12 calendar months (temporary prototype baseline)",
        "selectedClimatologyTarget": "2004-2013 monthly means; not yet built",
        "sourceFile": source.name,
        "sourceBytes": source.stat().st_size,
        "sourceSha256": sha256(source),
        "sourceUrl": SOURCE_URL,
        "doi": DOI,
        "grid": {"rows": ROWS, "columns": COLUMNS, "resolutionDegrees": 1, "rowOrder": "north-to-south", "longitude": "-180 to 180"},
        "missingSourceCells": imputed,
        "missingCellMethod": "nearest valid 1-degree neighbor; deterministic row-major tie break",
        "baselineSha256": sha256(table_path),
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "citation": "Hankins, B.; NOAA Climate Data Record Program (2016): International Satellite Cloud Climatology Project Climate Data Record, H-Series. NOAA National Centers for Environmental Information. https://doi.org/10.7289/V5QZ281S",
    }
    metadata_path = output_dir / "cloud-baseline.json"
    metadata_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "baseline": str(table_path),
        "bytes": table_path.stat().st_size,
        "sourceMonth": source_month,
        "sourceMissingCellsImputed": imputed,
        "baselineSha256": manifest["baselineSha256"],
        "metadata": str(metadata_path),
    }, indent=2))


if __name__ == "__main__":
    main()
