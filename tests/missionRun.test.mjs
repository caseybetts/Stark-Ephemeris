import test from "node:test";
import assert from "node:assert/strict";
import {
  M01_MISSION,
  MissionRunController,
  validateM01Setup,
} from "../src/simulation/missionRun.ts";

const VALID_SETUP = validateM01Setup({
  equipmentOptionId: "standard",
  altitudeKm: 550,
  inclinationDeg: 53,
  ascendingNodeDeg: 12,
  phaseAtLaunchDeg: 8,
}, M01_MISSION.startingBudgetUsd * 100);

test("M01 setup validation accounts for package and station setup costs", () => {
  assert.equal(VALID_SETUP.valid, true);
  assert.equal(VALID_SETUP.stationSetupCostCents, 4 * M01_MISSION.setupFeeCentsPerStation);
  assert.equal(VALID_SETUP.remainingBudgetCents, 5_100_000_00);

  const overBudget = validateM01Setup({
    equipmentOptionId: "enhanced-slew",
    altitudeKm: 550,
    inclinationDeg: 53,
    ascendingNodeDeg: 12,
    phaseAtLaunchDeg: 8,
  }, 55_019_999 * 100);
  assert.equal(overBudget.valid, false);
  assert.match(overBudget.reason, /exceed the mission allowance/);
});

test("M01 rejects invalid orbit and package values before a run can begin", () => {
  for (const draft of [
    { equipmentOptionId: "standard", altitudeKm: 9, inclinationDeg: 53, ascendingNodeDeg: 12, phaseAtLaunchDeg: 8 },
    { equipmentOptionId: "standard", altitudeKm: 550, inclinationDeg: 181, ascendingNodeDeg: 12, phaseAtLaunchDeg: 8 },
    { equipmentOptionId: "missing", altitudeKm: 550, inclinationDeg: 53, ascendingNodeDeg: 12, phaseAtLaunchDeg: 8 },
  ]) {
    const setup = validateM01Setup(draft, M01_MISSION.startingBudgetUsd * 100);
    assert.equal(setup.valid, false);
    const controller = new MissionRunController(100);
    assert.throws(() => controller.begin(0, setup));
    assert.equal(controller.phase, "setup");
  }
});

test("large advances clamp to the deadline and reject later time movement", () => {
  const controller = new MissionRunController(100);
  controller.begin(0, VALID_SETUP);
  let advancedSeconds = 0;
  const elapsed = controller.advanceBy(10_000, 0, seconds => {
    advancedSeconds += seconds;
    return seconds;
  });

  assert.equal(advancedSeconds, 100);
  assert.equal(elapsed, 100);
  assert.equal(controller.phase, "completed");
  assert.equal(controller.advanceBy(1, elapsed, () => assert.fail("completed run advanced")), elapsed);
});

test("a final partial advance reaches the exact deadline once", () => {
  const controller = new MissionRunController(100);
  controller.begin(0, VALID_SETUP);
  let callbackCount = 0;
  let elapsed = controller.advanceBy(35, 0, seconds => seconds);
  elapsed = controller.advanceBy(500, elapsed, seconds => {
    callbackCount += 1;
    assert.equal(seconds, 65);
    return elapsed + seconds;
  });

  assert.equal(elapsed, 100);
  assert.equal(callbackCount, 1);
  assert.equal(controller.phase, "completed");
});

test("pause blocks advancement and active attempts cannot be retried", () => {
  const controller = new MissionRunController(100);
  controller.begin(0, VALID_SETUP);
  controller.pause();
  assert.equal(controller.advanceBy(10, 0, () => assert.fail("paused run advanced")), 0);
  assert.throws(() => controller.retry(), /must finish/);
  assert.equal(controller.phase, "paused");
});

test("completion evaluation is idempotent and retry clears the prior outcome", () => {
  const controller = new MissionRunController(100);
  controller.begin(0, VALID_SETUP);
  controller.advanceBy(100, 0, seconds => seconds);
  const first = controller.evaluate(200_000);
  const repeated = controller.evaluate(0);
  assert.equal(first.success, true);
  assert.deepEqual(repeated, first);

  controller.retry();
  assert.equal(controller.phase, "setup");
  assert.equal(controller.outcome, null);
  controller.begin(0, VALID_SETUP);
  assert.equal(controller.phase, "running");
});
