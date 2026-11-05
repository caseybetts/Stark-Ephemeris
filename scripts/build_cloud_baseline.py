"""Build the 2004-2013 monthly ISCCP HGM Basic cloud climatology.

Install the build-only readers with ``python -m pip install netCDF4 numpy``.
Put the 120 source files in a directory and run:

    python scripts/build_cloud_baseline.py path/to/hgm-files

Each month is averaged across all ten years, ignoring source-masked values at
each grid cell. A single source file remains supported for a clearly marked
interim 12-month repeat, useful for validating orientation and output format.
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


def read_month(source: Path) -> np.ma.MaskedArray:
    match = re.search(r"\.GLOBAL\.(\d{4})\.(\d{2})\.", source.name)
    if not match:
        raise ValueError("Source filename must include .GLOBAL.YYYY.MM.")
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

        source_grid = np.ma.asarray(cloud[0, :, :], dtype=np.float64)

    valid = source_grid.compressed()
    if valid.size == 0 or not np.isfinite(valid).all() or valid.min() < 0 or valid.max() > 100:
        raise ValueError("Cloud cover values must be finite and between 0 and 100 percent")
    return source_grid


def load_climatology(source: Path) -> tuple[list[np.ndarray], list[dict[str, object]], list[int], list[int] | None]:
    if source.is_file():
        match = re.search(r"\.GLOBAL\.(\d{4})\.(\d{2})\.", source.name)
        assert match is not None
        source_month = f"{match.group(1)}-{match.group(2)}"
        source_grid = read_month(source)
        filled, imputed = fill_nearest(source_grid)
        runtime_grid = np.concatenate((filled[::-1, 180:], filled[::-1, :180]), axis=1)
        month = np.rint(runtime_grid).astype(np.uint8)
        records = [{
            "month": source_month,
            "file": source.name,
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
            "missingCells": imputed,
        }]
        return [month] * 12, records, [imputed] * 12, None

    if not source.is_dir():
        raise ValueError(f"Source path is not a file or directory: {source}")

    monthly_grids: list[np.ndarray] = []
    source_records: list[dict[str, object]] = []
    missing_by_month: list[int] = []
    minimum_valid_years: list[int] = []
    for month in range(1, 13):
        accum = np.zeros((ROWS, COLUMNS), dtype=np.float64)
        counts = np.zeros((ROWS, COLUMNS), dtype=np.uint8)
        for year in range(2004, 2014):
            source_month = f"{year:04d}-{month:02d}"
            candidates = sorted(source.glob(f"*.GLOBAL.{year:04d}.{month:02d}.*.nc"))
            if len(candidates) != 1:
                raise ValueError(f"Expected one HGM Basic file for {source_month}; found {len(candidates)}")
            path = candidates[0]
            values = read_month(path)
            valid = ~np.ma.getmaskarray(values)
            accum[valid] += np.asarray(values.data, dtype=np.float64)[valid]
            counts[valid] += 1
            source_records.append({
                "month": source_month,
                "file": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })

        mean = np.ma.array(accum / np.maximum(counts, 1), mask=counts == 0)
        filled, imputed = fill_nearest(mean)
        minimum_valid_years.append(int(counts.min()))
        runtime_grid = np.concatenate((filled[::-1, 180:], filled[::-1, :180]), axis=1)
        monthly_grids.append(np.rint(runtime_grid).astype(np.uint8))
        missing_by_month.append(imputed)
    return monthly_grids, source_records, missing_by_month, minimum_valid_years


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="directory of the 120 2004-2013 source files, or one interim monthly file")
    parser.add_argument("--output-dir", type=Path, default=Path("public/data/weather"))
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.exists():
        parser.error(f"source path does not exist: {source}")

    monthly_grids, source_records, missing_by_month, minimum_valid_years = load_climatology(source)
    table = np.concatenate([grid.ravel(order="C") for grid in monthly_grids])
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
        "years": [2004, 2013] if source.is_dir() else None,
        "baselineMethod": "cellwise mean of matching calendar months across 2004-2013; source-masked values excluded before averaging" if source.is_dir() else "single-month spatial snapshot repeated across all 12 calendar months (temporary prototype baseline)",
        "sourceFiles": source_records,
        "sourceAccessDate": datetime.now(timezone.utc).date().isoformat(),
        "minimumValidYearsPerGridCellByMonth": minimum_valid_years if source.is_dir() else None,
        "sourceUrl": SOURCE_URL,
        "doi": DOI,
        "grid": {"rows": ROWS, "columns": COLUMNS, "resolutionDegrees": 1, "rowOrder": "north-to-south", "longitude": "-180 to 180"},
        "missingCellsFilledByMonth": missing_by_month,
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
        "sourceMonths": len(source_records),
        "missingCellsFilledByMonth": missing_by_month,
        "baselineSha256": manifest["baselineSha256"],
        "metadata": str(metadata_path),
    }, indent=2))


if __name__ == "__main__":
    main()
