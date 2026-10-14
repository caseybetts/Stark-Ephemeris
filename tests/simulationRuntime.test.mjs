import test from "node:test";
import assert from "node:assert/strict";
import { SimulationRuntime } from "../src/simulation/runtime.ts";

function runWithSteps(steps) {
  const runtime = new SimulationRuntime(["sat-a", "sat-b"]);
  runtime.queueAction("sat-a", "capture-a", "capture", 5);
  runtime.queueAction("sat-a", "downlink-a", "downlink", 3);
  runtime.queueAction("sat-b", "slew-b", "slew", 2);
  for (const seconds of steps) runtime.advanceBy(seconds);
  return runtime;
}

test("action completions and final spacecraft state are invariant to time-step size", () => {
  const singleAdvance = runWithSteps([10]);
  const frequentAdvances = runWithSteps(Array(10).fill(1));

  assert.equal(singleAdvance.elapsedSeconds, frequentAdvances.elapsedSeconds);
  assert.deepEqual(singleAdvance.events, frequentAdvances.events);
  assert.deepEqual(singleAdvance.getSatelliteState("sat-a"), frequentAdvances.getSatelliteState("sat-a"));
  assert.deepEqual(singleAdvance.getSatelliteState("sat-b"), frequentAdvances.getSatelliteState("sat-b"));
  assert.deepEqual(
    singleAdvance.events.filter(({ kind }) => kind === "action-completed").map(({ actionId, timeSeconds }) => [actionId, timeSeconds]),
    [["slew-b", 2], ["capture-a", 5], ["downlink-a", 8]],
  );
});

test("actions for one satellite queue sequentially while another satellite proceeds independently", () => {
  const runtime = new SimulationRuntime(["sat-a", "sat-b"]);
  runtime.queueAction("sat-a", "first", "slew", 4);
  const queued = runtime.queueAction("sat-a", "second", "capture", 3);
  runtime.queueAction("sat-b", "parallel", "capture", 2);

  assert.equal(queued.status, "queued");
  assert.equal(queued.startsAtSeconds, 4);
  assert.equal(runtime.getSatelliteState("sat-a").currentAction?.id, "first");

  runtime.advanceBy(4);
  assert.deepEqual(runtime.events.slice(-2).map(({ actionId, kind }) => [actionId, kind]), [
    ["first", "action-completed"],
    ["second", "action-started"],
  ]);
  assert.equal(runtime.getSatelliteState("sat-a").currentAction?.id, "second");
  assert.equal(runtime.getSatelliteState("sat-b").currentAction, null);
});

test("invalid actions and time advances leave runtime state unchanged", () => {
  const runtime = new SimulationRuntime(["sat-a"]);
  runtime.queueAction("sat-a", "valid", "capture", 2);
  const eventsBefore = runtime.events;

  assert.throws(() => runtime.queueAction("sat-a", "valid", "capture", 1), /duplicate action ID/);
  assert.throws(() => runtime.queueAction("missing", "other", "capture", 1), /Unknown satellite/);
  assert.throws(() => runtime.queueAction("sat-a", "negative", "capture", -1), /duration/);
  assert.throws(() => runtime.advanceBy(Number.NaN), /finite and non-negative/);
  assert.throws(() => runtime.advanceBy(Number.POSITIVE_INFINITY), /finite and non-negative/);
  assert.equal(runtime.elapsedSeconds, 0);
  assert.deepEqual(runtime.events, eventsBefore);
});

test("reset restores a fresh domain runtime without affecting configured spacecraft", () => {
  const runtime = new SimulationRuntime(["sat-a"]);
  runtime.queueAction("sat-a", "capture", "capture", 2);
  runtime.advanceBy(3);
  runtime.reset();

  assert.equal(runtime.elapsedSeconds, 0);
  assert.deepEqual(runtime.events, []);
  assert.deepEqual(runtime.getSatelliteState("sat-a"), {
    satelliteId: "sat-a",
    currentAction: null,
    queuedActions: [],
  });
});
