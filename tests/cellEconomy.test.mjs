import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCellEconomy,
  settleSuccessfulCellCapture,
  valueAvailabilityMultiplier,
} from "../src/simulation/cellEconomy.ts";

const categories = [
  { id: "urban", unit: "km2", marketPriceUsdPerUnit: 5, playerPriorityPointsPerUnit: 2, cadenceSeconds: 100 },
  { id: "pipeline", unit: "pipeline", marketPriceUsdPerUnit: 100, playerPriorityPointsPerUnit: 3, cadenceSeconds: 200 },
];
const exposures = [
  { categoryId: "urban", unit: "km2", quantity: 20 },
  { categoryId: "pipeline", unit: "pipeline", quantity: 2 },
];

test("VAM starts at zero through ten percent of cadence, ramps linearly, then caps", () => {
  assert.equal(valueAvailabilityMultiplier(10, 100), 0);
  assert.equal(valueAvailabilityMultiplier(55, 100), 0.5);
  assert.equal(valueAvailabilityMultiplier(100, 100), 1);
  assert.equal(valueAvailabilityMultiplier(150, 100), 1);
});

test("never-collected cells start fully available and calculate payout and priority separately", () => {
  const result = calculateCellEconomy(categories, exposures, 0, { lastCollectedAtSeconds: null });
  assert.equal(result.atMaximum, true);
  assert.equal(result.maximumPayoutUsd, 300);
  assert.equal(result.availablePayoutUsd, 300);
  assert.equal(result.maximumPriorityPoints, 46);
  assert.equal(result.availablePriorityPoints, 46);
});

test("one cell timestamp feeds category-specific cadences", () => {
  const result = calculateCellEconomy(categories, exposures, 55, { lastCollectedAtSeconds: 0 });
  assert.equal(result.categories[0].valueAvailabilityMultiplier, 0.5);
  assert.equal(result.categories[1].valueAvailabilityMultiplier, 35 / 180);
  assert.equal(result.atMaximum, false);
  assert.ok(result.availablePayoutUsd < result.maximumPayoutUsd);
});

test("current category inputs immediately recalculate derived values without accumulating balances", () => {
  const recovery = { lastCollectedAtSeconds: 0 };
  const before = calculateCellEconomy(categories, exposures, 55, recovery);
  const changed = calculateCellEconomy([
    { ...categories[0], marketPriceUsdPerUnit: 10, playerPriorityPointsPerUnit: 4, cadenceSeconds: 50 },
    categories[1],
  ], exposures, 55, recovery);
  assert.equal(changed.categories[0].valueAvailabilityMultiplier, 1);
  assert.equal(changed.categories[0].availablePayoutUsd, 200);
  assert.equal(changed.categories[0].availablePriorityPoints, 80);
  assert.notEqual(changed.availablePayoutUsd, before.availablePayoutUsd);
});

test("successful capture returns pre-reset payout and one updated cell timestamp", () => {
  const settlement = settleSuccessfulCellCapture(42, categories, exposures, 55, { lastCollectedAtSeconds: 0 });
  assert.equal(settlement.event.cellId, 42);
  assert.equal(settlement.event.completedAtSeconds, 55);
  assert.equal(settlement.event.revenueUsd, settlement.event.categoryPayoutsUsd.urban + settlement.event.categoryPayoutsUsd.pipeline);
  assert.equal(settlement.priorityPointsAtCompletion, 20 + 6 * (35 / 180));
  assert.deepEqual(settlement.nextRecoveryState, { lastCollectedAtSeconds: 55 });

  const after = calculateCellEconomy(categories, exposures, 55, settlement.nextRecoveryState);
  assert.equal(after.availablePayoutUsd, 0);
  assert.equal(after.availablePriorityPoints, 0);
});

test("invalid units, rates, cadence, and timestamps are rejected", () => {
  assert.throws(() => calculateCellEconomy(categories, [{ ...exposures[0], unit: "hectare" }], 0, { lastCollectedAtSeconds: null }), /Unit mismatch/);
  assert.throws(() => calculateCellEconomy([{ ...categories[0], marketPriceUsdPerUnit: -1 }], [], 0, { lastCollectedAtSeconds: null }), /Market price/);
  assert.throws(() => calculateCellEconomy([{ ...categories[0], cadenceSeconds: 0 }], [], 0, { lastCollectedAtSeconds: null }), /Cadence/);
  assert.throws(() => calculateCellEconomy(categories, exposures, 20, { lastCollectedAtSeconds: 21 }), /future/);
});
