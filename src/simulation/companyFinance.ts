export const SIMULATION_DAY_SECONDS = 86_400;

export type FinanceEntryKind =
  | "downlink-revenue"
  | "ground-station-contact-cost"
  | "ground-station-maintenance-cost"
  | "spacecraft-procurement"
  | "ground-station-procurement"
  | "mission-setup-fee";

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
  groundStationCostCents?: number;
  groundStationDayIndex?: number;
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

/** Renderer-independent company balance and append-only financial history. */
export class CompanyFinance {
  private readonly startingCashCents: number;
  private entries: FinanceEntry[] = [];
  private entryById = new Map<string, FinanceEntry>();
  private cashCentsValue: number;
  private realizedRevenueCentsValue = 0;
  private operatingCostsCentsValue = 0;
  private capitalSpendingCentsValue = 0;
  private contactSecondsByStation = new Map<string, number>();
  private contactCostCentsByStation = new Map<string, number>();
  private revisionValue = 0;

  constructor(configuration: CompanyFinanceConfiguration = {}) {
    this.startingCashCents = signedDollarsToCents(configuration.startingCashUsd ?? 0, "Starting company cash");
    this.cashCentsValue = this.startingCashCents;
  }

  get revision(): number { return this.revisionValue; }
  get cashUsd(): number { return this.cashCentsValue / 100; }
  get realizedRevenueUsd(): number { return this.realizedRevenueCentsValue / 100; }
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
        && (entry.kind === "ground-station-contact-cost" || entry.kind === "ground-station-maintenance-cost")
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
        || previous.equipmentOptionId !== entry.equipmentOptionId
        || previous.groundStationCostCents !== entry.groundStationCostCents
        || previous.groundStationDayIndex !== entry.groundStationDayIndex) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    if (this.cashCentsValue < totalCostCents) {
      throw new Error("Insufficient company cash for spacecraft purchase and launch");
    }
    return this.append(entry);
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

  /** Charge owned-site upkeep once at the end of each simulation day, prorated on its first day. */
  recordGroundStationMaintenance(
    stationId: string,
    dayIndex: number,
    timeSeconds: number,
    maintenanceCostUsdPerDay: number,
    activeSeconds = 86_400,
  ): FinanceEntry | null {
    if (!stationId.trim()) throw new Error("Ground station ID is required");
    if (!Number.isSafeInteger(dayIndex) || dayIndex < 0) throw new RangeError("Ground station maintenance day must be a non-negative integer");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Maintenance time must be finite and non-negative");
    if (!Number.isFinite(activeSeconds) || activeSeconds < 0 || activeSeconds > 86_400) {
      throw new RangeError("Ground station active time must be within one simulation day");
    }
    const dailyRateCents = dollarsToCents(maintenanceCostUsdPerDay, "Ground station daily maintenance rate");
    const amountCents = Math.round(dailyRateCents * activeSeconds / 86_400);
    if (!Number.isSafeInteger(amountCents)) throw new RangeError("Ground station maintenance cost exceeds the supported range");
    if (amountCents === 0) return null;
    return this.append({
      id: `operating-cost:ground-station-maintenance:${stationId}:day:${dayIndex}`,
      timeSeconds,
      kind: "ground-station-maintenance-cost",
      sourceId: stationId,
      amountCents: -amountCents,
      groundStationDayIndex: dayIndex,
    });
  }

  /** Record an affordability-checked, idempotent ground-station purchase. */
  recordGroundStationProcurement(eventId: string, stationId: string, timeSeconds: number, purchaseCostCents: number): FinanceEntry {
    if (!eventId.trim() || !stationId.trim()) throw new Error("Procurement and ground station IDs are required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Procurement time must be finite and non-negative");
    if (!Number.isSafeInteger(purchaseCostCents) || purchaseCostCents < 0) throw new RangeError("Ground station purchase price must be whole non-negative cents");
    const entry: FinanceEntry = {
      id: `ground-station-procurement:${eventId}`,
      timeSeconds,
      kind: "ground-station-procurement",
      sourceId: stationId,
      amountCents: -purchaseCostCents,
      groundStationCostCents: purchaseCostCents,
    };
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.sourceId !== entry.sourceId
        || previous.amountCents !== entry.amountCents || previous.groundStationCostCents !== entry.groundStationCostCents) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    if (this.cashCentsValue < purchaseCostCents) throw new Error("Insufficient company cash for ground station purchase");
    return this.append(entry);
  }

  recordMissionSetupFee(eventId: string, sourceId: string, timeSeconds: number, feeCents: number): FinanceEntry {
    if (!eventId.trim() || !sourceId.trim()) throw new Error("Mission setup fee identity is required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Mission setup time must be finite and non-negative");
    if (!Number.isSafeInteger(feeCents) || feeCents < 0) throw new RangeError("Mission setup fee must be whole non-negative cents");
    const entry: FinanceEntry = {
      id: `mission-setup:${eventId}`,
      timeSeconds,
      kind: "mission-setup-fee",
      sourceId,
      amountCents: -feeCents,
    };
    const previous = this.entryById.get(entry.id);
    if (previous) {
      if (previous.timeSeconds !== entry.timeSeconds || previous.sourceId !== entry.sourceId || previous.amountCents !== entry.amountCents) {
        throw new Error(`Financial event ID reused with different contents: ${entry.id}`);
      }
      return { ...previous };
    }
    if (this.cashCentsValue < feeCents) throw new Error("Insufficient company cash for mission setup fees");
    return this.append(entry);
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
        || previous.equipmentOptionId !== entry.equipmentOptionId
        || previous.groundStationCostCents !== entry.groundStationCostCents
        || previous.groundStationDayIndex !== entry.groundStationDayIndex) {
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
      case "ground-station-contact-cost":
      case "ground-station-maintenance-cost":
      case "mission-setup-fee":
        if (entry.amountCents > 0) throw new RangeError("Operating cost cannot be positive");
        this.operatingCostsCentsValue -= entry.amountCents;
        break;
      case "spacecraft-procurement":
      case "ground-station-procurement":
        if (entry.amountCents > 0) throw new RangeError("Capital spending cannot be positive");
        this.capitalSpendingCentsValue -= entry.amountCents;
        break;
    }
    this.revisionValue += 1;
    return { ...entry };
  }
}
