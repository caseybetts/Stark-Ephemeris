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

export type SurfaceObjectKind = "ground-station";

export type GroundStationSiteDetails = {
  operationalStatus: "available" | "down";
  /** Catalog sites may enter service through a one-time purchase or contact-time lease. */
  accessMode?: "owned" | "leased";
  uplinkRateMbps: number;
  downlinkRateMbps: number;
  /** Owned-site maintenance charge, accrued per simulation day. */
  maintenanceCostUsdPerDay?: number;
  /** Leased-site cost charged per minute while its antenna serves a spacecraft. */
  contactCostUsdPerMinute: number;
  /** Simulation time when this site entered the active network. */
  accessStartedAtSeconds?: number;
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
