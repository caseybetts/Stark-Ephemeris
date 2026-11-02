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

test("ground-station contact time is recorded as an operating expense", () => {
  const finance = new CompanyFinance({ startingCashUsd: 1 });
  finance.recordGroundStationContactTime("station-a", 0, 60, 0.01);

  const snapshot = finance.getSnapshot();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].kind, "ground-station-contact-cost");
  assert.equal(snapshot.entries[0].amountCents, -1);
  assert.equal(snapshot.operatingCostsCents, 1);
  assert.equal(snapshot.cashCents, 99);
});

test("contact fees accumulate consistently across interval partitions and reset cleanly", () => {
  const large = new CompanyFinance({ startingCashUsd: 20 });
  const irregular = new CompanyFinance({ startingCashUsd: 20 });
  large.recordGroundStationContactTime("station-a", 0, 180, 0.25);
  for (const [start, end] of [[0, 7], [7, 68], [68, 124], [124, 180]]) {
    irregular.recordGroundStationContactTime("station-a", start, end, 0.25);
  }

  assert.equal(irregular.getSnapshot().operatingCostsCents, large.getSnapshot().operatingCostsCents);
  assert.equal(irregular.getSnapshot().cashCents, large.getSnapshot().cashCents);
  irregular.reset();
  assert.equal(irregular.getSnapshot().cashCents, 2_000);
  assert.equal(irregular.getSnapshot().entries.length, 0);
  assert.equal(irregular.getSnapshot().operatingCostsCents, 0);
});

test("owned station maintenance is charged once per day, prorated on activation day, and reset cleanly", () => {
  const satellite = INITIAL_FLEET.satellites[0];
  const station = {
    id: "station-a", name: "Station A", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Test station",
    groundStationDetails: {
      operationalStatus: "available", accessMode: "owned", uplinkRateMbps: 10, downlinkRateMbps: 100,
      maintenanceCostUsdPerDay: 240, contactCostUsdPerMinute: 0,
    },
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
  assert.equal(large.finance.getSnapshot().operatingCostsCents, 48_000);
  assert.equal(large.finance.getSnapshot().cashCents, 52_000);
  assert.deepEqual(large.finance.getSnapshot().entries.map(({ kind, amountCents, groundStationDayIndex }) => [
    kind, amountCents, groundStationDayIndex,
  ]), [
    ["ground-station-maintenance-cost", -24_000, 0],
    ["ground-station-maintenance-cost", -24_000, 1],
  ]);
  large.loop.reset();
  assert.equal(large.finance.getSnapshot().cashCents, 100_000);
  assert.equal(large.finance.getSnapshot().entries.length, 0);
});

test("owned station activation midway through a day prorates its first maintenance charge", () => {
  const satellite = INITIAL_FLEET.satellites[0];
  const station = {
    id: "late-station", name: "Late Station", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Late activation fixture",
    groundStationDetails: {
      operationalStatus: "available", accessMode: "owned", uplinkRateMbps: 10, downlinkRateMbps: 100,
      maintenanceCostUsdPerDay: 125, contactCostUsdPerMinute: 0,
    },
  };
  const finance = new CompanyFinance({ startingCashUsd: 1_000 });
  const loop = new OperationalLoop({
    fleet: [satellite], stations: [], scenario: { maximumOffNadirAngleDeg: 25, collectionDurationSeconds: 45 },
    getMarket: () => null, storageCapacityBytesBySatellite: { [satellite.id]: 1_000 },
    contactPredictor: () => [], finance,
  });
  loop.advanceBy(SIMULATION_DAY_SECONDS / 2);
  loop.registerGroundStation(station);
  loop.advanceBy(SIMULATION_DAY_SECONDS / 2);

  const snapshot = finance.getSnapshot();
  assert.equal(snapshot.operatingCostsCents, 6_250);
  assert.equal(snapshot.cashCents, 93_750);
  assert.equal(snapshot.entries[0].amountCents, -6_250);
});

test("leased stations bill assigned contact time without owned-site maintenance", () => {
  const first = INITIAL_FLEET.satellites[0];
  const station = {
    id: "leased-station", name: "Leased Station", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Lease fixture",
    groundStationDetails: {
      operationalStatus: "available", accessMode: "leased", uplinkRateMbps: 10, downlinkRateMbps: 100,
      maintenanceCostUsdPerDay: 0, contactCostUsdPerMinute: 60,
    },
  };
  const finance = new CompanyFinance({ startingCashUsd: 100 });
  const loop = new OperationalLoop({
    fleet: [first], stations: [station],
    scenario: { maximumOffNadirAngleDeg: 25, collectionDurationSeconds: 45 },
    getMarket: () => null, storageCapacityBytesBySatellite: { [first.id]: 1_000 }, finance,
    contactPredictor: (_satellite, stations, startsAtSeconds, endsAtSeconds) => {
      if (!stations.some(({ id }) => id === station.id)) return [];
      const start = Math.max(10, startsAtSeconds);
      const end = Math.min(40, endsAtSeconds);
      return end > start ? [{ satelliteId: first.id, stationId: station.id, stationName: station.name,
        startsAtSeconds: start, endsAtSeconds: end, continuesBeforeWindow: false, continuesAfterWindow: false }] : [];
    },
  });
  loop.advanceBy(60);

  const snapshot = finance.getSnapshot();
  assert.equal(snapshot.operatingCostsCents, 3_000);
  assert.equal(snapshot.cashCents, 7_000);
  assert.deepEqual(snapshot.entries.map(({ kind }) => kind), ["ground-station-contact-cost"]);
});
