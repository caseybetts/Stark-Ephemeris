import test from "node:test";
import assert from "node:assert/strict";
import { CompanyFinance } from "../src/simulation/companyFinance.ts";
import { GROUND_STATION_CATALOG, quoteGroundStationPurchase } from "../src/simulation/groundStationCatalog.ts";
import { OperationalLoop } from "../src/simulation/operationalLoop.ts";
import { purchaseSpacecraftWithEquipment } from "../src/simulation/spacecraftCatalog.ts";
import { INITIAL_FLEET, SURFACE_OBJECTS } from "../src/simulation/constants.ts";

const createLoop = (finance) => new OperationalLoop({
  fleet: INITIAL_FLEET.satellites,
  stations: SURFACE_OBJECTS,
  scenario: { maximumOffNadirAngleDeg: 25, collectionDurationSeconds: 45 },
  getMarket: () => null,
  storageCapacityBytesBySatellite: { [INITIAL_FLEET.satellites[0].id]: 1_000 },
  contactPredictor: () => [],
  finance,
});

test("four additional stations remain inactive catalog offers until purchased", () => {
  assert.equal(GROUND_STATION_CATALOG.length, 4);
  assert.deepEqual(GROUND_STATION_CATALOG.map(({ station }) => station.id), [
    "honolulu-relay", "madrid-relay", "nairobi-relay", "tokyo-relay",
  ]);
  const activeIds = new Set(SURFACE_OBJECTS.map(({ id }) => id));
  for (const { station } of GROUND_STATION_CATALOG) assert.equal(activeIds.has(station.id), false);
});

test("station purchase checks affordability, activates once, records capital, and reset restores the original network", () => {
  const finance = new CompanyFinance({ startingCashUsd: 20_000_000 });
  const loop = createLoop(finance);
  const option = GROUND_STATION_CATALOG[0];
  const quote = quoteGroundStationPurchase(option.station.id, finance.getSnapshot().cashCents);
  assert.equal(quote.affordable, true);
  assert.equal(quote.cashAfterPurchaseCents, 1_000_000_000);
  loop.validateGroundStationRegistration(quote.station);

  finance.recordGroundStationProcurement("purchase:honolulu-relay", option.station.id, 0, quote.purchaseCostCents);
  loop.registerGroundStation(quote.station);
  finance.recordGroundStationProcurement("purchase:honolulu-relay", option.station.id, 0, quote.purchaseCostCents);

  assert.equal(loop.getStations().length, SURFACE_OBJECTS.length + 1);
  assert.equal(finance.getSnapshot().cashCents, 1_000_000_000);
  assert.equal(finance.getSnapshot().capitalSpendingCents, quote.purchaseCostCents);
  assert.equal(finance.getSnapshot().entries.length, 1);
  assert.equal(finance.getSnapshot().entries[0].kind, "ground-station-procurement");

  loop.reset();
  assert.equal(loop.getStations().length, SURFACE_OBJECTS.length);
  assert.equal(finance.getSnapshot().cashCents, 2_000_000_000);
  assert.equal(finance.getSnapshot().entries.length, 0);
});

test("unaffordable station purchases leave finance and the active roster unchanged", () => {
  const finance = new CompanyFinance({ startingCashUsd: 0 });
  const loop = createLoop(finance);
  const option = GROUND_STATION_CATALOG[0];
  const quote = quoteGroundStationPurchase(option.station.id, finance.getSnapshot().cashCents);
  assert.equal(quote.affordable, false);
  assert.throws(
    () => finance.recordGroundStationProcurement("purchase:honolulu-relay", option.station.id, 0, quote.purchaseCostCents),
    /Insufficient company cash/,
  );
  assert.equal(loop.getStations().length, SURFACE_OBJECTS.length);
  assert.equal(finance.getSnapshot().cashCents, 0);
  assert.equal(finance.getSnapshot().entries.length, 0);
});

test("spacecraft procurement preserves selected capability and reset removes purchased assets", () => {
  const finance = new CompanyFinance({ startingCashUsd: 55_000_000 });
  const loop = createLoop(finance);
  const purchase = purchaseSpacecraftWithEquipment({
    eventId: "purchase:asteria-2",
    satelliteId: "asteria-2",
    satelliteName: "Asteria-2",
    equipmentOptionId: "enhanced-slew",
    timeSeconds: 0,
    altitudeKm: 550,
    inclinationDeg: 53,
    ascendingNodeDeg: 12,
    phaseAtLaunchDeg: 8,
    referenceSatelliteId: INITIAL_FLEET.satellites[0].id,
    storageCapacityBytes: 1_000,
    operationalLoop: loop,
    finance,
    powerOperations: loop.powerOperations,
  });

  assert.equal(purchase.definition.slew.slewRateDegPerSecond, 2);
  assert.equal(loop.getFleet().length, 2);
  assert.equal(finance.getSnapshot().cashCents, 0);
  assert.equal(finance.getSnapshot().capitalSpendingCents, 5_500_000_000);
  loop.reset();
  assert.deepEqual(loop.getFleet().map(({ id }) => id), [INITIAL_FLEET.satellites[0].id]);
  assert.equal(finance.getSnapshot().cashCents, 5_500_000_000);
});

test("spacecraft affordability rejection leaves fleet and ledger unchanged", () => {
  const finance = new CompanyFinance({ startingCashUsd: 54_999_999.99 });
  const loop = createLoop(finance);
  assert.throws(() => purchaseSpacecraftWithEquipment({
    eventId: "purchase:asteria-2",
    satelliteId: "asteria-2",
    satelliteName: "Asteria-2",
    equipmentOptionId: "enhanced-slew",
    timeSeconds: 0,
    altitudeKm: 550,
    inclinationDeg: 53,
    ascendingNodeDeg: 12,
    phaseAtLaunchDeg: 8,
    referenceSatelliteId: INITIAL_FLEET.satellites[0].id,
    storageCapacityBytes: 1_000,
    operationalLoop: loop,
    finance,
    powerOperations: loop.powerOperations,
  }), /Insufficient company cash/);
  assert.equal(loop.getFleet().length, 1);
  assert.equal(finance.getSnapshot().entries.length, 0);
});

test("shared station antenna hands off to the next spacecraft still in contact", () => {
  const first = INITIAL_FLEET.satellites[0];
  const second = { ...first, id: "asteria-2", name: "Asteria-2", orbit: { ...first.orbit } };
  const station = {
    id: "queue-station", name: "Queue Station", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Queue fixture",
    groundStationDetails: { operationalStatus: "available", uplinkRateMbps: 10, downlinkRateMbps: 100, contactCostUsdPerMinute: 0 },
  };
  const windows = { [first.id]: [10, 50], [second.id]: [20, 60] };
  const contactPredictor = (satellite, stations, startsAt, endsAt) => {
    const [windowStart, windowEnd] = windows[satellite.id];
    if (!stations.some(({ id }) => id === station.id) || windowEnd < startsAt || windowStart > endsAt) return [];
    const start = Math.max(windowStart, startsAt);
    const end = Math.min(windowEnd, endsAt);
    if (end <= start) return [];
    return [{ satelliteId: satellite.id, stationId: station.id, stationName: station.name,
      startsAtSeconds: start, endsAtSeconds: end,
      continuesBeforeWindow: windowStart < startsAt, continuesAfterWindow: windowEnd > endsAt }];
  };
  const loop = new OperationalLoop({
    fleet: [first, second], stations: [station],
    scenario: { maximumOffNadirAngleDeg: 25, collectionDurationSeconds: 45 },
    getMarket: () => null,
    storageCapacityBytesBySatellite: { [first.id]: 1_000, [second.id]: 1_000 },
    contactPredictor,
  });

  loop.advanceBy(60);
  const assignments = loop.groundOperations.events
    .filter(({ kind }) => kind === "ground-contact-started")
    .map(({ satelliteId, timeSeconds }) => [satelliteId, timeSeconds]);
  assert.deepEqual(assignments, [[first.id, 10], [second.id, 50]]);
});
