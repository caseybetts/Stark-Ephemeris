export const SIMULATION_DAY_SECONDS = 86_400;
export const PROTOTYPE_SPACECRAFT_COST_CENTS_PER_DAY = 10_000;
export const PROTOTYPE_GROUND_STATION_COST_CENTS_PER_DAY = 2_500;

export type FinanceEntryKind =
  | "downlink-revenue"
  | "spacecraft-operating-cost"
  | "ground-station-operating-cost"
  | "spacecraft-procurement";

export type FinanceEntry = {
  id: string;
  timeSeconds: number;
  kind: FinanceEntryKind;
  sourceId: string;
  amountCents: number;
  spacecraftCostCents?: number;
  launchCostCents?: number;
};

export type CompanyFinanceSnapshot = {
  startingCashCents: number;
  cashCents: number;
  realizedRevenueCents: number;
  operatingCostsCents: number;
  capitalSpendingCents: number;
  netCashMovementCents: number;
  netOperatingResultCents: number;
  isNegative: boolean;
  revision: number;
  entries: readonly FinanceEntry[];
};

export type CompanyFinanceConfiguration = {
  startingCashUsd?: number;
  spacecraftCostCentsPerDay?: number;
  groundStationCostCentsPerDay?: number;
};

const dollarsToCents = (dollars: number, label: string): number => {
  if (!Number.isFinite(dollars) || dollars < 0) throw new RangeError(`${label} must be finite and non-negative`);
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents)) throw new RangeError(`${label} is too large`);
  return cents;
};

const signedDollarsToCents = (dollars: number, label: string): number => {
  if (!Number.isFinite(dollars)) throw new RangeError(`${label} must be finite`);
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents)) throw new RangeError(`${label} is too large`);
  return cents;
};

const validateCost = (cents: number, label: string): number => {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`${label} must be a non-negative integer number of cents`);
  return cents;
};

/** Renderer-independent company balance and append-only financial history. */
export class CompanyFinance {
  private readonly startingCashCents: number;
  private readonly spacecraftCostCentsPerDay: number;
  private readonly groundStationCostCentsPerDay: number;
  private entries: FinanceEntry[] = [];
  private entryById = new Map<string, FinanceEntry>();
  private cashCentsValue: number;
  private realizedRevenueCentsValue = 0;
  private operatingCostsCentsValue = 0;
  private capitalSpendingCentsValue = 0;
  private accruedThroughDay = 0;
  private revisionValue = 0;

  constructor(configuration: CompanyFinanceConfiguration = {}) {
    this.startingCashCents = signedDollarsToCents(configuration.startingCashUsd ?? 0, "Starting company cash");
    this.spacecraftCostCentsPerDay = validateCost(
      configuration.spacecraftCostCentsPerDay ?? PROTOTYPE_SPACECRAFT_COST_CENTS_PER_DAY,
      "Spacecraft daily cost",
    );
    this.groundStationCostCentsPerDay = validateCost(
      configuration.groundStationCostCentsPerDay ?? PROTOTYPE_GROUND_STATION_COST_CENTS_PER_DAY,
      "Ground station daily cost",
    );
    this.cashCentsValue = this.startingCashCents;
  }

  get revision(): number { return this.revisionValue; }
  get cashUsd(): number { return this.cashCentsValue / 100; }
  get realizedRevenueUsd(): number { return this.realizedRevenueCentsValue / 100; }
  get spacecraftCostUsdPerDay(): number { return this.spacecraftCostCentsPerDay / 100; }
  get groundStationCostUsdPerDay(): number { return this.groundStationCostCentsPerDay / 100; }

  recordDownlinkRevenue(eventId: string, imageId: string, timeSeconds: number, revenueUsd: number): FinanceEntry {
    if (!eventId.trim() || !imageId.trim()) throw new Error("Settlement and image IDs are required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Settlement time must be finite and non-negative");
    const amountCents = dollarsToCents(revenueUsd, "Settlement revenue");
    return this.append({
      id: `settlement:${eventId}`,
      timeSeconds,
      kind: "downlink-revenue",
      sourceId: imageId,
      amountCents,
    });
  }

  /** Record an affordable spacecraft and launch purchase as one idempotent capital entry. */
  recordSpacecraftProcurement(
    eventId: string,
    satelliteId: string,
    timeSeconds: number,
    spacecraftCostUsd: number,
    launchCostUsd: number,
  ): FinanceEntry {
    if (!eventId.trim() || !satelliteId.trim()) throw new Error("Procurement and spacecraft IDs are required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Procurement time must be finite and non-negative");
    const spacecraftCostCents = dollarsToCents(spacecraftCostUsd, "Spacecraft purchase price");
    const launchCostCents = dollarsToCents(launchCostUsd, "Launch price");
    const amountCents = -(spacecraftCostCents + launchCostCents);
    if (!Number.isSafeInteger(amountCents)) throw new RangeError("Procurement total is too large");
    const entry: FinanceEntry = {
      id: `procurement:${eventId}`,
      timeSeconds,
      kind: "spacecraft-procurement",
      sourceId: satelliteId,
      amountCents,
      spacecraftCostCents,
      launchCostCents,
    };
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.kind !== entry.kind
        || previous.sourceId !== entry.sourceId || previous.amountCents !== entry.amountCents
        || previous.spacecraftCostCents !== entry.spacecraftCostCents
        || previous.launchCostCents !== entry.launchCostCents) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    if (this.cashCentsValue < spacecraftCostCents + launchCostCents) {
      throw new Error("Insufficient company cash for spacecraft purchase and launch");
    }
    return this.append(entry);
  }

  /** Charge configured assets once at each elapsed simulation-day boundary. */
  advanceTo(timeSeconds: number, spacecraftIds: readonly string[], groundStationIds: readonly string[]): void {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Finance time must be finite and non-negative");
    const throughDay = Math.floor(timeSeconds / SIMULATION_DAY_SECONDS);
    const satellites = [...new Set(spacecraftIds)].sort();
    const stations = [...new Set(groundStationIds)].sort();
    while (this.accruedThroughDay < throughDay) {
      const day = ++this.accruedThroughDay;
      const boundary = day * SIMULATION_DAY_SECONDS;
      for (const satelliteId of satellites) {
        this.append({
          id: `operating-cost:spacecraft:${satelliteId}:day:${day}`,
          timeSeconds: boundary,
          kind: "spacecraft-operating-cost",
          sourceId: satelliteId,
          amountCents: -this.spacecraftCostCentsPerDay,
        });
      }
      for (const stationId of stations) {
        this.append({
          id: `operating-cost:ground-station:${stationId}:day:${day}`,
          timeSeconds: boundary,
          kind: "ground-station-operating-cost",
          sourceId: stationId,
          amountCents: -this.groundStationCostCentsPerDay,
        });
      }
    }
  }

  getSnapshot(): CompanyFinanceSnapshot {
    return {
      startingCashCents: this.startingCashCents,
      cashCents: this.cashCentsValue,
      realizedRevenueCents: this.realizedRevenueCentsValue,
      operatingCostsCents: this.operatingCostsCentsValue,
      capitalSpendingCents: this.capitalSpendingCentsValue,
      netCashMovementCents: this.cashCentsValue - this.startingCashCents,
      netOperatingResultCents: this.realizedRevenueCentsValue - this.operatingCostsCentsValue,
      isNegative: this.cashCentsValue < 0,
      revision: this.revisionValue,
      entries: this.entries.map(entry => ({ ...entry })),
    };
  }

  reset(): void {
    this.entries = [];
    this.entryById.clear();
    this.cashCentsValue = this.startingCashCents;
    this.realizedRevenueCentsValue = 0;
    this.operatingCostsCentsValue = 0;
    this.capitalSpendingCentsValue = 0;
    this.accruedThroughDay = 0;
    this.revisionValue += 1;
  }

  private append(entry: FinanceEntry): FinanceEntry {
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.kind !== entry.kind
        || previous.sourceId !== entry.sourceId || previous.amountCents !== entry.amountCents
        || previous.spacecraftCostCents !== entry.spacecraftCostCents
        || previous.launchCostCents !== entry.launchCostCents) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    const nextCash = this.cashCentsValue + entry.amountCents;
    if (!Number.isSafeInteger(nextCash)) throw new RangeError("Company cash exceeds the supported range");
    this.entries.push({ ...entry });
    this.entryById.set(entry.id, { ...entry });
    this.cashCentsValue = nextCash;
    switch (entry.kind) {
      case "downlink-revenue":
        if (entry.amountCents < 0) throw new RangeError("Downlink revenue cannot be negative");
        this.realizedRevenueCentsValue += entry.amountCents;
        break;
      case "spacecraft-operating-cost":
      case "ground-station-operating-cost":
        if (entry.amountCents > 0) throw new RangeError("Operating cost cannot be positive");
        this.operatingCostsCentsValue -= entry.amountCents;
        break;
      case "spacecraft-procurement":
        if (entry.amountCents > 0) throw new RangeError("Capital spending cannot be positive");
        this.capitalSpendingCentsValue -= entry.amountCents;
        break;
    }
    this.revisionValue += 1;
    return { ...entry };
  }
}
