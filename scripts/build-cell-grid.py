"""Build the static quarter-degree market grid. Run from any directory.

Install scripts/requirements-geography.txt first. Source archives are pinned by
SHA-256 in cell-sources.json and cached in .cache/cell-sources. The application
loads only the generated artifacts; Python and network access are build-time only.
"""
from pathlib import Path
import gzip
import hashlib
import csv
import json
import math
import struct
import urllib.request
from html.parser import HTMLParser

import numpy as np
import rasterio
import shapefile
from rasterio.features import rasterize
from rasterio.enums import MergeAlg
from rasterio.transform import from_origin

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache/cell-sources"
OUTPUT = ROOT / "public/data/cells"
ROWS, COLS, STEP = 720, 1440, 0.25
TRANSFORM = from_origin(-180, 90, STEP, STEP)
URBAN_SUBDIVISIONS = 8


def read_source(source):
    path = CACHE / source.get("filename", source["name"] + ".zip")
    if not path.exists():
        print("Downloading", source["name"], flush=True)
        if source.get("pagination") == "arcgis":
            features = []
            offset = 0
            while True:
                with urllib.request.urlopen(source["url"] + f"&resultOffset={offset}") as response:
                    page = json.load(response)
                if page.get("error"):
                    raise ValueError(f"ArcGIS source error: {page['error']}")
                features.extend(page.get("features", []))
                if not page.get("exceededTransferLimit") and len(page.get("features", [])) < 2000:
                    break
                offset += 2000
            path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
        else:
            urllib.request.urlretrieve(source["url"], path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != source["sha256"]:
        raise ValueError(f"Source checksum mismatch: {path.name}; review source changes before rebuilding")
    return path


def burn(reader):
    # ALL_TOUCHED includes intersecting slivers/islands, not just cell centers.
    return rasterize(
        ((shape.__geo_interface__, 1) for shape in reader.iterShapes()),
        out_shape=(ROWS, COLS), transform=TRANSFORM, all_touched=True, dtype="uint8",
    ).ravel()


def estimate_urban_area(reader):
    """Estimate urban polygon area by sampling an 8x finer grid (tenths of km²)."""
    factor = URBAN_SUBDIVISIONS
    sub_step = STEP / factor
    fine = rasterize(
        ((shape.__geo_interface__, 1) for shape in reader.iterShapes()),
        out_shape=(ROWS * factor, COLS * factor),
        transform=from_origin(-180, 90, sub_step, sub_step), dtype="uint8",
    )
    covered = fine.reshape(ROWS, factor, COLS, factor).sum(axis=3, dtype=np.uint16)
    row = np.arange(ROWS)[:, None]
    subrow = np.arange(factor)[None, :]
    north = np.deg2rad(90 - (row * STEP + subrow * sub_step))
    south = north - np.deg2rad(sub_step)
    subcell_area_km2 = 6_371**2 * np.deg2rad(sub_step) * (np.sin(north) - np.sin(south))
    area_deci_km2 = np.rint((covered * subcell_area_km2[:, :, None]).sum(axis=1) * 10)
    if np.any(area_deci_km2 > np.iinfo(np.uint16).max):
        raise ValueError("Urban footprint area exceeds the cell record's uint16 range")
    return area_deci_km2.astype("<u2").ravel()


def point_feature_counts(features, eligible):
    counts = np.zeros(ROWS * COLS, dtype="<u2")
    excluded = 0
    mapped = 0
    for feature in features:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "Point":
            continue
        lon, lat = geometry["coordinates"][:2]
        identifier = cell_id(lon, lat)
        if eligible[identifier]:
            counts[identifier] += 1
            mapped += 1
        else:
            excluded += 1
    return counts, mapped, excluded


def polygon_feature_counts(features, eligible):
    shapes = []
    for feature in features:
        geometry = feature.get("geometry")
        if geometry and geometry.get("type") in ("Polygon", "MultiPolygon"):
            shapes.append((geometry, 1))
    counts = rasterize(
        shapes, out_shape=(ROWS, COLS), transform=TRANSFORM,
        all_touched=True, dtype="uint16", merge_alg=MergeAlg.add,
    ).ravel()
    counts[~eligible] = 0
    return counts, len(shapes)


class NoaaTableParser(HTMLParser):
    """Read NOAA GML's public site table without a third-party HTML dependency."""
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.current_cell = ""
        self.row = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == "table": self.in_table = True
        elif self.in_table and tag == "tr": self.in_row = True; self.row = []
        elif self.in_row and tag in ("td", "th"): self.in_cell = True; self.current_cell = ""

    def handle_data(self, data):
        if self.in_cell: self.current_cell += data

    def handle_endtag(self, tag):
        if self.in_cell and tag in ("td", "th"):
            self.row.append(" ".join(self.current_cell.split()))
            self.in_cell = False
        elif self.in_row and tag == "tr":
            if self.row: self.rows.append(self.row)
            self.in_row = False
        elif tag == "table": self.in_table = False


def noaa_site_features(path):
    parser = NoaaTableParser()
    parser.feed(path.read_text(encoding="utf-8-sig"))
    features = []
    for row in parser.rows:
        if len(row) < 6 or row[0] == "Code":
            continue
        try:
            lat, lon = float(row[3]), float(row[4])
        except ValueError:
            continue
        features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"code": row[0], "name": row[1], "country": row[2], "elevationMeters": row[5]}})
    return features


def cell_id(longitude, latitude):
    column = math.floor(((longitude + 180) % 360) / STEP)
    row = min(ROWS - 1, max(0, math.floor((90 - latitude) / STEP)))
    return row * COLS + column


def build():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = json.loads((ROOT / "scripts/cell-sources.json").read_text())
    paths = {s["key"]: read_source(s) for s in sources}
    readers = {key: shapefile.Reader(str(paths[key]), encoding="utf-8")
               for key in ("land", "coastline", "cities", "ports", "urban", "borders")}
    print("Rasterizing land and attribute layers", flush=True)
    eligible = burn(readers["land"]).astype(bool)
    urban_presence = burn(readers["urban"])
    urban_area_deci_km2 = estimate_urban_area(readers["urban"])
    # Preserve tiny mapped urban slivers in the attribute/filter even below sampling precision.
    urban_area_deci_km2[(urban_presence != 0) & (urban_area_deci_km2 == 0)] = 1
    flags = burn(readers["coastline"]) | (urban_presence << 1) | (burn(readers["borders"]) << 2)
    cities = np.zeros(ROWS * COLS, dtype="<u2")
    ports = np.zeros(ROWS * COLS, dtype="<u2")
    population = np.zeros(ROWS * COLS, dtype="<u4")
    cropland_ha = np.zeros(ROWS * COLS, dtype="<u4")
    pasture_ha = np.zeros(ROWS * COLS, dtype="<u4")
    power_plants = np.zeros(ROWS * COLS, dtype="<u2")
    power_capacity_mw = np.zeros(ROWS * COLS, dtype="<u4")
    oil_pipelines = np.zeros(ROWS * COLS, dtype="<u2")
    military_sites = np.zeros(ROWS * COLS, dtype="<u2")
    data_centers = np.zeros(ROWS * COLS, dtype="<u2")
    research_sites = np.zeros(ROWS * COLS, dtype="<u2")
    monuments = np.zeros(ROWS * COLS, dtype="<u2")
    places = {}
    excluded = {}
    for key, counts, kind in [("cities", cities, "city"), ("ports", ports, "port")]:
        excluded[key] = []
        for item in readers[key].iterShapeRecords():
            props = item.record.as_dict()
            lon, lat = item.shape.points[0][:2]
            identifier = cell_id(lon, lat)
            place = {"name": props["name"], "kind": kind}
            if kind == "city":
                raw_population = props.get("pop_max", -1)
                estimate = max(0, int(raw_population or 0))
                place["population"] = estimate if raw_population is not None and raw_population >= 0 else None
                place["region"] = props.get("adm0name", "")
            if not eligible[identifier]:
                excluded[key].append({"name": props["name"], "longitude": lon, "latitude": lat, "cellId": identifier})
                continue
            counts[identifier] += 1
            if kind == "city":
                population[identifier] += estimate
            places.setdefault(str(identifier), []).append(place)

    for key in ("cropland", "pasture"):
        with rasterio.open(paths[key]) as source:
            fraction = source.read(1, masked=True).filled(0).astype(np.float32)
        if fraction.shape != (ROWS * 3, COLS * 3):
            raise ValueError(f"Unexpected 5 arc-minute agricultural grid for {key}: {fraction.shape}")
        fraction = fraction.reshape(ROWS, 3, COLS, 3).mean(axis=(1, 3))
        north = np.deg2rad(90 - np.arange(ROWS, dtype=np.float64) * STEP)
        south = north - np.deg2rad(STEP)
        cell_area_ha = (6_371_000**2 * np.deg2rad(STEP) * (np.sin(north) - np.sin(south)) / 10_000).astype(np.float32)
        area_ha = np.rint(fraction * cell_area_ha[:, None]).astype("<u4").ravel()
        target = cropland_ha if key == "cropland" else pasture_ha
        target[eligible] = area_ha[eligible]

    with paths["powerPlants"].open(encoding="utf-8-sig", newline="") as file:
        for plant in csv.DictReader(file):
            try:
                lon, lat = float(plant["longitude"]), float(plant["latitude"])
                identifier = cell_id(lon, lat)
                if not eligible[identifier]:
                    continue
                capacity = max(0, int(float(plant.get("capacity_mw") or 0)))
            except (KeyError, ValueError, TypeError):
                continue
            power_plants[identifier] += 1
            power_capacity_mw[identifier] += capacity

    pipeline_collection = json.loads(paths["oilPipelines"].read_text(encoding="utf-8"))
    pipeline_features = [feature for feature in pipeline_collection["features"]
        if feature.get("properties", {}).get("fuel") == "Oil"
        and feature.get("properties", {}).get("status") in ("operating", "construction", "proposed")]
    pipeline_shapes = []
    for feature in pipeline_features:
        geometry = feature.get("geometry")
        if geometry and geometry.get("type") in ("LineString", "MultiLineString"):
            pipeline_shapes.append((geometry, 1))
    oil_pipelines = rasterize(
        pipeline_shapes, out_shape=(ROWS, COLS), transform=TRANSFORM,
        all_touched=True, dtype="uint16", merge_alg=MergeAlg.add,
    ).ravel()
    military_collection = json.loads(paths["militarySites"].read_text(encoding="utf-8-sig"))
    military_sites, mapped_military = polygon_feature_counts(military_collection["features"], eligible)
    data_center_collection = json.loads(paths["dataCenters"].read_text(encoding="utf-8-sig"))
    dc_points, dc_mapped, dc_excluded = point_feature_counts(data_center_collection["features"], eligible)
    dc_polygons, dc_polygon_count = polygon_feature_counts(data_center_collection["features"], eligible)
    data_centers = (dc_points.astype("<u4") + dc_polygons.astype("<u4")).astype("<u2")
    research_features = noaa_site_features(paths["researchSites"])
    research_sites, mapped_research, excluded_research = point_feature_counts(research_features, eligible)
    unesco_collection = json.loads(paths["monuments"].read_text(encoding="utf-8-sig"))
    monuments, mapped_monuments, excluded_monuments = point_feature_counts(unesco_collection["features"], eligible)
    pipeline_routes = {"type": "FeatureCollection", "name": "Mapped major oil pipeline routes",
        "attribution": "Global Energy Monitor via Draw on a Map; CC BY 4.0",
        "sourceUrl": sources[-1]["url"], "prepared": "2026-09-15",
        "features": pipeline_features}
    route_bytes = gzip.compress(json.dumps(pipeline_routes, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0)
    (OUTPUT / "oil-pipeline-routes.geojson.gz").write_bytes(route_bytes)

    ids = np.flatnonzero(eligible).astype("<u4")
    flags |= (cropland_ha > 0).astype("uint8") * 8
    flags |= ((power_plants > 0) * 16).astype("uint8")
    flags |= ((oil_pipelines > 0) * 32).astype("uint8")
    records = np.zeros(len(ids), dtype=np.dtype([
        ("id", "<u4"), ("population", "<u4"), ("cityCount", "<u2"),
        ("portCount", "<u2"), ("flags", "u1"), ("urbanAreaDeciKm2", "<u2"), ("reserved", "u1"),
        ("croplandHa", "<u4"), ("pastureHa", "<u4"),
        ("powerPlants", "<u2"), ("powerCapacityMw", "<u4"), ("oilPipelines", "<u2"),
        ("militarySites", "<u2"), ("dataCenters", "<u2"), ("researchSites", "<u2"), ("monuments", "<u2"),
    ]))
    records["id"] = ids
    records["population"] = population[ids]
    records["cityCount"] = cities[ids]
    records["portCount"] = ports[ids]
    records["flags"] = flags[ids]
    records["urbanAreaDeciKm2"] = urban_area_deci_km2[ids]
    records["croplandHa"] = cropland_ha[ids]
    records["pastureHa"] = pasture_ha[ids]
    records["powerPlants"] = power_plants[ids]
    records["powerCapacityMw"] = power_capacity_mw[ids]
    records["oilPipelines"] = oil_pipelines[ids]
    records["militarySites"] = military_sites[ids]
    records["dataCenters"] = data_centers[ids]
    records["researchSites"] = research_sites[ids]
    records["monuments"] = monuments[ids]
    raw = b"SECG" + struct.pack("<II", 4, len(ids)) + records.tobytes()
    packed = gzip.compress(raw, mtime=0)
    (OUTPUT / "grid.bin.gz").write_bytes(packed)
    (OUTPUT / "places.json").write_text(json.dumps(places, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    metadata = {
        "schemaVersion": 4, "resolutionDeg": STEP, "rows": ROWS, "columns": COLS,
        "recordBytes": 40, "count": len(ids), "totalCells": ROWS * COLS,
        "generatedFrom": "Natural Earth; see sources for per-layer versions",
        "gridSha256": hashlib.sha256(packed).hexdigest(), "uncompressedBytes": len(raw),
        "statistics": {
            "coastalCells": int(np.count_nonzero(flags[ids] & 1)),
            "urbanCells": int(np.count_nonzero(flags[ids] & 2)),
            "urbanFootprintAreaKm2": round(float(urban_area_deci_km2[ids].sum()) / 10, 1),
            "maximumUrbanAreaDeciKm2": int(urban_area_deci_km2[ids].max()),
            "borderCells": int(np.count_nonzero(flags[ids] & 4)),
            "cities": int(cities.sum()), "ports": int(ports.sum()),
            "maximumCityPopulation": int(population.max()),
            "maximumCityCount": int(cities.max()), "maximumPortCount": int(ports.max()),
            "cellsWithCropland": int(np.count_nonzero(cropland_ha[ids])),
            "cellsWithPasture": int(np.count_nonzero(pasture_ha[ids])),
            "croplandAreaHa": int(cropland_ha[ids].sum()), "pastureAreaHa": int(pasture_ha[ids].sum()),
            "maximumCroplandAreaHa": int(cropland_ha[ids].max()), "maximumPastureAreaHa": int(pasture_ha[ids].max()),
            "powerPlants": int(power_plants[ids].sum()), "powerCapacityMw": int(power_capacity_mw[ids].sum()),
            "maximumPowerPlantCount": int(power_plants[ids].max()), "maximumPowerCapacityMw": int(power_capacity_mw[ids].max()),
            "cellsWithOilPipelines": int(np.count_nonzero(oil_pipelines[ids])),
            "maximumOilPipelineCount": int(oil_pipelines[ids].max()),
            "mappedOilPipelineRoutes": len(pipeline_features),
            "militaryInstallations": len(military_collection["features"]), "cellsWithMilitarySites": int(np.count_nonzero(military_sites[ids])),
            "dataCenterRecords": len(data_center_collection["features"]), "cellsWithDataCenters": int(np.count_nonzero(data_centers[ids])),
            "researchStations": len(research_features), "cellsWithResearchSites": int(np.count_nonzero(research_sites[ids])),
            "worldHeritageRecords": len(unesco_collection["features"]), "cellsWithMonuments": int(np.count_nonzero(monuments[ids])),
            "militaryInstallationPolygons": mapped_military, "dataCenterPolygons": dc_polygon_count,
            "mappedResearchSites": mapped_research, "mappedMonuments": mapped_monuments,
            "excludedPoints": {"dataCenters": dc_excluded, "researchSites": excluded_research, "monuments": excluded_monuments},
            "maximumMilitarySiteCount": int(military_sites[ids].max()), "maximumDataCenterCount": int(data_centers[ids].max()),
            "maximumResearchSiteCount": int(research_sites[ids].max()), "maximumMonumentCount": int(monuments[ids].max()),
            "excludedPointFeatures": {key: len(value) for key, value in excluded.items()},
        },
        "sources": sources,
        "unsourcedAttributes": ["energyGridLines", "substations", "ecologicalAreas", "ships"],
        "limitations": [
            "Natural Earth is generalized at 1:10 million scale; small islands or features absent from the source cannot be included.",
            "City population is the source POP_MAX estimate assigned to the mapped city point, not the total population inside a cell or a current census.",
            "Zero means no feature recorded in this dataset, not confirmed absence. Unsourced attributes are unknown, not zero.",
            "Urban footprint area is an 8x subcell estimate of generalized Natural Earth urban polygons; it is not building footprint area or an exact city boundary. Source city population estimates remain attached to their mapped points.",
            "Border attributes indicate intersection, not length. Source points outside the land mask are excluded and reported; they are not moved to other cells.",
            "Agricultural area is a circa-2015 gridded estimate; crop and pasture values are independently modeled area estimates and may overlap.",
            "The power-plant inventory is WRI version 1.3.0 and is no longer maintained. Plant counts/capacity are a broad modeled baseline, not a current complete inventory.",
            "Oil pipelines include mapped oil routes with operating, construction, or proposed status. Routes are generalized and approximate; unmapped facilities, route gaps, and offshore segments in ineligible ocean cells are not represented in cell counts.",
            "Military counts are DoD/NTAD base installation polygons; this inventory is not exhaustive and a large installation can count in multiple cells.",
            "Data-center counts are approximate mapped records from Gigawatt Map; polygon campuses count once in every intersected eligible cell, while point records are assigned to one cell. The source is ODbL and requires attribution/share-alike.",
            "Research-site counts include NOAA Global Monitoring Laboratory observation sites only, not all scientific research facilities.",
            "Monuments count UNESCO World Heritage entries with mapped point coordinates; polygonal site boundaries are not used. UNESCO data is CC BY-SA 4.0 and requires attribution/share-alike.",
            "The Gigawatt Map download endpoint returned a 4,255-record snapshot while its published catalog lists a 53-record export with a different checksum; the pinned snapshot is retained as an approximate layer and should not be refreshed without review.",
            "No dollar values, recharge timings, or collection policies have been assigned.",
        ],
    }
    (OUTPUT / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "excluded-points.json").write_text(json.dumps(excluded, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"cells": len(ids), "compressedBytes": len(packed), **metadata["statistics"]}, indent=2))


if __name__ == "__main__":
    build()
