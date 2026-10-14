import test from "node:test";
import assert from "node:assert/strict";
import { cellIdAt, CellGrid } from "../src/simulation/cells.ts";
import { CellMarketState } from "../src/simulation/cellMarketState.ts";
import { OperationalLoop } from "../src/simulation/operationalLoop.ts";
import { generateGreedyCellSchedule } from "../src/simulation/cellScheduler.ts";
import { INITIAL_FLEET } from "../src/simulation/constants.ts";
import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt } from "../src/simulation/cellCapture.ts";
import { predictGroundContactWindows } from "../src/simulation/contacts.ts";
import { createWorldSnapshot } from "../src/simulation/world.ts";

const CELL_A_ID = 519_840;
const CELL_B_ID = CELL_A_ID + 1;
const IMAGE_BYTES = 10_000_000;
const CATEGORY = [{
  id: "fixture", label: "Fixture", unit: "unit", sourceField: "population",
  read: (grid, index) => grid.population[index],
}];
const SCENARIO = { maximumOffNadirAngleDeg: 180, collectionDurationSeconds: 10, requireSunlitTarget: false };
const FIXTURE_WINDOWS = [[10, 80]];

function makeGrid(ids = [CELL_A_ID, CELL_B_ID], exposures = [4, 8]) {
  const buffer = new ArrayBuffer(12 + ids.length * 40);
  const bytes = new DataView(buffer);
  bytes.setUint32(0, 0x53454347, false);
  bytes.setUint32(4, 4, true);
  bytes.setUint32(8, ids.length, true);
  ids.forEach((id, index) => {
    bytes.setUint32(12 + index * 40, id, true);
    bytes.setUint32(16 + index * 40, exposures[index] ?? 1, true);
  });
  const metadata = {
    schemaVersion: 4, resolutionDeg: 0.25, rows: 720, columns: 1440,
    recordBytes: 40, count: ids.length, totalCells: 1_036_800,
  };
  return new CellGrid(buffer, metadata, {});
}

function makeMarket(grid = makeGrid()) {
  return new CellMarketState(
    grid,
    [{ id: "fixture", unit: "unit", marketPriceUsdPerUnit: 5, cadenceSeconds: 1_000 }],
    [{ categoryId: "fixture", unit: "unit", pointsPerUnit: 3 }],
    100,
    CATEGORY,
  );
}

function makeWorld({ windows = FIXTURE_WINDOWS, downlinkRateMbps = 8, status = "available" } = {}) {
  const satellite = {
    ...INITIAL_FLEET.satellites[0],
    slew: { slewRateDegPerSecond: 1_000_000, settlingTimeSeconds: 0 },
  };
  const station = {
    id: "station-a", name: "Station A", kind: "ground-station", location: { latitudeDeg: 0, longitudeDeg: 0 },
    description: "Test station",
    groundStationDetails: { operationalStatus: status, uplinkRateMbps: 10, downlinkRateMbps },
  };
  const predictor = (candidate, stations, startsAtSeconds, endsAtSeconds) => {
    if (endsAtSeconds < startsAtSeconds) return [];
    const found = [];
    for (const groundStation of stations) {
      if (groundStation.kind !== "ground-station" || groundStation.groundStationDetails?.operationalStatus !== "available") continue;
      for (const [windowStart, windowEnd] of windows) {
        if (windowEnd < startsAtSeconds || windowStart > endsAtSeconds) continue;
        const start = Math.max(windowStart, startsAtSeconds);
        const end = Math.min(windowEnd, endsAtSeconds);
        if (end <= start) continue;
        found.push({
          satelliteId: candidate.id, stationId: groundStation.id, stationName: groundStation.name,
          startsAtSeconds: start, endsAtSeconds: end,
          continuesBeforeWindow: windowStart < startsAtSeconds,
          continuesAfterWindow: windowEnd > endsAtSeconds,
        });
      }
    }
    return found;
  };
  return { satellite, station, predictor };
}

function makeLoop({ windows = FIXTURE_WINDOWS, downlinkRateMbps = 8, status = "available", capacity = IMAGE_BYTES, market = makeMarket(), scenario = SCENARIO } = {}) {
  const world = makeWorld({ windows, downlinkRateMbps, status });
  const loop = new OperationalLoop({
    fleet: [world.satellite], stations: [world.station], scenario,
    getMarket: () => market,
    storageCapacityBytesBySatellite: { [world.satellite.id]: capacity },
    imageSizeBytes: IMAGE_BYTES,
    contactPredictor: world.predictor,
  });
  return { ...world, loop, market };
}

function captureCommands(satellite, cells, scenario = SCENARIO, startsAtSeconds = 10) {
  let cursor = startsAtSeconds;
  let pointing = nadirPointingAt(satellite, cursor);
  return cells.map(({ index, target }) => {
    const feasibility = evaluateCellCaptureOpportunity({ satellite, target, previousPointing: pointing, startsAtSeconds: cursor, scenario });
    const durationSeconds = feasibility.completesAtSeconds - cursor;
    assert.ok(durationSeconds > 0 && Number.isFinite(durationSeconds));
    const command = {
      id: `capture-${index}`, label: `Capture cell ${index}`, durationSeconds,
      cellCapture: { cellIndex: index, target },
    };
    cursor += durationSeconds;
    pointing = cellLookDirectionAt(satellite, target, cursor);
    return command;
  });
}

const targetA = { latitudeDeg: 0.125, longitudeDeg: 0.125 };
const targetB = { latitudeDeg: 0.125, longitudeDeg: 0.375 };

function semanticResult(loop, market) {
  return {
    elapsedSeconds: loop.runtime.elapsedSeconds,
    captures: market.getCaptureEvents().map(({ eventId, cellId, completedAtSeconds }) => [eventId, cellId, completedAtSeconds]),
    images: market.getImages().map(({ imageId, status, transferredBytes, settledRevenueUsd, deletedAtSeconds }) => [imageId, status, transferredBytes, settledRevenueUsd, deletedAtSeconds]),
    cash: market.companyCashUsd,
    revenue: market.realizedRevenueUsd,
    outcomes: loop.groundOperations.events.filter(({ kind }) => kind === "cell-capture-completed" || kind === "cell-capture-failed")
      .map(({ kind, commandId, timeSeconds }) => [kind, commandId, timeSeconds]),
    settlements: market.getImageLifecycleEvents().filter(({ kind }) => kind === "image-downlinked").map(({ imageId, timeSeconds }) => [imageId, timeSeconds]),
  };
}

test("runtime completion boundaries drive capture, storage, and transfer identically across step sizes", () => {
  const run = (steps) => {
    const { satellite, loop, market } = makeLoop();
    loop.reviseGroundPlan(satellite.id, captureCommands(satellite, [{ index: 0, target: targetA }]), 0);
    for (const seconds of steps) loop.advanceBy(seconds);
    return { loop, market };
  };
  const large = run([40]);
  const regular = run(Array(40).fill(1));
  const irregular = run([3.25, 6.75, 1.5, 7.5, 2.25, 8.75, 10]);

  assert.deepEqual(semanticResult(regular.loop, regular.market), semanticResult(large.loop, large.market));
  assert.deepEqual(semanticResult(irregular.loop, irregular.market), semanticResult(large.loop, large.market));
  assert.equal(large.market.getCaptureEvents().length, 1);
  assert.equal(large.market.companyCashUsd, 120, JSON.stringify(semanticResult(large.loop, large.market)));
  assert.equal(large.market.realizedRevenueUsd, 20);
  assert.equal(large.market.getImages()[0].status, "delivered");
  assert.equal(large.market.lastCollectedAtSeconds(0), large.market.getCaptureEvents()[0].completedAtSeconds);
});

test("partial downlink waits between contacts and settles exactly once on full delivery", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 1 };
  const { satellite, loop, market } = makeLoop({ windows: [[10, 16], [40, 50]], scenario });
  loop.reviseGroundPlan(satellite.id, captureCommands(satellite, [{ index: 0, target: targetA }], scenario), 0);
  loop.advanceBy(16);
  const image = market.getImages()[0];
  assert.equal(image.transferredBytes, Math.floor((16 - image.capturedAtSeconds) * 1_000_000));
  assert.equal(image.status, "onboard");
  assert.equal(market.companyCashUsd, 100);
  const partialBytes = image.transferredBytes;
  loop.advanceBy(24);
  assert.equal(market.getImage(image.imageId).transferredBytes, partialBytes);
  loop.advanceBy(10);
  assert.equal(market.getImage(image.imageId).status, "delivered");
  assert.equal(market.getImage(image.imageId).transferredBytes, IMAGE_BYTES);
  assert.equal(market.companyCashUsd, 120);
  assert.equal(market.getImageLifecycleEvents().filter(({ kind }) => kind === "image-downlinked").length, 1);
  loop.advanceBy(10);
  assert.equal(market.companyCashUsd, 120);
  assert.equal(market.getImageLifecycleEvents().filter(({ kind }) => kind === "image-downlinked").length, 1);
});

test("an earlier image delivers before a later capture applies storage pressure", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 12 };
  const { satellite, loop, market } = makeLoop({ windows: [[10, 70]], capacity: IMAGE_BYTES, scenario });
  const commands = captureCommands(satellite, [
    { index: 0, target: targetA },
    { index: 1, target: targetA },
  ], scenario);
  loop.reviseGroundPlan(satellite.id, commands, 0);
  loop.advanceBy(70);

  const [first, second] = market.getImages();
  assert.ok(first.deliveredAtSeconds < second.capturedAtSeconds);
  assert.equal(first.status, "delivered");
  assert.equal(second.status, "delivered");
  assert.equal(market.companyCashUsd, 160);
  assert.deepEqual(market.getImageLifecycleEvents().filter(({ kind }) => kind === "image-downlinked").map(({ imageId }) => imageId), [first.imageId, second.imageId]);
  assert.equal(market.getImageLifecycleEvents().some(({ kind }) => kind === "image-deleted"), false);
});

test("capacity evicts lower-priority imagery, including a low-priority incoming image", () => {
  const grid = makeGrid();
  const market = makeMarket(grid);
  const scenario = { ...SCENARIO, collectionDurationSeconds: 1 };
  const { satellite, loop } = makeLoop({ windows: [[10, 14]], downlinkRateMbps: 0, capacity: IMAGE_BYTES, market, scenario });
  const commands = captureCommands(satellite, [
    { index: 1, target: targetA },
    { index: 0, target: targetA },
  ], scenario);
  loop.reviseGroundPlan(satellite.id, commands, 0);
  loop.advanceBy(14);
  const images = market.getImages();
  assert.equal(images.length, 2);
  assert.equal(images[0].status, "onboard");
  assert.equal(images[1].status, "deleted");
  assert.equal(images[1].cellId, CELL_A_ID);
  assert.equal(market.lastCollectedAtSeconds(0), images[1].capturedAtSeconds);
  assert.equal(market.companyCashUsd, 100);

  const secondMarket = makeMarket(grid);
  const second = makeLoop({ windows: [[10, 14]], downlinkRateMbps: 0, capacity: IMAGE_BYTES, market: secondMarket, scenario });
  const reversed = captureCommands(second.satellite, [
    { index: 0, target: targetA },
    { index: 1, target: targetA },
  ], scenario);
  second.loop.reviseGroundPlan(second.satellite.id, reversed, 0);
  second.loop.advanceBy(14);
  const reversedImages = secondMarket.getImages();
  assert.equal(reversedImages[0].status, "deleted", "a higher-priority incoming image evicts the stored lower-priority image");
  assert.equal(reversedImages[1].status, "onboard");
  assert.equal(secondMarket.companyCashUsd, 100);
});

test("failed capture leaves imagery, cash, and cell recovery unchanged", () => {
  const scenario = { ...SCENARIO, maximumOffNadirAngleDeg: 0 };
  const { satellite, loop, market } = makeLoop({ scenario });
  const command = captureCommands(satellite, [{ index: 0, target: targetA }], scenario)[0];
  assert.ok(command);
  loop.reviseGroundPlan(satellite.id, [command], 0);
  loop.advanceBy(40);
  assert.equal(market.getCaptureEvents().length, 0);
  assert.equal(market.getImages().length, 0);
  assert.equal(market.lastCollectedAtSeconds(0), null);
  assert.equal(market.companyCashUsd, 100);
  assert.equal(loop.groundOperations.events.filter(({ kind }) => kind === "cell-capture-failed").length, 1);
});

test("ground-plan edits stay on the ground until a new contact, and a continuing contact does not re-upload", () => {
  const { satellite, loop } = makeLoop({ windows: [[10, 20], [40, 60]] });
  const firstVersion = loop.reviseGroundPlan(satellite.id, [{ id: "old", label: "Old", durationSeconds: 5 }], 0);
  loop.advanceBy(5);
  const secondVersion = loop.reviseGroundPlan(satellite.id, [{ id: "new", label: "New", durationSeconds: 5 }], 5);
  loop.advanceBy(5);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, null);
  loop.advanceBy(2);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, secondVersion);
  const thirdVersion = loop.reviseGroundPlan(satellite.id, [{ id: "later", label: "Later", durationSeconds: 5 }], 12);
  loop.advanceBy(5);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, secondVersion);
  loop.advanceBy(28);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, thirdVersion);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).standbyCause, "tel-exhausted");
  assert.equal(loop.groundOperations.events.filter(({ kind }) => kind === "tel-uploaded").length, 2);
  assert.equal(firstVersion, 1);
});

test("priority edits do not revise an onboard TEL or change image payout", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 1 };
  const { satellite, loop, market } = makeLoop({ windows: [[10, 50]], scenario });
  const command = captureCommands(satellite, [{ index: 0, target: targetA }], scenario)[0];
  const groundVersion = loop.reviseGroundPlan(satellite.id, [command], 0);
  loop.advanceBy(11);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, groundVersion);

  market.updatePlayerPriorityRates([{ categoryId: "fixture", unit: "unit", pointsPerUnit: 1_000 }]);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, groundVersion);
  loop.advanceBy(40);

  const image = market.getImages()[0];
  assert.equal(image.valuePotentialUsdAtCapture, 20);
  assert.equal(image.initialRetentionPriorityPoints, 4_000);
  assert.equal(image.status, "delivered");
  assert.equal(market.companyCashUsd, 120);
});

test("a down station cannot receive a TEL or downlink an onboard image", () => {
  const market = makeMarket();
  const { satellite, loop } = makeLoop({ status: "down", market });
  loop.reviseGroundPlan(satellite.id, [{ id: "idle", label: "Idle", durationSeconds: 5 }], 0);
  market.completeCellCapture(0, satellite.id, "seed", 0, IMAGE_BYTES);
  loop.advanceBy(100);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, null);
  assert.equal(market.getImage("seed:image").status, "onboard");
  assert.equal(market.getImage("seed:image").transferredBytes, 0);
  assert.equal(market.companyCashUsd, 100);
});

test("the real contact predictor agrees with world snapshots and filters a down station", () => {
  const { satellite, station } = makeWorld();
  const windows = predictGroundContactWindows(satellite, [station], 0, 24 * 60 * 60, { sampleStepSeconds: 60 });
  assert.ok(windows.length > 0);
  for (const window of windows) {
    const midpoint = (window.startsAtSeconds + window.endsAtSeconds) / 2;
    assert.equal(createWorldSnapshot(satellite, [station], midpoint).stationContacts[0].available, true);
  }
  const downStation = { ...station, groundStationDetails: { ...station.groundStationDetails, operationalStatus: "down" } };
  assert.deepEqual(predictGroundContactWindows(satellite, [downStation], 0, 24 * 60 * 60), []);
});

test("reset clears execution and market state so the scenario can be replayed", () => {
  const { satellite, loop, market } = makeLoop();
  const commands = captureCommands(satellite, [{ index: 0, target: targetA }]);
  loop.reviseGroundPlan(satellite.id, commands, 0);
  loop.advanceBy(40);
  loop.reset();
  assert.equal(loop.runtime.elapsedSeconds, 0);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion, 0);
  assert.equal(market.getImages().length, 0);
  assert.equal(market.companyCashUsd, 100);
  loop.reviseGroundPlan(satellite.id, captureCommands(satellite, [{ index: 0, target: targetA }]), 0);
  loop.advanceBy(40);
  assert.equal(market.companyCashUsd, 120);
  assert.equal(market.getCaptureEvents().length, 1);
});

test("a greedy TEL passes through the same upload and capture execution path", () => {
  const world = makeWorld();
  const target = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
  const cellId = cellIdAt(target.latitudeDeg, target.longitudeDeg);
  assert.notEqual(cellId, null);
  const grid = makeGrid([cellId], [4]);
  const market = makeMarket(grid);
  const { satellite, loop } = makeLoop({ market, windows: [[10, 40]] });
  const schedule = generateGreedyCellSchedule({
    satellite, grid, market, startsAtSeconds: 10, endsAtSeconds: 40,
    scenario: SCENARIO, initialPointing: nadirPointingAt(satellite, 10),
  });
  assert.ok(schedule.decisions.length > 0);
  loop.reviseGroundPlan(satellite.id, schedule.commands, 0);
  loop.advanceBy(40);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, 1);
  assert.equal(market.getCaptureEvents().length, schedule.decisions.length);
  assert.equal(loop.groundOperations.events.filter(({ kind }) => kind === "cell-capture-completed").length, schedule.decisions.length);
});
