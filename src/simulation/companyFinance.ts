export const SIMULATION_DAY_SECONDS = 86_400;
export const PROTOTYPE_SPACECRAFT_COST_CENTS_PER_DAY = 10_000;
export const PROTOTYPE_GROUND_STATION_COST_CENTS_PER_DAY = 2_500;

export type FinanceEntryKind =
  | "downlink-revenue"
  | "spacecraft-operating-cost"
  | "ground-station-operating-cost"
  | "ground-station-contact-cost"
  | "spacecraft-procurement";

export type FinanceEntry = {
  id: string;
  timeSeconds: number;
  kind: FinanceEntryKind;
  sourceId: string;
  amountCents: number;
  spacecraftCostCents?: number;
  upgradeCostCents?: number;
  launchCostCents?: number;
  equipmentOptionId?: string;
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
  private contactSecondsByStation = new Map<string, number>();
  private contactCostCentsByStation = new Map<string, number>();
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

  getAverageDailyRevenueCents(timeSeconds: number, dayCount = 3): number {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Finance time must be finite and non-negative");
    if (!Number.isSafeInteger(dayCount) || dayCount <= 0) throw new RangeError("Average period must be a positive number of days");
    const currentDay = Math.floor(timeSeconds / SIMULATION_DAY_SECONDS);
    const firstDay = Math.max(0, currentDay - dayCount + 1);
    const startSeconds = firstDay * SIMULATION_DAY_SECONDS;
    const endSeconds = (currentDay + 1) * SIMULATION_DAY_SECONDS;
    const revenueCents = this.entries.reduce((total, entry) =>
      entry.kind === "downlink-revenue"
        && entry.timeSeconds >= startSeconds
        && entry.timeSeconds < endSeconds
        ? total + entry.amountCents
        : total,
    0);
    return Math.round(revenueCents / (currentDay - firstDay + 1));
  }

  getAverageDailyGroundStationExpenseCents(stationId: string, timeSeconds: number, dayCount = 3): number {
    if (!stationId.trim()) throw new Error("Ground station ID is required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Finance time must be finite and non-negative");
    if (!Number.isSafeInteger(dayCount) || dayCount <= 0) throw new RangeError("Average period must be a positive number of days");
    const currentDay = Math.floor(timeSeconds / SIMULATION_DAY_SECONDS);
    const firstDay = Math.max(0, currentDay - dayCount + 1);
    const startSeconds = firstDay * SIMULATION_DAY_SECONDS;
    const endSeconds = (currentDay + 1) * SIMULATION_DAY_SECONDS;
    const expenseCents = this.entries.reduce((total, entry) =>
      entry.sourceId === stationId
        && (entry.kind === "ground-station-operating-cost" || entry.kind === "ground-station-contact-cost")
        && entry.timeSeconds >= startSeconds
        && entry.timeSeconds < endSeconds
        ? total - entry.amountCents
        : total,
    0);
    return Math.round(expenseCents / (currentDay - firstDay + 1));
  }

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

  /** Record an affordable spacecraft package and launch as one idempotent capital entry. */
  recordSpacecraftProcurement(
    eventId: string,
    satelliteId: string,
    timeSeconds: number,
    spacecraftCostUsd: number,
    launchCostUsd: number,
    upgradeCostUsd = 0,
    equipmentOptionId?: string,
  ): FinanceEntry {
    if (!eventId.trim() || !satelliteId.trim()) throw new Error("Procurement and spacecraft IDs are required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Procurement time must be finite and non-negative");
    const spacecraftCostCents = dollarsToCents(spacecraftCostUsd, "Spacecraft purchase price");
    const launchCostCents = dollarsToCents(launchCostUsd, "Launch price");
    const upgradeCostCents = dollarsToCents(upgradeCostUsd, "Spacecraft upgrade price");
    const totalCostCents = spacecraftCostCents + upgradeCostCents + launchCostCents;
    if (!Number.isSafeInteger(totalCostCents)) throw new RangeError("Procurement total is too large");
    if (equipmentOptionId !== undefined && !equipmentOptionId.trim()) throw new Error("Equipment option ID cannot be empty");
    const amountCents = -totalCostCents;
    if (!Number.isSafeInteger(amountCents)) throw new RangeError("Procurement total is too large");
    const entry: FinanceEntry = {
      id: `procurement:${eventId}`,
      timeSeconds,
      kind: "spacecraft-procurement",
      sourceId: satelliteId,
      amountCents,
      spacecraftCostCents,
      upgradeCostCents,
      launchCostCents,
      ...(equipmentOptionId ? { equipmentOptionId } : {}),
    };
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.kind !== entry.kind
        || previous.sourceId !== entry.sourceId || previous.amountCents !== entry.amountCents
        || previous.spacecraftCostCents !== entry.spacecraftCostCents
        || previous.upgradeCostCents !== entry.upgradeCostCents
        || previous.launchCostCents !== entry.launchCostCents
        || previous.equipmentOptionId !== entry.equipmentOptionId) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    if (this.cashCentsValue < totalCostCents) {
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

  /** Charge for allocated antenna time, rounding cumulative fractional cents to the nearest cent. */
  recordGroundStationContactTime(
    stationId: string,
    startsAtSeconds: number,
    endsAtSeconds: number,
    costUsdPerMinute: number,
  ): FinanceEntry | null {
    if (!stationId.trim()) throw new Error("Ground station ID is required");
    if (!Number.isFinite(startsAtSeconds) || startsAtSeconds < 0
      || !Number.isFinite(endsAtSeconds) || endsAtSeconds < startsAtSeconds) {
      throw new RangeError("Ground station contact interval must be finite and non-negative");
    }
    const rateCentsPerMinute = dollarsToCents(costUsdPerMinute, "Ground station contact rate");
    if (endsAtSeconds === startsAtSeconds || rateCentsPerMinute === 0) return null;

    const durationSeconds = endsAtSeconds - startsAtSeconds;
    const totalContactSeconds = (this.contactSecondsByStation.get(stationId) ?? 0) + durationSeconds;
    const totalCostCents = Math.round(totalContactSeconds * rateCentsPerMinute / 60);
    const previouslyChargedCents = this.contactCostCentsByStation.get(stationId) ?? 0;
    const amountCents = totalCostCents - previouslyChargedCents;
    if (!Number.isSafeInteger(totalCostCents) || !Number.isSafeInteger(amountCents)) {
      throw new RangeError("Ground station contact cost exceeds the supported range");
    }
    this.contactSecondsByStation.set(stationId, totalContactSeconds);
    if (amountCents <= 0) return null;

    this.contactCostCentsByStation.set(stationId, totalCostCents);
    return this.append({
      id: `operating-cost:ground-station-contact:${stationId}:total:${totalCostCents}`,
      timeSeconds: endsAtSeconds,
      kind: "ground-station-contact-cost",
      sourceId: stationId,
      amountCents: -amountCents,
    });
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
    this.contactSecondsByStation.clear();
    this.contactCostCentsByStation.clear();
    this.revisionValue += 1;
  }

  private append(entry: FinanceEntry): FinanceEntry {
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.kind !== entry.kind
        || previous.sourceId !== entry.sourceId || previous.amountCents !== entry.amountCents
        || previous.spacecraftCostCents !== entry.spacecraftCostCents
        || previous.upgradeCostCents !== entry.upgradeCostCents
        || previous.launchCostCents !== entry.launchCostCents
        || previous.equipmentOptionId !== entry.equipmentOptionId) {
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
      case "ground-station-contact-cost":
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
