import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CellGrid, cellBounds, cellIdAt, GLOBAL_CELL_COUNT } from "../src/simulation/cells.ts";
import { rasterizeCellTile } from "../src/simulation/cellRaster.ts";

const directory = new URL("../public/data/cells/", import.meta.url);
const metadata = JSON.parse(readFileSync(new URL("metadata.json", directory)));
const places = JSON.parse(readFileSync(new URL("places.json", directory)));
const raw = gunzipSync(readFileSync(new URL("grid.bin.gz", directory)));
const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const grid = new CellGrid(buffer, metadata, places);

test("coordinate indexing handles the dateline, poles and invalid coordinates", () => {
  assert.equal(cellIdAt(0, 180), cellIdAt(0, -180));
  assert.equal(cellIdAt(0, 540), cellIdAt(0, -180));
  assert.equal(cellIdAt(90, -180), 0);
  assert.equal(cellIdAt(-90, 179.99), GLOBAL_CELL_COUNT - 1);
  assert.equal(cellIdAt(91, 0), null);
  assert.equal(cellIdAt(0, NaN), null);
  for (const id of grid.ids) {
    const b = cellBounds(id);
    assert.equal(cellIdAt(b.latitudeDeg, b.longitudeDeg), id);
  }
});

test("real geography includes land and coastal islands and excludes central Pacific ocean", () => {
  for (const [lat, lon] of [[40.71, -74.0], [21.31, -157.85], [51.5, -0.12], [-89, 0], [64.13, -21.9]]) {
    assert.ok(grid.indexAt(lat, lon) >= 0, `Expected mapped land at ${lat},${lon}`);
  }
  assert.equal(grid.indexAt(0, -140), -1);
  assert.equal(grid.ids.length, metadata.count);
  assert.equal(grid.cityCounts.reduce((a, b) => a + b, 0), metadata.statistics.cities);
  assert.equal(grid.portCounts.reduce((a, b) => a + b, 0), metadata.statistics.ports);
});

test("new mapped attributes load while unknown attributes and dollar values stay unset", () => {
  const cell = grid.cell(grid.indexAt(41.88, -93.1));
  assert.ok(cell.attributes.croplandAreaHa > 0);
  assert.equal(cell.attributes.substationCount, null);
  assert.equal(cell.economy.maximumValueUsd, null);
  assert.equal(cell.economy.availableValueUsd, null);
});

test("loader rejects damaged/version-mismatched grids instead of showing false geography", () => {
  assert.throws(() => new CellGrid(buffer.slice(0, 16), metadata, places));
  assert.throws(() => new CellGrid(buffer, { ...metadata, schemaVersion: 99 }, places));
  const altered = buffer.slice(0);
  new DataView(altered).setUint32(12, GLOBAL_CELL_COUNT, true);
  assert.throws(() => new CellGrid(altered, metadata, places));
});

test("overview raster keeps ocean transparent and mapped land visible", () => {
  const pixels = rasterizeCellTile(grid, "coverage", 0, 0, 0);
  const alpha = (lat, lon) => pixels[(Math.floor((90 - lat) / 180 * 256) * 256 + Math.floor((lon + 180) / 180 * 256)) * 4 + 3];
  assert.equal(alpha(0, -140), 0);
  assert.ok(alpha(40, -100) > 0);
  assert.ok(alpha(-89, -100) > 0);
});
