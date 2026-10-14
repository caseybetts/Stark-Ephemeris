import type { SlewCapability } from "./model";

export type PointingDirection = { x: number; y: number; z: number };

/**
 * Minimum prototype retarget time for two pointing directions in one frame.
 * This models angular travel at a constant configured rate plus settling time;
 * axis limits, acceleration, and path constraints are intentionally omitted.
 */
export function calculateRetargetDurationSeconds(
  fromDirection: PointingDirection,
  toDirection: PointingDirection,
  capability: SlewCapability,
): number {
  validateDirection(fromDirection, "fromDirection");
  validateDirection(toDirection, "toDirection");
  if (!Number.isFinite(capability.slewRateDegPerSecond) || capability.slewRateDegPerSecond <= 0) {
    throw new RangeError("Slew rate must be finite and positive");
  }
  if (!Number.isFinite(capability.settlingTimeSeconds) || capability.settlingTimeSeconds < 0) {
    throw new RangeError("Settling time must be finite and non-negative");
  }

  const fromMagnitude = magnitude(fromDirection);
  const toMagnitude = magnitude(toDirection);
  const cosine = Math.max(-1, Math.min(1, dot(fromDirection, toDirection) / (fromMagnitude * toMagnitude)));
  const angularDistanceDeg = Math.acos(cosine) * 180 / Math.PI;
  if (angularDistanceDeg <= Number.EPSILON) return 0;
  return angularDistanceDeg / capability.slewRateDegPerSecond + capability.settlingTimeSeconds;
}

function validateDirection(direction: PointingDirection, name: string): void {
  if (![direction.x, direction.y, direction.z].every(Number.isFinite) || magnitude(direction) === 0) {
    throw new RangeError(`${name} must be a finite, non-zero direction`);
  }
}

function magnitude(vector: PointingDirection): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot(left: PointingDirection, right: PointingDirection): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
