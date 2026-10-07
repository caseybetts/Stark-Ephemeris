import type { CellGrid } from "./cells.ts";
import {
  calculateCellEconomy,
  settleSuccessfulCellCapture,
  type CellCaptureEvent,
  type CellEconomySnapshot,
  type MarketCategoryRate,
} from "./cellEconomy.ts";
import {
  CellCategoryExposureIndex,
  PROPOSED_CELL_CATEGORIES,
  type CellCategoryExposureDefinition,
} from "./categoryExposures.ts";

/** Current market-controlled fields. These are supplied by scenario/market state; no rates are invented here. */
export type MarketReadoutCategory = {
  id: string;
  unit: string;
  marketPriceUsdPerUnit: number;
  cadenceSeconds: number;
};

/** Player-controlled scheduling rate, separate from market price and cadence. */
export type PlayerCategoryPriorityRate = {
  categoryId: string;
  unit: string;
  pointsPerUnit: number;
};

export type CellMarketStateSnapshot = CellEconomySnapshot & {
  cellId: number;
};

export type RecordedCellCapture = CellCaptureEvent & {
  eventId: string;
  satelliteId: string;
};

/**
 * Cesium-independent current market, player priority, per-cell recovery and
 * cash state. All market and priority values must be provided by the caller.
 * Derived cell values are calculated on demand, so changing time or inputs
 * affects the next read immediately without scanning the entire grid.
 */
export class CellMarketState {
  readonly exposures: CellCategoryExposureIndex;
  private marketReadout: MarketReadoutCategory[];
  private playerPriorityRates: PlayerCategoryPriorityRate[];
  private readonly lastCollectedAt: Float64Array;
  private readonly collectionEvents: RecordedCellCapture[] = [];
  private readonly eventIds = new Set<string>();
  private readonly startingCashUsd: number;
  private readonly initialMarketReadout: MarketReadoutCategory[];
  private readonly initialPriorityRates: PlayerCategoryPriorityRate[];
  private cashUsdValue: number;
  private readonly grid: CellGrid;

  constructor(
    grid: CellGrid,
    marketReadout: readonly MarketReadoutCategory[],
    playerPriorityRates: readonly PlayerCategoryPriorityRate[],
    startingCashUsd: number,
    definitions: readonly CellCategoryExposureDefinition[] = PROPOSED_CELL_CATEGORIES,
  ) {
    this.grid = grid;
    if (!Number.isFinite(startingCashUsd) || startingCashUsd < 0) throw new RangeError("Starting company cash must be finite and non-negative");
    this.startingCashUsd = startingCashUsd;
    this.cashUsdValue = startingCashUsd;
    this.exposures = new CellCategoryExposureIndex(grid, definitions);
    this.lastCollectedAt = new Float64Array(grid.ids.length);
    this.lastCollectedAt.fill(Number.NaN); // NaN represents never collected (VAM starts at 1).
    this.marketReadout = this.copyMarketReadout(marketReadout);
    this.playerPriorityRates = this.copyPriorityRates(playerPriorityRates);
    this.validateRateSets(this.marketReadout, this.playerPriorityRates);
    this.initialMarketReadout = this.marketReadout.map(category => ({ ...category }));
    this.initialPriorityRates = this.playerPriorityRates.map(rate => ({ ...rate }));
  }

  get companyCashUsd(): number { return this.cashUsdValue; }

  /** Restore the in-memory preview to its supplied scenario defaults. */
  resetPreview(): void {
    this.lastCollectedAt.fill(Number.NaN);
    this.collectionEvents.length = 0;
    this.eventIds.clear();
    this.cashUsdValue = this.startingCashUsd;
    this.marketReadout = this.initialMarketReadout.map(category => ({ ...category }));
    this.playerPriorityRates = this.initialPriorityRates.map(rate => ({ ...rate }));
  }

  /** A snapshot of read-only-to-player market data for a future dashboard. */
  getMarketReadout(): readonly MarketReadoutCategory[] {
    return this.marketReadout.map(category => ({ ...category }));
  }

  /** The editable player control: points per matching category unit. */
  getPlayerPriorityRates(): readonly PlayerCategoryPriorityRate[] {
    return this.playerPriorityRates.map(rate => ({ ...rate }));
  }

  getCaptureEvents(): readonly RecordedCellCapture[] {
    return this.collectionEvents.map(event => ({ ...event, categoryPayoutsUsd: { ...event.categoryPayoutsUsd } }));
  }

  updateMarketReadout(next: readonly MarketReadoutCategory[]): void {
    const market = this.copyMarketReadout(next);
    this.validateRateSets(market, this.playerPriorityRates);
    this.marketReadout = market;
  }

  updatePlayerPriorityRates(next: readonly PlayerCategoryPriorityRate[]): void {
    const priorities = this.copyPriorityRates(next);
    this.validateRateSets(this.marketReadout, priorities);
    this.playerPriorityRates = priorities;
  }

  lastCollectedAtSeconds(cellIndex: number): number | null {
    this.validateCellIndex(cellIndex);
    const timestamp = this.lastCollectedAt[cellIndex];
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  calculateCell(cellIndex: number, nowSeconds: number): CellMarketStateSnapshot {
    this.validateCellIndex(cellIndex);
    const lastCollectedAtSeconds = this.lastCollectedAtSeconds(cellIndex);
    const snapshot = calculateCellEconomy(
      this.combinedRates(),
      this.exposures.forCell(cellIndex),
      nowSeconds,
      { lastCollectedAtSeconds },
    );
    return { ...snapshot, cellId: this.grid.ids[cellIndex] };
  }

  /**
   * Complete one successful capture and commit its event, cash credit, and
   * shared cell recovery timestamp together. Failed validation changes none.
   * eventId makes a retried completion idempotently reject a second credit.
   */
  completeCellCapture(
    cellIndex: number,
    satelliteId: string,
    eventId: string,
    completedAtSeconds: number,
  ): RecordedCellCapture {
    this.validateCellIndex(cellIndex);
    if (!satelliteId.trim()) throw new Error("Satellite ID is required for a cell capture");
    if (!eventId.trim()) throw new Error("Capture event ID is required");
    if (this.eventIds.has(eventId)) throw new Error(`Capture event already committed: ${eventId}`);

    const settlement = settleSuccessfulCellCapture(
      this.grid.ids[cellIndex],
      this.combinedRates(),
      this.exposures.forCell(cellIndex),
      completedAtSeconds,
      { lastCollectedAtSeconds: this.lastCollectedAtSeconds(cellIndex) },
    );
    const event: RecordedCellCapture = {
      ...settlement.event,
      eventId,
      satelliteId,
    };
    const nextCashUsd = this.cashUsdValue + event.revenueUsd;
    if (!Number.isFinite(event.revenueUsd) || !Number.isFinite(nextCashUsd)) {
      throw new RangeError("Capture revenue and resulting company cash must remain finite");
    }

    // All validation and payout calculation precede these synchronous commits.
    this.collectionEvents.push(event);
    this.eventIds.add(eventId);
    this.cashUsdValue = nextCashUsd;
    this.lastCollectedAt[cellIndex] = settlement.nextRecoveryState.lastCollectedAtSeconds!;
    return { ...event, categoryPayoutsUsd: { ...event.categoryPayoutsUsd } };
  }

  private combinedRates(): MarketCategoryRate[] {
    const priorityById = new Map(this.playerPriorityRates.map(rate => [rate.categoryId, rate]));
    return this.marketReadout.map(market => {
      const priority = priorityById.get(market.id)!;
      return {
        id: market.id,
        unit: market.unit,
        marketPriceUsdPerUnit: market.marketPriceUsdPerUnit,
        cadenceSeconds: market.cadenceSeconds,
        playerPriorityPointsPerUnit: priority.pointsPerUnit,
      };
    });
  }

  private validateRateSets(
    market: readonly MarketReadoutCategory[],
    priorities: readonly PlayerCategoryPriorityRate[],
  ): void {
    const definitionsById = new Map(this.exposures.definitions.map(definition => [definition.id, definition]));
    if (market.length !== definitionsById.size || priorities.length !== definitionsById.size) {
      throw new Error("Market and player priority rates must be supplied for every configured category");
    }
    for (const definition of this.exposures.definitions) {
      const marketCategory = market.find(category => category.id === definition.id);
      const priority = priorities.find(rate => rate.categoryId === definition.id);
      if (!marketCategory || !priority) throw new Error(`Missing market or priority rate for ${definition.id}`);
      if (marketCategory.unit !== definition.unit || priority.unit !== definition.unit) {
        throw new Error(`Rate unit mismatch for ${definition.id}; expected ${definition.unit}`);
      }
    }
    // Reuse the pure calculator's finite/non-negative rate and positive-cadence validation before replacing live inputs.
    calculateCellEconomy(this.combinedRatesFrom(market, priorities), [], 0, { lastCollectedAtSeconds: null });
  }

  private combinedRatesFrom(
    market: readonly MarketReadoutCategory[],
    priorities: readonly PlayerCategoryPriorityRate[],
  ): MarketCategoryRate[] {
    const priorityById = new Map(priorities.map(rate => [rate.categoryId, rate]));
    return market.map(category => ({
      id: category.id,
      unit: category.unit,
      marketPriceUsdPerUnit: category.marketPriceUsdPerUnit,
      cadenceSeconds: category.cadenceSeconds,
      playerPriorityPointsPerUnit: priorityById.get(category.id)!.pointsPerUnit,
    }));
  }

  private copyMarketReadout(categories: readonly MarketReadoutCategory[]): MarketReadoutCategory[] {
    const ids = new Set<string>();
    return categories.map(category => {
      if (!category.id.trim() || ids.has(category.id)) throw new Error(`Invalid or duplicate market category: ${category.id}`);
      ids.add(category.id);
      return { ...category };
    });
  }

  private copyPriorityRates(rates: readonly PlayerCategoryPriorityRate[]): PlayerCategoryPriorityRate[] {
    const ids = new Set<string>();
    return rates.map(rate => {
      if (!rate.categoryId.trim() || ids.has(rate.categoryId)) throw new Error(`Invalid or duplicate player priority rate: ${rate.categoryId}`);
      ids.add(rate.categoryId);
      return { ...rate };
    });
  }

  private validateCellIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.grid.ids.length) throw new RangeError("Invalid cell index");
  }
}
