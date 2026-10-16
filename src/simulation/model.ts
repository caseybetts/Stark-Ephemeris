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

export type GroundStationSiteDetails = {
  operationalStatus: "available" | "down";
  uplinkRateMbps: number;
  downlinkRateMbps: number;
};

export type SurfaceObject = {
  id: string;
  name: string;
  kind: SurfaceObjectKind;
  location: GeographicLocation;
  description: string;
  groundStationDetails?: GroundStationSiteDetails;
};

export type OrbitDefinition = {
  altitudeKm: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  initialPhaseDeg: number;
};

export type SlewCapability = {
  /** Prototype angular rate; gameplay tuning remains open. */
  slewRateDegPerSecond: number;
  /** Time added after a non-zero slew before the next operation can begin. */
  settlingTimeSeconds: number;
};

export type SatelliteDefinition = {
  id: string;
  name: string;
  orbit: OrbitDefinition;
  slew: SlewCapability;
  /** Selected installed hardware configuration at launch; absent on legacy definitions. */
  equipmentOptionId?: string;
};

export type FleetState = {
  satellites: readonly SatelliteDefinition[];
};

export type StationContact = {
  station: SurfaceObject;
  distanceKm: number;
  geometricInRange: boolean;
  stationOperational: boolean;
  available: boolean;
};

export type WorldSnapshot = {
  satelliteId: string;
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
