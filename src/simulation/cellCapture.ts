import { EARTH_MEAN_RADIUS_KM } from "./constants.ts";
import type { GeographicLocation, SatelliteDefinition, Vector3Km } from "./model.ts";
import {
  isSurfaceLocationSunlit,
  rotateInertialToEarthFixed,
  satellitePositionInertial,
  surfaceNormal,
} from "./world.ts";
import { calculateRetargetDurationSeconds, type PointingDirection } from "./slew.ts";

/** Scenario inputs stay explicit because the initial gameplay values are open. */
export type CellCaptureScenario = {
  maximumOffNadirAngleDeg: number;
  collectionDurationSeconds: number;
  requireSunlitTarget: boolean;
};

export type CellCaptureOpportunity = {
  satellite: SatelliteDefinition;
  target: GeographicLocation;
  previousPointing: PointingDirection;
  startsAtSeconds: number;
  scenario: CellCaptureScenario;
};

export type CellCaptureFeasibility = {
  feasible: boolean;
  reason: "feasible" | "invalid-scenario" | "outside-access-at-start" | "outside-access-at-completion"
    | "target-in-darkness-at-start" | "target-in-darkness-at-completion";
  slewDurationSeconds: number;
  collectionStartsAtSeconds: number;
  completesAtSeconds: number;
  startingOffNadirAngleDeg: number;
  completionOffNadirAngleDeg: number;
  endPointingDirection: PointingDirection;
};

/**
 * Shared geometric opportunity calculation for the scheduler and executor.
 * The caller supplies the scenario limits; no access or timing balance is
 * implied by this module. Capture is modeled at the cell center and checked
 * at collection start and completion. Illumination, weather, power, and
 * partial-cell imaging are outside this foundation.
 */
export function evaluateCellCaptureOpportunity(
  opportunity: CellCaptureOpportunity,
): CellCaptureFeasibility {
  const { satellite, target, previousPointing, startsAtSeconds, scenario } = opportunity;
  const invalid = !Number.isFinite(startsAtSeconds) || startsAtSeconds < 0
    || !Number.isFinite(scenario.maximumOffNadirAngleDeg)
    || scenario.maximumOffNadirAngleDeg < 0 || scenario.maximumOffNadirAngleDeg > 180
    || !Number.isFinite(scenario.collectionDurationSeconds)
    || scenario.collectionDurationSeconds <= 0
    || typeof scenario.requireSunlitTarget !== "boolean";
  if (invalid) {
    return result(false, "invalid-scenario", 0, startsAtSeconds, scenario.collectionDurationSeconds, 0, 0, { x: 0, y: 0, z: 0 });
  }

  const startGeometry = lookGeometry(satellite, target, startsAtSeconds);
  const slewDurationSeconds = calculateRetargetDurationSeconds(
    previousPointing,
    startGeometry.lookDirection,
    satellite.slew,
  );
  const collectionStartsAtSeconds = startsAtSeconds + slewDurationSeconds;
  const completesAtSeconds = collectionStartsAtSeconds + scenario.collectionDurationSeconds;
  const start = lookGeometry(satellite, target, collectionStartsAtSeconds);
  const completion = lookGeometry(satellite, target, completesAtSeconds);
  const reason = start.offNadirAngleDeg > scenario.maximumOffNadirAngleDeg
    ? "outside-access-at-start"
    : completion.offNadirAngleDeg > scenario.maximumOffNadirAngleDeg
      ? "outside-access-at-completion"
      : scenario.requireSunlitTarget && !start.sunlit
        ? "target-in-darkness-at-start"
        : scenario.requireSunlitTarget && !completion.sunlit
          ? "target-in-darkness-at-completion"
      : "feasible";
  return result(
    reason === "feasible",
    reason,
    slewDurationSeconds,
    collectionStartsAtSeconds,
    completesAtSeconds,
    start.offNadirAngleDeg,
    completion.offNadirAngleDeg,
    completion.lookDirection,
  );
}

/** Pointing target vector from the spacecraft toward the cell center. */
export function cellLookDirectionAt(
  satellite: SatelliteDefinition,
  target: GeographicLocation,
  timeSeconds: number,
): PointingDirection {
  return lookGeometry(satellite, target, timeSeconds).lookDirection;
}

/** Initial prototype attitude: nadir-pointing at the supplied time. */
export function nadirPointingAt(satellite: SatelliteDefinition, timeSeconds: number): PointingDirection {
  const position = rotateInertialToEarthFixed(
    satellitePositionInertial(satellite.orbit, timeSeconds),
    timeSeconds,
  );
  return { x: -position.x, y: -position.y, z: -position.z };
}

/** Conservative ground-arc bound for finding cells that may meet a scenario's look angle. */
export function maximumAccessSurfaceRadiusKm(
  satellite: SatelliteDefinition,
  maximumOffNadirAngleDeg: number,
): number {
  if (!Number.isFinite(maximumOffNadirAngleDeg) || maximumOffNadirAngleDeg < 0 || maximumOffNadirAngleDeg > 180) {
    throw new RangeError("Maximum off-nadir angle must be between 0 and 180 degrees");
  }
  const radius = EARTH_MEAN_RADIUS_KM;
  const orbitRadius = radius + satellite.orbit.altitudeKm;
  const horizonAngle = Math.asin(radius / orbitRadius);
  const offNadir = Math.min(maximumOffNadirAngleDeg * Math.PI / 180, horizonAngle);
  const centralAngle = Math.asin(clamp(orbitRadius / radius * Math.sin(offNadir), -1, 1)) - offNadir;
  return Math.max(0, radius * centralAngle);
}

function lookGeometry(
  satellite: SatelliteDefinition,
  target: GeographicLocation,
  timeSeconds: number,
): { lookDirection: Vector3Km; offNadirAngleDeg: number; sunlit: boolean } {
  const inertial = satellitePositionInertial(satellite.orbit, timeSeconds);
  const position = rotateInertialToEarthFixed(inertial, timeSeconds);
  const normal = surfaceNormal(target);
  const targetRadiusKm = EARTH_MEAN_RADIUS_KM;
  const targetPosition = {
    x: normal.x * targetRadiusKm,
    y: normal.y * targetRadiusKm,
    z: normal.z * targetRadiusKm,
  };
  const lookDirection = {
    x: targetPosition.x - position.x,
    y: targetPosition.y - position.y,
    z: targetPosition.z - position.z,
  };
  const nadir = { x: -position.x, y: -position.y, z: -position.z };
  const sunDirectionEarthFixed = rotateInertialToEarthFixed({ x: 1, y: 0, z: 0 }, timeSeconds);
  const cosine = clamp(dot(lookDirection, nadir) / (magnitude(lookDirection) * magnitude(nadir)), -1, 1);
  return {
    lookDirection,
    offNadirAngleDeg: Math.acos(cosine) * 180 / Math.PI,
    sunlit: isSurfaceLocationSunlit(target, sunDirectionEarthFixed),
  };
}

function result(
  feasible: boolean,
  reason: CellCaptureFeasibility["reason"],
  slewDurationSeconds: number,
  collectionStartsAtSeconds: number,
  completesAtSeconds: number,
  startingOffNadirAngleDeg: number,
  completionOffNadirAngleDeg: number,
  endPointingDirection: PointingDirection,
): CellCaptureFeasibility {
  return {
    feasible,
    reason,
    slewDurationSeconds,
    collectionStartsAtSeconds,
    completesAtSeconds,
    startingOffNadirAngleDeg,
    completionOffNadirAngleDeg,
    endPointingDirection,
  };
}

function dot(left: Vector3Km, right: Vector3Km): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vector3Km): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
