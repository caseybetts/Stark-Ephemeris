import type { SatelliteDefinition, SurfaceObject } from "./model.ts";
import { createWorldSnapshot } from "./world.ts";

export type GroundContactWindow = {
  satelliteId: string;
  stationId: string;
  stationName: string;
  startsAtSeconds: number;
  endsAtSeconds: number;
  continuesBeforeWindow: boolean;
  continuesAfterWindow: boolean;
};

export type ContactPredictionOptions = {
  /** A reversible prototype search interval; tune after contact gameplay is exercised. */
  sampleStepSeconds?: number;
  /** Refine entry/exit boundaries to this approximate time resolution. */
  boundaryToleranceSeconds?: number;
  /** Stop after each station's first predicted window when planning the next contact. */
  maximumWindowsPerStation?: number;
};

/**
 * Predict contact intervals using the current effective-distance rule. Search
 * only available stations: geometric range and facility status both matter.
 */
export function predictGroundContactWindows(
  satellite: SatelliteDefinition,
  stations: readonly SurfaceObject[],
  startSeconds: number,
  endSeconds: number,
  options: ContactPredictionOptions = {},
): GroundContactWindow[] {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds) {
    throw new RangeError("Contact prediction interval must be finite and non-negative");
  }
  const sampleStepSeconds = options.sampleStepSeconds ?? 30;
  const boundaryToleranceSeconds = options.boundaryToleranceSeconds ?? 1;
  const maximumWindowsPerStation = options.maximumWindowsPerStation ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(sampleStepSeconds) || sampleStepSeconds <= 0) {
    throw new RangeError("Contact sample step must be finite and positive");
  }
  if (!Number.isFinite(boundaryToleranceSeconds) || boundaryToleranceSeconds <= 0) {
    throw new RangeError("Contact boundary tolerance must be finite and positive");
  }
  if (!(maximumWindowsPerStation > 0)) {
    throw new RangeError("Maximum contact windows per station must be positive");
  }

  const availableStations = stations.filter((station) =>
    station.kind === "ground-station"
      && station.groundStationDetails?.operationalStatus === "available",
  );
  const windows: GroundContactWindow[] = [];
  const hasContact = (stationId: string, seconds: number): boolean =>
    createWorldSnapshot(satellite, stations, seconds)
      .stationContacts
      .some((contact) => contact.station.id === stationId && contact.available);

  for (const station of availableStations) {
    let stationWindowCount = 0;
    let previousTime = startSeconds;
    let previousState = hasContact(station.id, previousTime);
    let openStart: number | null = previousState ? startSeconds : null;
    const continuesBeforeWindow = previousState;

    while (previousTime < endSeconds) {
      const nextTime = Math.min(endSeconds, previousTime + sampleStepSeconds);
      const nextState = hasContact(station.id, nextTime);
      if (nextState !== previousState) {
        const boundary = refineBoundary(
          (time) => hasContact(station.id, time),
          previousTime,
          nextTime,
          previousState,
          boundaryToleranceSeconds,
        );
        if (previousState && openStart !== null) {
          windows.push({
            satelliteId: satellite.id,
            stationId: station.id,
            stationName: station.name,
            startsAtSeconds: openStart,
            endsAtSeconds: boundary,
            continuesBeforeWindow: openStart === startSeconds && continuesBeforeWindow,
            continuesAfterWindow: false,
          });
          stationWindowCount += 1;
          openStart = null;
        } else {
          openStart = boundary;
        }
      }
      previousTime = nextTime;
      previousState = nextState;
      if (stationWindowCount >= maximumWindowsPerStation) break;
    }

    if (previousState && openStart !== null) {
      windows.push({
        satelliteId: satellite.id,
        stationId: station.id,
        stationName: station.name,
        startsAtSeconds: openStart,
        endsAtSeconds: endSeconds,
        continuesBeforeWindow: openStart === startSeconds && continuesBeforeWindow,
        continuesAfterWindow: true,
      });
    }
  }

  return windows.sort((left, right) =>
    left.startsAtSeconds - right.startsAtSeconds
    || left.endsAtSeconds - right.endsAtSeconds
    || left.stationId.localeCompare(right.stationId),
  );
}

function refineBoundary(
  hasContact: (timeSeconds: number) => boolean,
  leftTime: number,
  rightTime: number,
  leftState: boolean,
  toleranceSeconds: number,
): number {
  let left = leftTime;
  let right = rightTime;
  while (right - left > toleranceSeconds) {
    const middle = (left + right) / 2;
    if (hasContact(middle) === leftState) left = middle;
    else right = middle;
  }
  return (left + right) / 2;
}
