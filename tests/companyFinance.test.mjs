import test from "node:test";
import assert from "node:assert/strict";
import { CompanyFinance, SIMULATION_DAY_SECONDS } from "../src/simulation/companyFinance.ts";
import { OperationalLoop } from "../src/simulation/operationalLoop.ts";
import { INITIAL_FLEET } from "../src/simulation/constants.ts";

test("downlink settlements create one cash entry and use integer cents", () => {
  const finance = new CompanyFinance({ startingCashUsd: 500 });
  const first = finance.recordDownlinkRevenue("delivery-1", "image-1", 120, 12.345);
  const replay = finance.recordDownlinkRevenue("delivery-1", "image-1", 120, 12.345);
  assert.deepEqual(first, replay);
  assert.equal(first.amountCents, 1_235);
  assert.equal(finance.getSnapshot().cashCents, 51_235);
  assert.equal(finance.getSnapshot().realizedRevenueCents, 1_235);
  assert.equal(finance.getSnapshot().entries.length, 1);
  assert.throws(() => finance.recordDownlinkRevenue("delivery-1", "different-image", 120, 12.345), /reused with different contents/);
});

test("daily spacecraft and station costs land on exact boundaries and can make cash negative", () => {
  const finance = new CompanyFinance({ startingCashUsd: 0 });
  finance.advanceTo(SIMULATION_DAY_SECONDS - 1, ["sat-b", "sat-a"], ["station-a"]);
  assert.equal(finance.getSnapshot().entries.length, 0);
  finance.advanceTo(SIMULATION_DAY_SECONDS, ["sat-b", "sat-a"], ["station-a"]);

  const snapshot = finance.getSnapshot();
  assert.equal(snapshot.entries.length, 3);
  assert.deepEqual(snapshot.entries.map(({ timeSeconds }) => timeSeconds), [SIMULATION_DAY_SECONDS, SIMULATION_DAY_SECONDS, SIMULATION_DAY_SECONDS]);
  assert.deepEqual(snapshot.entries.map(({ amountCents }) => amountCents), [-10_000, -10_000, -2_500]);
  assert.equal(snapshot.operatingCostsCents, 22_500);
  assert.equal(snapshot.cashCents, -22_500);
  assert.equal(snapshot.isNegative, true);
});

test("daily cost totals are independent of time partitioning and reset cleanly", () => {
  const large = new CompanyFinance({ startingCashUsd: 2_000 });
  const irregular = new CompanyFinance({ startingCashUsd: 2_000 });
  large.advanceTo(3 * SIMULATION_DAY_SECONDS, ["sat-a"], ["station-a", "station-b"]);
  for (const at of [7, 86_401, 104_444, 172_800, 3 * SIMULATION_DAY_SECONDS]) {
    irregular.advanceTo(at, ["sat-a"], ["station-a", "station-b"]);
  }

  assert.deepEqual(irregular.getSnapshot(), large.getSnapshot());
  irregular.reset();
  assert.equal(irregular.getSnapshot().cashCents, 200_000);
  assert.equal(irregular.getSnapshot().entries.length, 0);
  assert.equal(irregular.getSnapshot().operatingCostsCents, 0);
});

test("operational time advancement accrues the same costs across large and irregular steps", () => {
  const satellite = INITIAL_FLEET.satellites[0];
  const station = {
    id: "station-a", name: "Station A", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Test station",
    groundStationDetails: { operationalStatus: "available", uplinkRateMbps: 10, downlinkRateMbps: 100 },
  };
  const createLoop = () => {
    const finance = new CompanyFinance({ startingCashUsd: 1_000 });
    const loop = new OperationalLoop({
      fleet: [satellite], stations: [station], scenario: { maximumOffNadirAngleDeg: 25, collectionDurationSeconds: 45 },
      getMarket: () => null, storageCapacityBytesBySatellite: { [satellite.id]: 1_000 },
      contactPredictor: () => [], finance,
    });
    return { finance, loop };
  };
  const large = createLoop();
  const irregular = createLoop();
  const end = 2 * SIMULATION_DAY_SECONDS + 17;
  large.loop.advanceBy(end);
  for (const step of [12_345, 70_001, 40_000, 50_000, 471]) irregular.loop.advanceBy(step);

  assert.deepEqual(irregular.finance.getSnapshot(), large.finance.getSnapshot());
  assert.equal(large.finance.getSnapshot().operatingCostsCents, 25_000);
  assert.equal(large.finance.getSnapshot().cashCents, 75_000);
});
