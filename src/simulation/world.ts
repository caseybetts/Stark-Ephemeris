import {
  EARTH_GRAVITATIONAL_PARAMETER_KM3_S2,
  EARTH_MEAN_RADIUS_KM,
  EFFECTIVE_CONTACT_RADIUS_KM,
  SIMULATED_DAY_SECONDS,
} from "./constants";
import type {
  GeographicLocation,
  OrbitDefinition,
  SatelliteDefinition,
  SurfaceObject,
  Vector3Km,
  WorldSnapshot,
} from "./model";

const TAU = 2 * Math.PI;
const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function normalize(vector: Vector3Km): Vector3Km {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (magnitude === 0) return { x: 0, y: 0, z: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}

function dot(left: Vector3Km, right: Vector3Km): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function rotateInertialToEarthFixed(vector: Vector3Km, elapsedSeconds: number): Vector3Km {
  const earthAngle = (TAU * elapsedSeconds) / SIMULATED_DAY_SECONDS;
  const cosine = Math.cos(earthAngle);
  const sine = Math.sin(earthAngle);
  return {
    x: cosine * vector.x + sine * vector.y,
    y: -sine * vector.x + cosine * vector.y,
    z: vector.z,
  };
}

export function circularOrbitPeriodSeconds(altitudeKm: number): number {
  const semiMajorAxisKm = EARTH_MEAN_RADIUS_KM + altitudeKm;
  return TAU * Math.sqrt(semiMajorAxisKm ** 3 / EARTH_GRAVITATIONAL_PARAMETER_KM3_S2);
}

export function satellitePositionInertial(
  orbit: OrbitDefinition,
  elapsedSeconds: number,
): Vector3Km {
  const radiusKm = EARTH_MEAN_RADIUS_KM + orbit.altitudeKm;
  const angularRate = TAU / circularOrbitPeriodSeconds(orbit.altitudeKm);
  const phase = degreesToRadians(orbit.initialPhaseDeg) + angularRate * elapsedSeconds;
  const inclination = degreesToRadians(orbit.inclinationDeg);
  const ascendingNode = degreesToRadians(orbit.ascendingNodeDeg);

  const orbitalX = radiusKm * Math.cos(phase);
  const orbitalY = radiusKm * Math.sin(phase);
  const xAscending = orbitalX;
  const yAscending = orbitalY * Math.cos(inclination);
  const z = orbitalY * Math.sin(inclination);

  return {
    x: xAscending * Math.cos(ascendingNode) - yAscending * Math.sin(ascendingNode),
    y: xAscending * Math.sin(ascendingNode) + yAscending * Math.cos(ascendingNode),
    z,
  };
}

export function surfaceNormal(location: GeographicLocation): Vector3Km {
  const latitude = degreesToRadians(location.latitudeDeg);
  const longitude = degreesToRadians(location.longitudeDeg);
  return {
    x: Math.cos(latitude) * Math.cos(longitude),
    y: Math.cos(latitude) * Math.sin(longitude),
    z: Math.sin(latitude),
  };
}

export function isSurfaceLocationSunlit(
  location: GeographicLocation,
  sunDirectionEarthFixed: Vector3Km,
): boolean {
  return dot(surfaceNormal(location), sunDirectionEarthFixed) > 0;
}

export function isSatelliteEclipsed(
  satelliteInertialKm: Vector3Km,
  sunDirectionInertial: Vector3Km,
): boolean {
  const alongSunAxis = dot(satelliteInertialKm, sunDirectionInertial);
  if (alongSunAxis >= 0) return false;

  const closestPointOnAxis: Vector3Km = {
    x: sunDirectionInertial.x * alongSunAxis,
    y: sunDirectionInertial.y * alongSunAxis,
    z: sunDirectionInertial.z * alongSunAxis,
  };
  const shadowAxisDistanceKm = Math.hypot(
    satelliteInertialKm.x - closestPointOnAxis.x,
    satelliteInertialKm.y - closestPointOnAxis.y,
    satelliteInertialKm.z - closestPointOnAxis.z,
  );
  return shadowAxisDistanceKm < EARTH_MEAN_RADIUS_KM;
}

export function subSatellitePoint(positionEarthFixedKm: Vector3Km): GeographicLocation {
  const direction = normalize(positionEarthFixedKm);
  return {
    latitudeDeg: (Math.asin(direction.z) * 180) / Math.PI,
    longitudeDeg: (Math.atan2(direction.y, direction.x) * 180) / Math.PI,
    altitudeKm: Math.hypot(positionEarthFixedKm.x, positionEarthFixedKm.y, positionEarthFixedKm.z)
      - EARTH_MEAN_RADIUS_KM,
  };
}

export function surfaceDistanceKm(
  left: GeographicLocation,
  right: GeographicLocation,
): number {
  const leftLat = degreesToRadians(left.latitudeDeg);
  const rightLat = degreesToRadians(right.latitudeDeg);
  const deltaLat = rightLat - leftLat;
  const deltaLon = degreesToRadians(right.longitudeDeg - left.longitudeDeg);
  const haversine =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLon / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  return EARTH_MEAN_RADIUS_KM * centralAngle;
}

export function createWorldSnapshot(
  satellite: SatelliteDefinition,
  surfaceObjects: readonly SurfaceObject[],
  elapsedSeconds: number,
): WorldSnapshot {
  const satelliteInertialKm = satellitePositionInertial(satellite.orbit, elapsedSeconds);
  const satelliteEarthFixedKm = rotateInertialToEarthFixed(satelliteInertialKm, elapsedSeconds);
  const subPoint = subSatellitePoint(satelliteEarthFixedKm);
  const sunDirectionInertial = { x: 1, y: 0, z: 0 };
  const sunDirectionEarthFixed = rotateInertialToEarthFixed(sunDirectionInertial, elapsedSeconds);

  return {
    satelliteId: satellite.id,
    elapsedSeconds,
    satelliteInertialKm,
    satelliteEarthFixedKm,
    subSatellitePoint: subPoint,
    sunDirectionInertial,
    sunDirectionEarthFixed,
    satelliteEclipsed: isSatelliteEclipsed(satelliteInertialKm, sunDirectionInertial),
    surfaceObjects: surfaceObjects.map((object) => ({
      object,
      sunlit: isSurfaceLocationSunlit(object.location, sunDirectionEarthFixed),
    })),
    stationContacts: surfaceObjects
      .filter((object) => object.kind === "ground-station")
      .map((station) => {
        const distanceKm = surfaceDistanceKm(subPoint, station.location);
        return {
          station,
          distanceKm,
          available: distanceKm <= EFFECTIVE_CONTACT_RADIUS_KM,
        };
      }),
  };
}
