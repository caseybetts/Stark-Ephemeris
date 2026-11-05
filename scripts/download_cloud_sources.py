"""Download the selected 2004-2013 ISCCP HGM Basic monthly source files."""

from __future__ import annotations

import argparse
from pathlib import Path
import urllib.error
import urllib.request


BASE_URL = (
    "https://www.ncei.noaa.gov/data/international-satellite-cloud-climate-project-"
    "isccp-h-series-data/access/isccp-basic/hgm/"
)
FILENAME = "ISCCP-Basic.HGM.v01r00.GLOBAL.{year:04d}.{month:02d}.99.9999.GPC.10KM.CS00.EA1.00.nc"
MINIMUM_BYTES = 1_000_000


def download_sources(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for year in range(2004, 2014):
        for month in range(1, 13):
            name = FILENAME.format(year=year, month=month)
            destination = output / name
            if destination.is_file() and destination.stat().st_size >= MINIMUM_BYTES:
                print(f"Using existing {name}")
                continue

            temporary = destination.with_suffix(destination.suffix + ".part")
            url = BASE_URL + name
            request = urllib.request.Request(url, headers={"User-Agent": "Stark-Ephemeris research prototype"})
            try:
                with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as stream:
                    if "text/html" in response.headers.get("Content-Type", "").lower():
                        raise ValueError(f"Unexpected HTML response for {url}")
                    while chunk := response.read(1024 * 1024):
                        stream.write(chunk)
            except (OSError, urllib.error.URLError, ValueError):
                temporary.unlink(missing_ok=True)
                raise

            if temporary.stat().st_size < MINIMUM_BYTES:
                temporary.unlink(missing_ok=True)
                raise ValueError(f"Downloaded file is unexpectedly small: {name}")
            temporary.replace(destination)
            print(f"Downloaded {name} ({destination.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="directory for the 120 monthly NetCDF files")
    args = parser.parse_args()
    download_sources(args.output.resolve())


if __name__ == "__main__":
    main()
