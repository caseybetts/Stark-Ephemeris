import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SATELLITE } from "../src/simulation/constants.ts";
import { circularOrbitPeriodSeconds, isSatelliteEclipsed, satellitePositionInertial } from "../src/simulation/world.ts";

test("default spacecraft alternates between sunlight and Earth eclipse each orbit", () => {
  const period = circularOrbitPeriodSeconds(DEFAULT_SATELLITE.orbit.altitudeKm);
  const sun = { x: 1, y: 0, z: 0 };
  const stateAt = (seconds) => isSatelliteEclipsed(
    satellitePositionInertial(DEFAULT_SATELLITE.orbit, seconds),
    sun,
  );

  assert.equal(stateAt(0), false);
  assert.equal(stateAt(period * 0.45), true);
  assert.equal(stateAt(period * 0.8), false);
  assert.equal(stateAt(period), false);
});
