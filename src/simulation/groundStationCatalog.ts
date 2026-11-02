import type { SurfaceObject } from "./model.ts";

export type GroundStationOption = {
  station: SurfaceObject;
  purchaseCostCents: number;
  leaseRateUsdPerMinute: number;
  maintenanceCostUsdPerDay: number;
};

// Candidate sites and prices are configurable prototype offers, not real-site quotes or final balance.
const station = (id: string, name: string, city: string, latitudeDeg: number, longitudeDeg: number,
  uplinkRateMbps: number, downlinkRateMbps: number, purchaseCostCents: number,
  leaseRateUsdPerMinute: number, maintenanceCostUsdPerDay: number): GroundStationOption => ({
  purchaseCostCents,
  leaseRateUsdPerMinute,
  maintenanceCostUsdPerDay,
  station: {
    id,
    name,
    kind: "ground-station",
    location: { latitudeDeg, longitudeDeg },
    description: `Ground station · ${city}`,
    groundStationDetails: {
      operationalStatus: "available",
      accessMode: "owned",
      uplinkRateMbps,
      downlinkRateMbps,
      maintenanceCostUsdPerDay,
      contactCostUsdPerMinute: 0,
    },
  },
});

export const GROUND_STATION_CATALOG: readonly GroundStationOption[] = [
  station("honolulu-relay", "Honolulu Relay", "Honolulu", 21.3069, -157.8583, 5, 60, 1_000_000_000, 110, 125),
  station("madrid-relay", "Madrid Relay", "Madrid", 40.4168, -3.7038, 20, 120, 1_200_000_000, 125, 175),
  station("nairobi-relay", "Nairobi Relay", "Nairobi", -1.2921, 36.8219, 10, 75, 1_400_000_000, 140, 150),
  station("tokyo-relay", "Tokyo Relay", "Tokyo", 35.6762, 139.6503, 25, 150, 1_600_000_000, 150, 250),
];

export function getGroundStationOption(stationId: string, accessMode: "owned" | "leased" = "owned"): GroundStationOption {
  const option = GROUND_STATION_CATALOG.find(({ station: candidate }) => candidate.id === stationId);
  if (!option) throw new Error(`Unknown ground station option: ${stationId}`);
  const details = option.station.groundStationDetails!;
  return {
    ...option,
    station: {
      ...option.station,
      location: { ...option.station.location },
      groundStationDetails: {
        ...details,
        accessMode,
        maintenanceCostUsdPerDay: accessMode === "leased" ? 0 : option.maintenanceCostUsdPerDay,
        contactCostUsdPerMinute: accessMode === "leased" ? option.leaseRateUsdPerMinute : 0,
      },
    },
  };
}

export function quoteGroundStationPurchase(stationId: string, availableCashCents: number) {
  if (!Number.isSafeInteger(availableCashCents)) throw new RangeError("Available company cash must be whole cents");
  const option = getGroundStationOption(stationId);
  return {
    ...option,
    cashAfterPurchaseCents: availableCashCents - option.purchaseCostCents,
    affordable: availableCashCents >= option.purchaseCostCents,
  };
}

export function quoteGroundStationLease(stationId: string) {
  const option = getGroundStationOption(stationId, "leased");
  return { ...option, upfrontCostCents: 0 };
}
