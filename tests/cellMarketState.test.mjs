import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CellGrid } from "../src/simulation/cells.ts";
import { CellMarketState } from "../src/simulation/cellMarketState.ts";

const directory = new URL("../public/data/cells/", import.meta.url);
const metadata = JSON.parse(readFileSync(new URL("metadata.json", directory)));
const places = JSON.parse(readFileSync(new URL("places.json", directory)));
const raw = gunzipSync(readFileSync(new URL("grid.bin.gz", directory)));
const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const grid = new CellGrid(buffer, metadata, places);
const definitions = [{
  id: "urban", label: "Urban", unit: "km2", sourceField: "urbanAreaDeciKm2",
  read: (sourceGrid, index) => sourceGrid.urbanAreaDeciKm2[index] / 10,
}];
const newYorkIndex = grid.indexAt(40.625, -73.875);

function createMarket() {
  return new CellMarketState(
    grid,
    [{ id: "urban", unit: "km2", marketPriceUsdPerUnit: 5, cadenceSeconds: 100 }],
    [{ categoryId: "urban", unit: "km2", pointsPerUnit: 2 }],
    1000,
    definitions,
  );
}

test("successful capture credits cash once and resets the one cell timestamp", () => {
  const market = createMarket();
  const initial = market.calculateCell(newYorkIndex, 0);
  const event = market.completeCellCapture(newYorkIndex, "Asteria-1", "preview-1", 0);

  assert.equal(event.cellId, grid.ids[newYorkIndex]);
  assert.equal(event.satelliteId, "Asteria-1");
  assert.equal(event.revenueUsd, initial.availablePayoutUsd);
  assert.equal(market.companyCashUsd, 1000 + initial.availablePayoutUsd);
  assert.equal(market.lastCollectedAtSeconds(newYorkIndex), 0);
  assert.equal(market.calculateCell(newYorkIndex, 0).availablePayoutUsd, 0);

  assert.throws(() => market.completeCellCapture(newYorkIndex, "Asteria-1", "preview-1", 1), /already committed/);
  assert.equal(market.companyCashUsd, 1000 + initial.availablePayoutUsd);
  assert.equal(market.getCaptureEvents().length, 1);
});

test("cadence changes recalculate VAM against the existing shared timestamp", () => {
  const market = createMarket();
  market.completeCellCapture(newYorkIndex, "Asteria-1", "preview-1", 0);
  assert.equal(market.calculateCell(newYorkIndex, 20).categories[0].valueAvailabilityMultiplier, 10 / 90);

  market.updateMarketReadout([{ id: "urban", unit: "km2", marketPriceUsdPerUnit: 5, cadenceSeconds: 200 }]);
  assert.equal(market.lastCollectedAtSeconds(newYorkIndex), 0);
  assert.equal(market.calculateCell(newYorkIndex, 20).categories[0].valueAvailabilityMultiplier, 0);
});

test("invalid capture attempts change neither cash nor recovery state", () => {
  const market = createMarket();
  const cashBefore = market.companyCashUsd;
  assert.throws(() => market.completeCellCapture(newYorkIndex, "Asteria-1", "invalid-time", -1), /Current time/);
  assert.equal(market.companyCashUsd, cashBefore);
  assert.equal(market.lastCollectedAtSeconds(newYorkIndex), null);
  assert.equal(market.getCaptureEvents().length, 0);
});

test("reset restores the preview's original cash, rates, events and cell availability", () => {
  const market = createMarket();
  market.updatePlayerPriorityRates([{ categoryId: "urban", unit: "km2", pointsPerUnit: 9 }]);
  market.completeCellCapture(newYorkIndex, "Asteria-1", "preview-1", 0);

  market.resetPreview();

  assert.equal(market.companyCashUsd, 1000);
  assert.deepEqual(market.getPlayerPriorityRates(), [{ categoryId: "urban", unit: "km2", pointsPerUnit: 2 }]);
  assert.equal(market.lastCollectedAtSeconds(newYorkIndex), null);
  assert.equal(market.getCaptureEvents().length, 0);
  assert.equal(market.calculateCell(newYorkIndex, 0).availablePayoutUsd, market.calculateCell(newYorkIndex, 0).maximumPayoutUsd);
});
