import test from "node:test";
import assert from "node:assert/strict";
import { getSatelliteTelImageProgress } from "../src/simulation/satellitePerformance.ts";

test("TEL image progress counts only current-plan captures whose images remain onboard", () => {
  const result = getSatelliteTelImageProgress("sat-a", [
    { id: "capture-1", cellCapture: {} },
    { id: "wait", wait: {} },
    { id: "capture-2", cellCapture: {} },
  ], [
    { satelliteId: "sat-a", captureCommandId: "capture-1", status: "onboard" },
    { satelliteId: "sat-a", captureCommandId: "capture-2", status: "delivered" },
    { satelliteId: "sat-a", captureCommandId: "old-plan", status: "onboard" },
    { satelliteId: "sat-a", captureCommandId: "capture-2", status: "deleted" },
    { satelliteId: "sat-b", captureCommandId: "capture-2", status: "onboard" },
    { satelliteId: "sat-a", status: "onboard" },
  ]);

  assert.deepEqual(result, { onboardImageCount: 1, plannedCaptureCount: 2 });
});

test("TEL image progress handles an empty or non-capture TEL", () => {
  assert.deepEqual(getSatelliteTelImageProgress("sat-a", [], []), {
    onboardImageCount: 0,
    plannedCaptureCount: 0,
  });
  assert.deepEqual(getSatelliteTelImageProgress("sat-a", [{ id: "wait" }], []), {
    onboardImageCount: 0,
    plannedCaptureCount: 0,
  });
});
