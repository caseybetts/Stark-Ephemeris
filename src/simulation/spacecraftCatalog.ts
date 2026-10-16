import type { SlewCapability } from "./model.ts";
import type { CompanyFinance } from "./companyFinance.ts";
import type { OperationalLoop } from "./operationalLoop.ts";
import { circularOrbitPeriodSeconds } from "./world.ts";
import type { PowerOperations } from "./power.ts";

export type SpacecraftEquipmentOptionId = "standard" | "enhanced-slew";

export type SpacecraftEquipmentOption = {
  id: SpacecraftEquipmentOptionId;
  name: string;
  description: string;
  spacecraftCostCents: number;
  upgradeCostCents: number;
  launchCostCents: number;
  slew: SlewCapability;
};

export type SpacecraftPurchaseQuote = {
  option: SpacecraftEquipmentOption;
  totalCostCents: number;
  cashAfterPurchaseCents: number;
  affordable: boolean;
};

export function quoteSpacecraftPurchase(optionId: string, availableCashCents: number): SpacecraftPurchaseQuote {
  if (!Number.isSafeInteger(availableCashCents)) throw new RangeError("Available company cash must be whole cents");
  const option = getSpacecraftEquipmentOption(optionId);
  const totalCostCents = getSpacecraftPurchaseTotalCents(option);
  return {
    option,
    totalCostCents,
    cashAfterPurchaseCents: availableCashCents - totalCostCents,
    affordable: availableCashCents >= totalCostCents,
  };
}

/** Prototype procurement values; tune these without changing already-launched spacecraft. */
export const SPACECRAFT_EQUIPMENT_CATALOG: Readonly<Record<SpacecraftEquipmentOptionId, SpacecraftEquipmentOption>> = {
  standard: {
    id: "standard",
    name: "Standard",
    description: "Standard slew · 1°/second · 2 second settling",
    spacecraftCostCents: 5_000_000_000,
    upgradeCostCents: 0,
    launchCostCents: 0,
    slew: { slewRateDegPerSecond: 1, settlingTimeSeconds: 2 },
  },
  "enhanced-slew": {
    id: "enhanced-slew",
    name: "Enhanced slew",
    description: "Enhanced slew · 2°/second · 2 second settling",
    spacecraftCostCents: 5_000_000_000,
    upgradeCostCents: 500_000_000,
    launchCostCents: 0,
    slew: { slewRateDegPerSecond: 2, settlingTimeSeconds: 2 },
  },
};

export function getSpacecraftEquipmentOption(id: string): SpacecraftEquipmentOption {
  if (!Object.hasOwn(SPACECRAFT_EQUIPMENT_CATALOG, id)) throw new Error(`Unknown spacecraft equipment option: ${id}`);
  const option = SPACECRAFT_EQUIPMENT_CATALOG[id as SpacecraftEquipmentOptionId];
  return { ...option, slew: { ...option.slew } };
}

export function getSpacecraftPurchaseTotalCents(option: SpacecraftEquipmentOption): number {
  const total = option.spacecraftCostCents + option.upgradeCostCents + option.launchCostCents;
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Spacecraft package total is invalid");
  return total;
}

export function purchaseSpacecraftWithEquipment(request: {
  eventId: string;
  satelliteId: string;
  satelliteName: string;
  equipmentOptionId: string;
  timeSeconds: number;
  altitudeKm: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  phaseAtLaunchDeg: number;
  referenceSatelliteId: string;
  spacecraftIds: readonly string[];
  groundStationIds: readonly string[];
  storageCapacityBytes: number;
  operationalLoop: OperationalLoop;
  finance: CompanyFinance;
  powerOperations: PowerOperations;
}) {
  const quote = quoteSpacecraftPurchase(
    request.equipmentOptionId,
    request.finance.getSnapshot().cashCents,
  );
  const { option } = quote;
  const orbitPeriodSeconds = circularOrbitPeriodSeconds(request.altitudeKm);
  const definition = {
    id: request.satelliteId,
    name: request.satelliteName,
    orbit: {
      altitudeKm: request.altitudeKm,
      inclinationDeg: request.inclinationDeg,
      ascendingNodeDeg: request.ascendingNodeDeg,
      initialPhaseDeg: ((request.phaseAtLaunchDeg
        - (360 / orbitPeriodSeconds) * request.timeSeconds) % 360 + 360) % 360,
    },
    slew: { ...option.slew },
    equipmentOptionId: option.id,
  };
  const registration = {
    storageCapacityBytes: request.storageCapacityBytes,
    power: request.powerOperations.getConfiguration(request.referenceSatelliteId),
  };

  request.finance.advanceTo(request.timeSeconds, request.spacecraftIds, request.groundStationIds);
  const procurementId = `procurement:${request.eventId}`;
  const previousEntry = request.finance.getSnapshot().entries.find(entry => entry.id === procurementId);
  if (previousEntry) {
    const previousSatellite = request.operationalLoop.getFleet().find(({ id }) => id === request.satelliteId);
    if (!previousSatellite
      || previousEntry.timeSeconds !== request.timeSeconds
      || previousEntry.sourceId !== request.satelliteId
      || previousEntry.spacecraftCostCents !== option.spacecraftCostCents
      || previousEntry.upgradeCostCents !== option.upgradeCostCents
      || previousEntry.launchCostCents !== option.launchCostCents
      || previousEntry.equipmentOptionId !== option.id
      || previousSatellite.name !== definition.name
      || previousSatellite.equipmentOptionId !== definition.equipmentOptionId
      || previousSatellite.orbit.altitudeKm !== definition.orbit.altitudeKm
      || previousSatellite.orbit.inclinationDeg !== definition.orbit.inclinationDeg
      || previousSatellite.orbit.ascendingNodeDeg !== definition.orbit.ascendingNodeDeg
      || previousSatellite.orbit.initialPhaseDeg !== definition.orbit.initialPhaseDeg
      || previousSatellite.slew.slewRateDegPerSecond !== definition.slew.slewRateDegPerSecond
      || previousSatellite.slew.settlingTimeSeconds !== definition.slew.settlingTimeSeconds) {
      throw new Error(`Spacecraft purchase event ID reused with different contents: ${request.eventId}`);
    }
    request.finance.recordSpacecraftProcurement(
      request.eventId,
      request.satelliteId,
      request.timeSeconds,
      option.spacecraftCostCents / 100,
      option.launchCostCents / 100,
      option.upgradeCostCents / 100,
      option.id,
    );
    const previousQuote = quoteSpacecraftPurchase(
      option.id,
      request.finance.getSnapshot().cashCents + getSpacecraftPurchaseTotalCents(option),
    );
    return { definition: previousSatellite, option, quote: previousQuote };
  }
  request.operationalLoop.validateSatelliteRegistration(definition, registration);
  const updatedQuote = quoteSpacecraftPurchase(
    option.id,
    request.finance.getSnapshot().cashCents,
  );
  if (!updatedQuote.affordable) throw new Error("Insufficient company cash for selected spacecraft package");

  request.finance.recordSpacecraftProcurement(
    request.eventId,
    request.satelliteId,
    request.timeSeconds,
    option.spacecraftCostCents / 100,
    option.launchCostCents / 100,
    option.upgradeCostCents / 100,
    option.id,
  );
  request.operationalLoop.registerSatellite(definition, registration);
  return { definition, option, quote: updatedQuote };
}
