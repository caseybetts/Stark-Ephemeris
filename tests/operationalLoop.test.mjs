import test from "node:test";
import assert from "node:assert/strict";
import { cellIdAt, CellGrid } from "../src/simulation/cells.ts";
import { CellMarketState } from "../src/simulation/cellMarketState.ts";
import { OperationalLoop } from "../src/simulation/operationalLoop.ts";
import { generateBoundedCellSchedule, generateGreedyCellSchedule,
  PROTOTYPE_BEAM_EXTENSION_BUDGET } from "../src/simulation/cellScheduler.ts";
import { INITIAL_FLEET } from "../src/simulation/constants.ts";
import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt } from "../src/simulation/cellCapture.ts";
import { predictGroundContactWindows } from "../src/simulation/contacts.ts";
import { createWorldSnapshot } from "../src/simulation/world.ts";
import { nextIlluminationBoundary, PROTOTYPE_POWER_CONFIGURATION } from "../src/simulation/power.ts";

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

function makeLoop({ windows = FIXTURE_WINDOWS, downlinkRateMbps = 8, status = "available", capacity = IMAGE_BYTES, market = makeMarket(), scenario = SCENARIO, powerConfiguration, weather } = {}) {
  const world = makeWorld({ windows, downlinkRateMbps, status });
  const loop = new OperationalLoop({
    fleet: [world.satellite], stations: [world.station], scenario,
    getMarket: () => market,
    storageCapacityBytesBySatellite: { [world.satellite.id]: capacity },
    imageSizeBytes: IMAGE_BYTES,
    contactPredictor: world.predictor,
    finance: market?.finance,
    powerConfigurationBySatellite: powerConfiguration
      ? { [world.satellite.id]: powerConfiguration }
      : undefined,
    weather,
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

test("cloud failure consumes the command and capture power without creating an image or resetting recovery", () => {
  const { satellite, loop, market } = makeLoop({
    windows: [[10, 80]],
    weather: { seed: 2, baselinePercent: 100, usableThresholdPercent: 60 },
  });
  const [command] = captureCommands(satellite, [{ index: 0, target: targetA }]);
  loop.reviseGroundPlan(satellite.id, [command], 0);
  loop.advanceBy(40);

  const failure = loop.groundOperations.events.find(({ kind }) => kind === "cell-capture-failed");
  assert.match(failure.detail, /cloud cover averaged \d+%/);
  assert.ok(Number(failure.detail.match(/averaged (\d+)%/)[1]) > 60);
  assert.equal(failure.timeSeconds, command.durationSeconds + 10);
  assert.equal(market.getImages().length, 0);
  assert.equal(market.getCaptureEvents().length, 0);
  assert.equal(market.lastCollectedAtSeconds(0), null);
  assert.ok(loop.powerOperations.getSnapshot(satellite.id, satellite, loop.runtime.elapsedSeconds).consumedWh > 0);
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

test("power-rejected capture keeps its slot and pointing, then reports failure once", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const powerConfiguration = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 99 };
  const { satellite, loop, market } = makeLoop({
    windows: [[10, 40]], scenario, powerConfiguration,
  });
  const commands = captureCommands(satellite, [{ index: 0, target: targetA }], scenario);
  loop.reviseGroundPlan(satellite.id, commands, 0);

  loop.advanceBy(10 + commands[0].durationSeconds);

  const failures = loop.groundOperations.events.filter(event => event.kind === "cell-capture-failed");
  assert.equal(failures.length, 1, JSON.stringify({ ground: loop.groundOperations.events, runtime: loop.runtime.events, power: loop.getPowerSnapshot(satellite.id) }));
  assert.equal(failures[0].timeSeconds, 10 + commands[0].durationSeconds);
  assert.match(failures[0].detail, /power/i);
  assert.equal(market.getCaptureEvents().length, 0);
  assert.equal(loop.getLastCommandedPointing(satellite.id), null);
  assert.equal(loop.runtime.elapsedSeconds, 10 + commands[0].durationSeconds);
});

test("rejected capture does not move the next queued command into a replacement time", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const powerConfiguration = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 99 };
  const { satellite, loop } = makeLoop({ windows: [[10, 60]], scenario, powerConfiguration });
  loop.reviseGroundPlan(satellite.id, [
    { id: "held-a", label: "Held capture A", durationSeconds: 10, cellCapture: { cellIndex: 0, target: targetA } },
    { id: "held-b", label: "Held capture B", durationSeconds: 10, cellCapture: { cellIndex: 1, target: targetB } },
  ], 0);

  loop.advanceBy(31);

  const starts = loop.runtime.events.filter(event => event.kind === "action-started").map(event => event.timeSeconds);
  const failures = loop.groundOperations.events.filter(event => event.kind === "cell-capture-failed");
  assert.deepEqual(starts, [10, 20]);
  assert.deepEqual(failures.map(event => event.timeSeconds), [20]);
  assert.match(failures[0].detail, /power/i);
  assert.ok(loop.groundOperations.events.some(event => event.kind === "cell-capture-completed"
    && event.commandId === "held-b" && event.timeSeconds === 30));
});

test("depleted contact entry never uploads late after recovery, but exact-entry recovery does", () => {
  const powerConfiguration = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 0 };
  const run = (windows, endSeconds) => {
    const { satellite, loop } = makeLoop({ windows, powerConfiguration });
    loop.reviseGroundPlan(satellite.id, [{ id: "idle", label: "Idle", durationSeconds: 8_000 }], 0);
    loop.advanceBy(endSeconds);
    return loop;
  };

  const recoversDuringEpisode = run([[3_700, 6_000], [7_000, 8_000]], 6_000);
  assert.equal(recoversDuringEpisode.getPowerSnapshot("asteria-1").depleted, false);
  assert.deepEqual(recoversDuringEpisode.groundOperations.events
    .filter(event => event.kind === "tel-uploaded"), []);
  recoversDuringEpisode.advanceBy(1_001);
  assert.deepEqual(recoversDuringEpisode.groundOperations.events
    .filter(event => event.kind === "tel-uploaded").map(event => event.timeSeconds), [7_000]);

  const entry = nextIlluminationBoundary(INITIAL_FLEET.satellites[0], 0, 2_000);
  const sunrise = nextIlluminationBoundary(INITIAL_FLEET.satellites[0], 3_600, 4_000);
  const storedAtEntryWh = PROTOTYPE_POWER_CONFIGURATION.solarGenerationW * entry / 3_600;
  const chargeSeconds = (PROTOTYPE_POWER_CONFIGURATION.restartWh - storedAtEntryWh)
    * 3_600 / PROTOTYPE_POWER_CONFIGURATION.solarGenerationW;
  const restartTime = sunrise + chargeSeconds;
  const recoversAtEntry = run([[restartTime, restartTime + 100]], restartTime + 1);
  assert.equal(recoversAtEntry.getPowerSnapshot("asteria-1").depleted, false);
  assert.deepEqual(recoversAtEntry.groundOperations.events
    .filter(event => event.kind === "tel-uploaded").map(event => event.timeSeconds), [restartTime], JSON.stringify({
      ground: recoversAtEntry.groundOperations.events,
      power: recoversAtEntry.powerOperations.events,
      snapshot: recoversAtEntry.getPowerSnapshot("asteria-1"),
      restartTime,
    }));
});

test("contact downlink pauses at reserve and resumes after charging while bytes persist", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const powerConfiguration = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 110,
    solarGenerationW: 100,
  };
  const { satellite, loop, market } = makeLoop({
    windows: [[10, 2_000]], downlinkRateMbps: 0.001, scenario, powerConfiguration,
  });
  const commands = captureCommands(satellite, [{ index: 0, target: targetA }], scenario);
  loop.reviseGroundPlan(satellite.id, commands, 0);

  loop.advanceBy(500);
  const pausedSnapshot = loop.getPowerSnapshot(satellite.id);
  const pausedImage = market.getImages()[0];
  assert.ok(pausedImage.transferredBytes > 0 && pausedImage.transferredBytes < pausedImage.sizeBytes);
  assert.equal(pausedSnapshot.radioPaused, true);
  assert.ok(pausedSnapshot.energyWh >= powerConfiguration.reserveWh - 1e-6);

  loop.advanceBy(700);
  const resumedImage = market.getImages()[0];
  assert.ok(resumedImage.transferredBytes > pausedImage.transferredBytes);
  assert.ok(resumedImage.transferredBytes < resumedImage.sizeBytes);
  assert.equal(loop.getPowerSnapshot(satellite.id).radioPaused, false);
});

test("capture and downlink may overlap while capture load and radio load are both metered", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const { satellite, loop, market } = makeLoop({ windows: [[10, 80]], downlinkRateMbps: 0.1, scenario });
  const commands = captureCommands(satellite, [
    { index: 0, target: targetA },
    { index: 1, target: targetA },
  ], scenario);
  loop.reviseGroundPlan(satellite.id, commands, 0);

  loop.advanceBy(25);

  const snapshot = loop.getPowerSnapshot(satellite.id);
  assert.equal(snapshot.loadW, 450);
  assert.equal(snapshot.netW, -150);
  assert.ok(market.getImages()[0].transferredBytes > 0);
  assert.equal(loop.runtime.getSatelliteState(satellite.id).currentAction?.status, "active");
});

test("downlink waits for the active and locked next capture when their reserve requires it", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const powerConfiguration = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 102 };
  const { satellite, loop, market } = makeLoop({
    windows: [[10, 80]], downlinkRateMbps: 0.1, scenario, powerConfiguration,
    capacity: IMAGE_BYTES * 3,
  });
  const seededImage = market.completeCellCapture(0, satellite.id, "seed-image", 0, IMAGE_BYTES);
  loop.reviseGroundPlan(satellite.id, [
    { id: "capture-a", label: "Capture A", durationSeconds: 10, cellCapture: { cellIndex: 0, target: targetA } },
    { id: "capture-b", label: "Capture B", durationSeconds: 10, cellCapture: { cellIndex: 1, target: targetA } },
  ], 0);

  loop.advanceBy(25);
  const protectedState = loop.getPowerSnapshot(satellite.id);
  assert.equal(protectedState.radioPaused, true);
  assert.ok(protectedState.energyWh >= powerConfiguration.reserveWh);
  assert.equal(market.getImage(seededImage.imageId).transferredBytes, 0);

  loop.advanceBy(6);
  assert.equal(loop.getPowerSnapshot(satellite.id).radioPaused, false);
  assert.ok(market.getImage(seededImage.imageId).transferredBytes > 0, JSON.stringify({
    power: loop.getPowerSnapshot(satellite.id), ground: loop.groundOperations.events,
    runtime: loop.runtime.events, image: market.getImage(seededImage.imageId),
  }));
});

test("final-byte delivery ends radio energy use at the same simulation instant", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 1 };
  const { satellite, loop, market } = makeLoop({ windows: [[10, 80]], scenario });
  const command = captureCommands(satellite, [{ index: 0, target: targetA }], scenario);
  loop.reviseGroundPlan(satellite.id, command, 0);
  loop.advanceBy(50);

  const image = market.getImages()[0];
  const delivery = market.getImageLifecycleEvents().find(event => event.kind === "image-downlinked");
  assert.equal(image.status, "delivered");
  assert.ok(delivery);
  const snapshot = loop.getPowerSnapshot(satellite.id);
  const captureDuration = command[0].durationSeconds;
  const expectedConsumedWh = (50 * 50 + 250 * captureDuration
    + 150 * (delivery.timeSeconds - image.capturedAtSeconds)) / 3_600;
  assert.ok(Math.abs(snapshot.consumedWh - expectedConsumedWh) < 1e-6);
});

test("power advances without market state and no inventory means no radio load", () => {
  const { satellite, loop } = makeLoop({ market: null, windows: [[10, 100]] });
  loop.advanceBy(100);
  const snapshot = loop.getPowerSnapshot(satellite.id);
  assert.equal(snapshot.loadW, 50);
  assert.equal(snapshot.generationW, 300);
  assert.equal(snapshot.radioPaused, false);
  assert.ok(snapshot.energyWh > PROTOTYPE_POWER_CONFIGURATION.initialEnergyWh);
});

test("power-gated capture and partial transfer are invariant to irregular time advances", () => {
  const scenario = { ...SCENARIO, collectionDurationSeconds: 10 };
  const powerConfiguration = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 110,
    solarGenerationW: 100,
  };
  const run = (steps) => {
    const { satellite, loop, market } = makeLoop({
      windows: [[10, 2_000]], downlinkRateMbps: 0.001, scenario, powerConfiguration,
    });
    const commands = captureCommands(satellite, [{ index: 0, target: targetA }], scenario);
    loop.reviseGroundPlan(satellite.id, commands, 0);
    for (const step of steps) loop.advanceBy(step);
    return { loop, market, satellite };
  };
  const large = run([1_200]);
  const irregular = run([3.25, 81.5, 17.25, 231, 6, 93.75, 47.5, 120, 599.75]);
  const largeImage = large.market.getImages()[0];
  const irregularImage = irregular.market.getImages()[0];
  assert.equal(irregular.loop.runtime.elapsedSeconds, large.loop.runtime.elapsedSeconds);
  assert.equal(irregularImage.transferredBytes, largeImage.transferredBytes);
  assert.equal(irregularImage.status, largeImage.status);
  assert.equal(irregular.market.realizedRevenueUsd, large.market.realizedRevenueUsd);
  assert.ok(Math.abs(irregular.loop.getPowerSnapshot(irregular.satellite.id).energyWh
    - large.loop.getPowerSnapshot(large.satellite.id).energyWh) < 1e-6);
  assert.equal(irregular.loop.getPowerSnapshot(irregular.satellite.id).radioPaused,
    large.loop.getPowerSnapshot(large.satellite.id).radioPaused);
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

test("overlapping and back-to-back station windows upload once per contact episode", () => {
  const { satellite } = makeWorld();
  const stations = ["a", "b", "c"].map((suffix) => ({
    id: `station-${suffix}`, name: `Station ${suffix.toUpperCase()}`, kind: "ground-station",
    location: { latitudeDeg: 0, longitudeDeg: 0 }, description: "Episode fixture",
    groundStationDetails: { operationalStatus: "available", uplinkRateMbps: 10, downlinkRateMbps: 8 },
  }));
  const windowsByStation = new Map([
    ["station-a", [[10, 60], [100, 140]]],
    ["station-b", [[40, 60], [100, 140]]],
    ["station-c", [[60, 80], [100, 140]]],
  ]);
  const predictor = (candidate, candidateStations, startsAtSeconds, endsAtSeconds) => candidateStations.flatMap((station) =>
    (windowsByStation.get(station.id) ?? []).flatMap(([windowStart, windowEnd]) => {
      if (windowEnd < startsAtSeconds || windowStart > endsAtSeconds) return [];
      const start = Math.max(windowStart, startsAtSeconds);
      const end = Math.min(windowEnd, endsAtSeconds);
      if (end <= start) return [];
      return [{
        satelliteId: candidate.id, stationId: station.id, stationName: station.name,
        startsAtSeconds: start, endsAtSeconds: end,
        continuesBeforeWindow: windowStart < startsAtSeconds,
        continuesAfterWindow: windowEnd > endsAtSeconds,
      }];
    }),
  );
  const market = makeMarket();
  const loop = new OperationalLoop({
    fleet: [satellite], stations, scenario: SCENARIO, getMarket: () => market,
    storageCapacityBytesBySatellite: { [satellite.id]: IMAGE_BYTES },
    imageSizeBytes: IMAGE_BYTES, contactPredictor: predictor,
  });

  loop.reviseGroundPlan(satellite.id, [{ id: "idle", label: "Idle", durationSeconds: 500 }], 0);
  loop.advanceBy(15);
  assert.deepEqual(loop.groundOperations.events.filter(({ kind }) => kind === "tel-uploaded").map(({ timeSeconds }) => timeSeconds), [10]);

  const secondVersion = loop.reviseGroundPlan(satellite.id, [{ id: "second", label: "Second revision", durationSeconds: 500 }], 15);
  loop.advanceBy(50);
  assert.equal(loop.runtime.elapsedSeconds, 65);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, 1);
  assert.equal(loop.groundOperations.events.filter(({ kind }) => kind === "tel-uploaded").length, 1);

  const thirdVersion = loop.reviseGroundPlan(satellite.id, [{ id: "third", label: "Third revision", durationSeconds: 500 }], 65);
  loop.advanceBy(40);
  const uploads = loop.groundOperations.events.filter(({ kind }) => kind === "tel-uploaded");
  assert.deepEqual(uploads.map(({ timeSeconds }) => timeSeconds), [10, 100]);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, thirdVersion);
  assert.ok(secondVersion < thirdVersion);
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
  const tied = generateBoundedCellSchedule({
    satellite, grid, market, startsAtSeconds: 10, endsAtSeconds: 40,
    scenario: SCENARIO, initialPointing: nadirPointingAt(satellite, 10),
  });
  assert.equal(tied.search.improvedOverGreedy, false);
  assert.deepEqual(tied.commands, schedule.commands);
  assert.ok(schedule.decisions.length > 0);
  loop.reviseGroundPlan(satellite.id, schedule.commands, 0);
  loop.advanceBy(40);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).onboardTelVersion, 1);
  assert.equal(market.getCaptureEvents().length, schedule.decisions.length);
  assert.equal(loop.groundOperations.events.filter(({ kind }) => kind === "cell-capture-completed").length, schedule.decisions.length);
});

test("greedy planning omits captures that start below the agreed power reserve", () => {
  const world = makeWorld();
  const satellite = world.satellite;
  const target = createWorldSnapshot(satellite, [], 10).subSatellitePoint;
  const grid = makeGrid([cellIdAt(target.latitudeDeg, target.longitudeDeg)], [4]);
  const market = makeMarket(grid);
  const powerConfiguration = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 99 };
  const schedule = generateGreedyCellSchedule({
    satellite,
    grid,
    market,
    startsAtSeconds: 10,
    endsAtSeconds: 40,
    scenario: SCENARIO,
    initialPointing: nadirPointingAt(satellite, 10),
    powerConfiguration,
    initialEnergyWh: 99,
  });
  assert.equal(schedule.decisions.length, 0);
  assert.ok(schedule.commands.every(command => !command.cellCapture));
  const bounded = generateBoundedCellSchedule({
    satellite, grid, market, startsAtSeconds: 10, endsAtSeconds: 40,
    scenario: SCENARIO, initialPointing: nadirPointingAt(satellite, 10),
    powerConfiguration, initialEnergyWh: 99,
  });
  assert.equal(bounded.decisions.length, 0);
});

test("bounded search finds a feasible two-capture sequence that beats greedy", () => {
  const world = makeWorld();
  const satellite = {
    ...world.satellite,
    slew: { slewRateDegPerSecond: 0.2, settlingTimeSeconds: 0 },
  };
  const point = createWorldSnapshot(satellite, [], 10).subSatellitePoint;
  const nearA = cellIdAt(point.latitudeDeg, point.longitudeDeg);
  const nearB = cellIdAt(point.latitudeDeg, point.longitudeDeg + 0.25);
  const far = cellIdAt(point.latitudeDeg, point.longitudeDeg + 1);
  const sorted = [nearA, nearB, far].sort((a, b) => a - b);
  const grid = makeGrid(sorted, sorted.map(id => id === far ? 12 : 8));
  const market = makeMarket(grid);
  const input = {
    satellite, grid, market, startsAtSeconds: 10, endsAtSeconds: 130,
    scenario: { ...SCENARIO, maximumOffNadirAngleDeg: 45, collectionDurationSeconds: 15 },
  };
  const greedy = generateGreedyCellSchedule(input);
  const bounded = generateBoundedCellSchedule(input);
  assert.deepEqual(greedy.decisions.map(decision => decision.cellId), [far]);
  assert.ok([nearA, nearB].includes(bounded.decisions[0].cellId));
  assert.equal(bounded.decisions[1].cellId, far);
  assert.ok(bounded.projectedPriorityPoints > greedy.projectedPriorityPoints);
  assert.ok(bounded.search.improvedOverGreedy);
  assert.ok(bounded.search.maximumSegmentExtensions <= PROTOTYPE_BEAM_EXTENSION_BUDGET);
  assert.deepEqual(generateBoundedCellSchedule(input), bounded);
  let cursor = input.startsAtSeconds;
  let pointing = nadirPointingAt(satellite, cursor);
  for (const command of bounded.commands) {
    if (command.cellCapture) {
      const feasibility = evaluateCellCaptureOpportunity({
        satellite, target: command.cellCapture.target, previousPointing: pointing,
        startsAtSeconds: cursor, scenario: input.scenario,
      });
      assert.ok(feasibility.feasible);
      assert.ok(Math.abs(feasibility.completesAtSeconds - cursor - command.durationSeconds) < 1e-6);
      pointing = feasibility.endPointingDirection;
    }
    cursor += command.durationSeconds;
  }
  assert.ok(Math.abs(cursor - input.endsAtSeconds) < 1e-6);
});

test("bounded search stops at its per-segment extension budget", () => {
  const world = makeWorld();
  const point = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
  const ids = Array.from({ length: 9 }, (_, index) =>
    cellIdAt(point.latitudeDeg, point.longitudeDeg + index * 0.25)).sort((a, b) => a - b);
  const grid = makeGrid(ids, ids.map(() => 4));
  const schedule = generateBoundedCellSchedule({
    satellite: world.satellite, grid, market: makeMarket(grid),
    startsAtSeconds: 10, endsAtSeconds: 130,
    scenario: { ...SCENARIO, collectionDurationSeconds: 2 },
  });
  assert.equal(schedule.search.maximumSegmentExtensions, PROTOTYPE_BEAM_EXTENSION_BUDGET);
  assert.ok(schedule.commands.every(command => command.durationSeconds > 0));
});

test("automatic planning treats chained touching contacts as one episode", () => {
  const windows = [[10, 20], [20, 30], [30, 40], [200, 300]];
  const world = makeWorld({ windows });
  const target = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
  const grid = makeGrid([cellIdAt(target.latitudeDeg, target.longitudeDeg)], [4]);
  const market = makeMarket(grid);
  const { satellite, loop } = makeLoop({ market, windows });
  loop.enableAutomaticPlanning(satellite.id, grid);
  const plan = loop.groundOperations.getSatelliteState(satellite.id).groundPlan;
  assert.ok(plan.length > 0);
  assert.ok(Math.abs(plan.reduce((total, command) => total + command.durationSeconds, 0) - 190) < 1e-6);
});

test("automatic TEL refresh is opt-in, follows priority and simulation-time changes, and retains a plan without a contact pair", () => {
  const contactWindows = [[10, 80], [200, 300], [400, 500]];
  const world = makeWorld({ windows: contactWindows });
  const target = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
  const grid = makeGrid([cellIdAt(target.latitudeDeg, target.longitudeDeg)], [4]);
  const market = makeMarket(grid);
  const { satellite, loop } = makeLoop({ market, windows: contactWindows });
  const pair = loop.enableAutomaticPlanning(satellite.id, grid);
  assert.equal(pair, null);
  const initialVersion = loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion;
  assert.ok(initialVersion > 0);

  market.updatePlayerPriorityRates([{ categoryId: "fixture", unit: "unit", pointsPerUnit: 8 }]);
  loop.notifySchedulingInputsChanged();
  const priorityVersion = loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion;
  assert.ok(priorityVersion > initialVersion);

  loop.advanceBy(120);
  const timedVersion = loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion;
  assert.ok(timedVersion > priorityVersion);

  contactWindows.length = 0;
  loop.advanceBy(120);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion, timedVersion);
});

test("automatic planning carries through successive contact cycles with identical large and partitioned advances", () => {
  const run = (steps) => {
    const contactWindows = [[10, 80], [200, 300], [400, 500], [600, 700]];
    const world = makeWorld({ windows: contactWindows });
    const target = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
    const grid = makeGrid([cellIdAt(target.latitudeDeg, target.longitudeDeg)], [4]);
    const market = makeMarket(grid);
    const { satellite, loop } = makeLoop({ market, windows: contactWindows });
    loop.enableAutomaticPlanning(satellite.id, grid);
    for (const step of steps) loop.advanceBy(step);
    return {
      uploads: loop.groundOperations.events.filter(({ kind }) => kind === "tel-uploaded")
        .map(({ timeSeconds, planVersion }) => [timeSeconds, planVersion]),
      captures: loop.groundOperations.events.filter(({ kind }) => kind === "cell-capture-completed" || kind === "cell-capture-failed")
        .map(({ kind, timeSeconds }) => [kind, timeSeconds]),
      groundPlanVersion: loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion,
    };
  };

  const largeAdvance = run([500]);
  const partitionedAdvance = run(Array(50).fill(10));
  assert.deepEqual(largeAdvance, partitionedAdvance);
  assert.deepEqual(largeAdvance.uploads.map(([time]) => time), [10, 200, 400]);
});

test("a command completion and the same-time two-minute boundary trigger one coalesced refresh", () => {
  const contactWindows = [[10, 80], [200, 300], [400, 500]];
  const world = makeWorld({ windows: contactWindows });
  const target = createWorldSnapshot(world.satellite, [], 10).subSatellitePoint;
  const grid = makeGrid([cellIdAt(target.latitudeDeg, target.longitudeDeg)], [4]);
  const market = makeMarket(grid);
  const { satellite, loop } = makeLoop({ market, windows: contactWindows });
  loop.reviseGroundPlan(satellite.id, [
    { id: "wait", label: "Committed wait", durationSeconds: 110 },
    { id: "locked", label: "Locked capture", durationSeconds: 20, cellCapture: { cellIndex: 0, target } },
    { id: "next", label: "Next capture", durationSeconds: 20, cellCapture: { cellIndex: 0, target } },
  ], 0);
  loop.advanceBy(11);
  loop.enableAutomaticPlanning(satellite.id, grid);
  const versionBeforeBoundary = loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion;

  loop.advanceBy(109);

  assert.equal(loop.runtime.elapsedSeconds, 120);
  assert.equal(loop.groundOperations.getSatelliteState(satellite.id).groundPlanVersion, versionBeforeBoundary + 1);
});

test("a contact upload preserves the active and next capture while replacing only the tentative suffix", () => {
  const { satellite, loop } = makeLoop({ windows: [[10, 80], [200, 300]] });
  const original = [
    { id: "active", label: "Active capture", durationSeconds: 400, cellCapture: { cellIndex: 0, target: targetA } },
    { id: "next", label: "Next capture", durationSeconds: 10, cellCapture: { cellIndex: 1, target: targetB } },
    { id: "old-tail", label: "Old tentative capture", durationSeconds: 10, cellCapture: { cellIndex: 0, target: targetA } },
  ];
  loop.reviseGroundPlan(satellite.id, original, 0);
  loop.advanceBy(101);
  const prefix = loop.groundOperations.getCommittedPrefixCommands(satellite.id);
  assert.deepEqual(prefix.map(({ id }) => id), ["active", "next"]);
  loop.groundOperations.reviseGroundPlan(satellite.id, [
    ...prefix,
    { id: "replacement", label: "Replacement capture", durationSeconds: 12, cellCapture: { cellIndex: 1, target: targetB } },
  ], 101, prefix.length);

  loop.advanceBy(100);
  const state = loop.groundOperations.getSatelliteState(satellite.id);
  assert.equal(state.onboardTelVersion, state.groundPlanVersion);
  assert.deepEqual(state.onboardCommands.map(({ id }) => id), ["active", "next", "replacement"]);
  const runtime = loop.runtime.getSatelliteState(satellite.id);
  assert.equal(runtime.currentAction?.id, `tel:${satellite.id}:v1:active`);
  assert.equal(runtime.queuedActions[0]?.id, `tel:${satellite.id}:v1:next`);
  assert.equal(runtime.queuedActions[1]?.id, `tel:${satellite.id}:v2:replacement`);
});

test("slew capability changes feasible capture throughput within a fixed planning window", () => {
  const baseSatellite = INITIAL_FLEET.satellites[0];
  const subpoint = createWorldSnapshot(baseSatellite, [], 0).subSatellitePoint;
  const targets = [
    { latitudeDeg: subpoint.latitudeDeg, longitudeDeg: subpoint.longitudeDeg },
    { latitudeDeg: subpoint.latitudeDeg + 5, longitudeDeg: subpoint.longitudeDeg + 5 },
    { latitudeDeg: subpoint.latitudeDeg, longitudeDeg: subpoint.longitudeDeg },
    { latitudeDeg: subpoint.latitudeDeg + 5, longitudeDeg: subpoint.longitudeDeg + 5 },
    { latitudeDeg: subpoint.latitudeDeg, longitudeDeg: subpoint.longitudeDeg },
    { latitudeDeg: subpoint.latitudeDeg + 5, longitudeDeg: subpoint.longitudeDeg + 5 },
  ];
  const countFeasibleCaptures = (slewRateDegPerSecond) => {
    const satellite = {
      ...baseSatellite,
      slew: { slewRateDegPerSecond, settlingTimeSeconds: 0 },
    };
    let cursorSeconds = 0;
    let pointing = nadirPointingAt(satellite, cursorSeconds);
    let completed = 0;
    for (const target of targets) {
      const feasibility = evaluateCellCaptureOpportunity({
        satellite,
        target,
        previousPointing: pointing,
        startsAtSeconds: cursorSeconds,
        scenario: { maximumOffNadirAngleDeg: 180, collectionDurationSeconds: 10, requireSunlitTarget: false },
      });
      if (!feasibility.feasible || feasibility.completesAtSeconds > 120) break;
      completed += 1;
      cursorSeconds = feasibility.completesAtSeconds;
      pointing = feasibility.endPointingDirection;
    }
    return completed;
  };

  const slowThroughput = countFeasibleCaptures(0.1);
  const fastThroughput = countFeasibleCaptures(10);
  assert.equal(slowThroughput, 1);
  assert.equal(fastThroughput, 6);
});
