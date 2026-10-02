export type GeographicLocation = {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm?: number;
};

export type Vector3Km = {
  x: number;
  y: number;
  z: number;
};

export type SurfaceObjectKind = "ground-station" | "imaging-market";

export type SurfaceObject = {
  id: string;
  name: string;
  kind: SurfaceObjectKind;
  location: GeographicLocation;
  description: string;
};

export type OrbitDefinition = {
  altitudeKm: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  initialPhaseDeg: number;
};

export type SatelliteDefinition = {
  id: string;
  name: string;
  orbit: OrbitDefinition;
};

export type StationContact = {
  station: SurfaceObject;
  distanceKm: number;
  available: boolean;
};

export type WorldSnapshot = {
  elapsedSeconds: number;
  satelliteInertialKm: Vector3Km;
  satelliteEarthFixedKm: Vector3Km;
  subSatellitePoint: GeographicLocation;
  sunDirectionInertial: Vector3Km;
  sunDirectionEarthFixed: Vector3Km;
  satelliteEclipsed: boolean;
  surfaceObjects: Array<{
    object: SurfaceObject;
    sunlit: boolean;
  }>;
  stationContacts: StationContact[];
};
