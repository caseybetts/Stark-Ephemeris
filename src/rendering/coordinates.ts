import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
} from "cesium";
import type { GeographicLocation, Vector3Km } from "../simulation/model";

export function locationToCartesian(location: GeographicLocation): Cartesian3 {
  return Cartesian3.fromDegrees(
    location.longitudeDeg,
    location.latitudeDeg,
    (location.altitudeKm ?? 0) * 1_000,
    Ellipsoid.WGS84,
  );
}

export function earthFixedKilometersToCartesian(positionKm: Vector3Km): Cartesian3 {
  return new Cartesian3(positionKm.x * 1_000, positionKm.y * 1_000, positionKm.z * 1_000);
}

export function cartesianToLocation(position: Cartesian3): GeographicLocation {
  const cartographic = Cartographic.fromCartesian(position, Ellipsoid.WGS84);
  if (!cartographic) return { latitudeDeg: 0, longitudeDeg: 0 };
  return {
    latitudeDeg: (cartographic.latitude * 180) / Math.PI,
    longitudeDeg: (cartographic.longitude * 180) / Math.PI,
    altitudeKm: cartographic.height / 1_000,
  };
}
