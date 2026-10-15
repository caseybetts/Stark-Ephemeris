import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FLEET } from "../src/simulation/constants.ts";
import {
  isEclipsedAt,
  nextIlluminationBoundary,
  PowerOperations,
  projectSatellitePower,
  PROTOTYPE_POWER_CONFIGURATION,
  validatePowerConfiguration,
} from "../src/simulation/power.ts";

const satellite = INITIAL_FLEET.satellites[0];
const near = (actual, expected, tolerance = 1e-6) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`,
);

test("sunlight and eclipse projections integrate Wh from simulation seconds", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION };
  assert.equal(isEclipsedAt(satellite, 0), false);
  assert.equal(isEclipsedAt(satellite, 2_000), true);
  near(projectSatellitePower(satellite, 400, 0, 600, 50, config).energyWh, 441.6666666667);
  near(projectSatellitePower(satellite, 400, 2_000, 2_600, 50, config).energyWh, 391.6666666667);
});

test("capture admission checks minimum charge over eclipse, not just final charge", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 104 };
  const power = new PowerOperations({ [satellite.id]: config });
  const admitted = power.beginCapture(satellite.id, satellite, 2_000, 45, "capture-104");
  assert.equal(admitted.admitted, true);
  const projected = projectSatellitePower(satellite, 104, 2_000, 2_045, 300, config);
  near(projected.energyWh, 100.25);
  near(projected.minimumWh, 100.25);

  power.completeCapture("capture-104");
  const lowPower = new PowerOperations({ [satellite.id]: { ...config, initialEnergyWh: 102 } });
  const rejected = lowPower.beginCapture(satellite.id, satellite, 2_000, 45, "capture-102");
  assert.equal(rejected.admitted, false);
  assert.match(rejected.reason, /reserve/);
});

test("capture rejects an eclipse reserve dip even when later sunlight raises the ending charge", () => {
  const config = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 110,
    captureAdditionalW: 0,
  };
  const projected = projectSatellitePower(satellite, 110, 1_500, 4_500,
    config.housekeepingW, config);
  assert.ok(projected.minimumWh < config.reserveWh);
  assert.ok(projected.energyWh > config.reserveWh);
  const power = new PowerOperations({ [satellite.id]: config });
  assert.equal(power.beginCapture(satellite.id, satellite, 1_500, 3_000, "eclipse-dip").admitted, false);
});

test("energy totals conserve charge through capacity spill and depletion", () => {
  const config = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 490,
    capacityWh: 500,
    reserveWh: 100,
    restartWh: 150,
    housekeepingW: 50,
  };
  const power = new PowerOperations({ [satellite.id]: config });
  power.advanceInterval(satellite, 0, 600, null);
  let snapshot = power.getSnapshot(satellite.id, satellite, 600);
  near(snapshot.energyWh, 500);
  near(config.initialEnergyWh + snapshot.generatedWh - snapshot.consumedWh - snapshot.spilledWh, snapshot.energyWh);
  near(snapshot.spilledWh, 31.6666666667);

  const depletedConfig = { ...config, initialEnergyWh: 0.1, capacityWh: 500 };
  const depleted = new PowerOperations({ [satellite.id]: depletedConfig });
  const zeroCrossing = depleted.nextBoundarySeconds(satellite, 2_000, 2_012, depletedConfig.reserveWh);
  near(zeroCrossing, 2_007.2);
  depleted.advanceInterval(satellite, 2_000, zeroCrossing, null);
  snapshot = depleted.getSnapshot(satellite.id, satellite, zeroCrossing);
  assert.equal(snapshot.depleted, true);
  near(snapshot.energyWh, 0);
  near(depletedConfig.initialEnergyWh + snapshot.generatedWh - snapshot.consumedWh - snapshot.spilledWh, snapshot.energyWh);
});

test("depleted spacecraft resumes housekeeping at the exact restart boundary", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 0 };
  const power = new PowerOperations({ [satellite.id]: config });
  const crossing = power.nextBoundarySeconds(satellite, 4_000, 6_000, config.reserveWh);
  near(crossing, 5_800);
  power.advanceInterval(satellite, 4_000, crossing, null);
  const snapshot = power.getSnapshot(satellite.id, satellite, crossing);
  near(snapshot.energyWh, config.restartWh);
  assert.equal(snapshot.depleted, false);
  assert.deepEqual(power.events.map(event => event.kind), ["recovered"]);
});

test("radio pauses at the guard and resumes at guard plus margin under deficit", () => {
  const config = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 110,
    solarGenerationW: 100,
  };
  const power = new PowerOperations({ [satellite.id]: config });
  power.updateRadio(satellite.id, true, 100, true);
  assert.equal(power.radioIsRunning(satellite.id), true);
  const guardCrossing = power.nextBoundarySeconds(satellite, 0, 500, 100);
  near(guardCrossing, 360);
  power.advanceInterval(satellite, 0, guardCrossing, guardCrossing);
  power.updateRadio(satellite.id, true, 100, true);
  assert.equal(power.radioIsRunning(satellite.id), false);
  assert.equal(power.getSnapshot(satellite.id, satellite, guardCrossing).radioPaused, true);

  const restartCrossing = power.nextBoundarySeconds(satellite, guardCrossing, guardCrossing + 800, 100);
  near(restartCrossing, guardCrossing + 720);
  power.advanceInterval(satellite, guardCrossing, restartCrossing, null);
  power.updateRadio(satellite.id, true, 100, true);
  assert.equal(power.radioIsRunning(satellite.id), true);
});

test("unreachable radio restart margin waits at capacity without a zero-time loop", () => {
  const configuration = {
    ...PROTOTYPE_POWER_CONFIGURATION,
    initialEnergyWh: 500,
    solarGenerationW: 100,
    downlinkRestartMarginWh: 450,
  };
  const power = new PowerOperations({ [satellite.id]: configuration });
  power.updateRadio(satellite.id, true, 100, true);
  assert.equal(power.radioIsRunning(satellite.id), false);
  assert.equal(power.getSnapshot(satellite.id, satellite, 0).radioPaused, true);
  assert.equal(power.nextBoundarySeconds(satellite, 0, 600, 100), null);

  const sustainable = new PowerOperations({
    [satellite.id]: { ...configuration, solarGenerationW: 300, downlinkRestartMarginWh: 10 },
  });
  sustainable.updateRadio(satellite.id, true, 100, true);
  assert.equal(sustainable.radioIsRunning(satellite.id), true);
  sustainable.updateRadio(satellite.id, true, 501, true);
  assert.equal(sustainable.radioIsRunning(satellite.id), false);
});

test("eclipse boundary prediction is stable across caller time partitions", () => {
  const boundary = nextIlluminationBoundary(satellite, 1_000, 2_000);
  assert.ok(boundary !== null && boundary > 1_000 && boundary < 2_000);
  const config = { ...PROTOTYPE_POWER_CONFIGURATION };
  const large = projectSatellitePower(satellite, 400, 0, 6_000, 50, config);
  let time = 0;
  let energy = 400;
  let minimum = energy;
  while (time < 6_000) {
    const end = Math.min(time + 137, 6_000);
    const result = projectSatellitePower(satellite, energy, time, end, 50, config);
    energy = result.energyWh;
    minimum = Math.min(minimum, result.minimumWh);
    time = end;
  }
  near(energy, large.energyWh, 1e-6);
  near(minimum, large.minimumWh, 1e-6);
});

test("power state, energy ledger and depletion boundaries are invariant to advance partitions", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION };
  const run = (maximumStep) => {
    const power = new PowerOperations({ [satellite.id]: config });
    let time = 0;
    while (time < 10_000) {
      const target = Math.min(10_000, time + maximumStep);
      const powerBoundary = power.nextBoundarySeconds(satellite, time, target, config.reserveWh);
      const end = Math.min(target, powerBoundary ?? target);
      assert.ok(end > time, `power boundary must advance from ${time}`);
      power.advanceInterval(satellite, time, end, null);
      time = end;
    }
    return power.getSnapshot(satellite.id, satellite, time);
  };
  const large = run(10_000);
  const regular = run(73);
  const irregular = run(211);
  for (const result of [regular, irregular]) {
    near(result.energyWh, large.energyWh, 1e-6);
    near(result.generatedWh, large.generatedWh, 1e-6);
    near(result.consumedWh, large.consumedWh, 1e-6);
    near(result.spilledWh, large.spilledWh, 1e-6);
  }
  near(config.initialEnergyWh + large.generatedWh - large.consumedWh - large.spilledWh, large.energyWh);
});

test("invalid power configuration is rejected before creating a power system", () => {
  assert.throws(() => validatePowerConfiguration({
    ...PROTOTYPE_POWER_CONFIGURATION,
    reserveWh: PROTOTYPE_POWER_CONFIGURATION.restartWh,
  }), RangeError);
});

test("reset restores initial charge and clears the energy ledger and events", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 0 };
  const power = new PowerOperations({ [satellite.id]: config });
  const crossing = power.nextBoundarySeconds(satellite, 4_000, 6_000, config.reserveWh);
  power.advanceInterval(satellite, 4_000, crossing, null);
  assert.ok(power.events.length > 0);
  assert.ok(power.getSnapshot(satellite.id, satellite, crossing).generatedWh > 0);

  power.reset();
  const reset = power.getSnapshot(satellite.id, satellite, 0);
  assert.equal(reset.energyWh, config.initialEnergyWh);
  assert.equal(reset.depleted, true);
  assert.equal(reset.generatedWh, 0);
  assert.equal(reset.consumedWh, 0);
  assert.equal(reset.spilledWh, 0);
  assert.deepEqual(power.events, []);
});

test("zero solar generation cannot recover an initially depleted spacecraft", () => {
  const config = { ...PROTOTYPE_POWER_CONFIGURATION, initialEnergyWh: 0, solarGenerationW: 0 };
  const power = new PowerOperations({ [satellite.id]: config });
  let time = 0;
  while (time < 3_600) {
    const boundary = power.nextBoundarySeconds(satellite, time, 3_600, config.reserveWh);
    const end = Math.min(3_600, boundary ?? 3_600);
    assert.ok(end > time);
    power.advanceInterval(satellite, time, end, null);
    time = end;
  }
  const snapshot = power.getSnapshot(satellite.id, satellite, 3_600);
  assert.equal(snapshot.depleted, true);
  assert.equal(snapshot.energyWh, 0);
  assert.equal(snapshot.loadW, 0);
});
