import test from "node:test";
import assert from "node:assert/strict";
import { SatellitePerformance } from "../src/simulation/satellitePerformance.ts";

const attempt = (id, overrides = {}) => ({
  id,
  satelliteId: "sat-a",
  commandId: `command-${id}`,
  startedAtSeconds: 0,
  collectionStartedAtSeconds: 10,
  collectionEndedAtSeconds: 20,
  completedAtSeconds: 20,
  observedCloudCoverPercent: 20,
  acceptedThresholdPercent: 20,
  imageId: null,
  failureKind: null,
  ...overrides,
});

const image = (id, status, revenue = null) => ({
  imageId: id,
  satelliteId: "sat-a",
  status,
  settledRevenueUsd: revenue,
});

test("per-satellite yield separates paid, pending, deleted, weather failures, and other outcomes", () => {
  const performance = new SatellitePerformance(["sat-a"]);
  performance.recordCaptureAttempt(attempt("paid", { imageId: "img-paid" }));
  performance.recordCaptureAttempt(attempt("pending", { imageId: "img-pending", observedCloudCoverPercent: 0 }));
  performance.recordCaptureAttempt(attempt("deleted", { imageId: "img-deleted", observedCloudCoverPercent: 19 }));
  performance.recordCaptureAttempt(attempt("cloud", { failureKind: "weather", observedCloudCoverPercent: 21 }));
  performance.recordCaptureAttempt(attempt("power", { failureKind: "power", observedCloudCoverPercent: null }));
  performance.recordCaptureAttempt(attempt("zero", { imageId: "img-zero", observedCloudCoverPercent: 20 }));

  const snapshot = performance.getYieldSnapshot("sat-a", [
    image("img-paid", "delivered", 12.34),
    image("img-pending", "onboard"),
    image("img-deleted", "deleted"),
    image("img-zero", "delivered", 0),
  ]);
  const { paidClearPercent, ...counts } = snapshot;
  assert.deepEqual(counts, {
    attemptCount: 6,
    paidClearCount: 1,
    pendingCount: 1,
    deletedCount: 1,
    cloudRejectedCount: 1,
    otherFailureCount: 1,
    otherDeliveredCount: 1,
    deliveredRevenueCents: 1_234,
  });
  assert.equal(Number(paidClearPercent.toFixed(2)), 16.67);
});

test("paid clear yield counts both below and exactly at the inclusive 20% cutoff", () => {
  const performance = new SatellitePerformance(["sat-a"]);
  performance.recordCaptureAttempt(attempt("below", { imageId: "img-below", observedCloudCoverPercent: 19 }));
  performance.recordCaptureAttempt(attempt("equal", { imageId: "img-equal", observedCloudCoverPercent: 20 }));
  performance.recordCaptureAttempt(attempt("above", { imageId: "img-above", observedCloudCoverPercent: 21 }));
  const snapshot = performance.getYieldSnapshot("sat-a", [
    image("img-below", "delivered", 1),
    image("img-equal", "delivered", 1),
    image("img-above", "delivered", 1),
  ]);
  assert.equal(snapshot.paidClearCount, 2);
  assert.equal(Number(snapshot.paidClearPercent.toFixed(2)), 66.67);
  assert.equal(snapshot.otherDeliveredCount, 1);
});

test("operational time is run-scoped, contiguous, and excludes unmodeled categories", () => {
  const performance = new SatellitePerformance(["sat-a"], 12);
  performance.recordOperationalInterval("sat-a", 12, 32, false);
  performance.recordOperationalInterval("sat-a", 32, 47, true);
  const snapshot = performance.getOperationalTimeSnapshot("sat-a", 47);
  assert.deepEqual(snapshot, {
    elapsedSeconds: 35,
    nominalSeconds: 20,
    powerLimitedSeconds: 15,
    anomalySeconds: null,
    scheduledDowntimeSeconds: null,
  });
  assert.throws(() => performance.recordOperationalInterval("sat-a", 46, 50, false), /not contiguous/);
});

