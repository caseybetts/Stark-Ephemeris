export const EARTH_MEAN_RADIUS_KM = 6_371.0;
export const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;

// Prototype defaults. Keep these configurable so gameplay can tune them later.
export const SIMULATED_DAY_SECONDS = 86_400;
export const EFFECTIVE_CONTACT_RADIUS_KM = 1_800;
export const DEFAULT_TIME_MULTIPLIER = 60;
export const AVAILABLE_TIME_MULTIPLIERS = [1, 60, 300] as const;

export const DEFAULT_SATELLITE: {
  id: string;
  name: string;
  orbit: {
    altitudeKm: number;
    inclinationDeg: number;
    ascendingNodeDeg: number;
    initialPhaseDeg: number;
  };
} = {
  id: "asteria-1",
  name: "Asteria-1",
  orbit: {
    altitudeKm: 550,
    inclinationDeg: 53,
    ascendingNodeDeg: 12,
    initialPhaseDeg: 8,
  },
};

export const SURFACE_OBJECTS = [
  {
    id: "colorado-relay",
    name: "Colorado Relay",
    kind: "ground-station",
    location: { latitudeDeg: 38.8339, longitudeDeg: -104.8214 },
    description: "Ground station · Colorado Springs",
  },
  {
    id: "svalbard-relay",
    name: "Svalbard Relay",
    kind: "ground-station",
    location: { latitudeDeg: 78.2232, longitudeDeg: 15.6469 },
    description: "Ground station · Longyearbyen",
  },
  {
    id: "singapore-market",
    name: "Singapore Market",
    kind: "imaging-market",
    location: { latitudeDeg: 1.3521, longitudeDeg: 103.8198 },
    description: "Imaging market · Singapore",
  },
  {
    id: "manaus-market",
    name: "Amazon Basin Market",
    kind: "imaging-market",
    location: { latitudeDeg: -3.119, longitudeDeg: -60.0217 },
    description: "Imaging market · Manaus",
  },
] as const;
