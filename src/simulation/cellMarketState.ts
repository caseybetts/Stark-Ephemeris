import type { CellGrid } from "./cells.ts";
import { CompanyFinance } from "./companyFinance.ts";
import {
  calculateCellEconomy,
  recordSuccessfulCellCapture,
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
  imageId: string;
  sizeBytes: number;
  initialRetentionPriorityPoints: number;
};

export type CellImageRecord = {
  imageId: string;
  captureEventId: string;
  cellId: number;
  satelliteId: string;
  capturedAtSeconds: number;
  sizeBytes: number;
  transferredBytes: number;
  valuePotentialUsdAtCapture: number;
  initialRetentionPriorityPoints: number;
  status: "onboard" | "delivered" | "deleted";
  deliveredAtSeconds: number | null;
  settledRevenueUsd: number | null;
  deletedAtSeconds: number | null;
};

export type ImageLifecycleEvent =
  | { kind: "image-transfer-progressed"; eventId: string; imageId: string; timeSeconds: number; transferredBytes: number }
  | { kind: "image-downlinked"; eventId: string; imageId: string; timeSeconds: number; revenueUsd: number }
  | { kind: "image-deleted"; eventId: string; imageId: string; timeSeconds: number; lostValuePotentialUsd: number };

export const PROTOTYPE_CELL_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

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
  private readonly captureEventIds = new Set<string>();
  private readonly lifecycleEventIds = new Set<string>();
  private readonly images = new Map<string, CellImageRecord>();
  private readonly lifecycleEvents: ImageLifecycleEvent[] = [];
  private readonly initialMarketReadout: MarketReadoutCategory[];
  private readonly initialPriorityRates: PlayerCategoryPriorityRate[];
  private readonly grid: CellGrid;
  readonly finance: CompanyFinance;

  constructor(
    grid: CellGrid,
    marketReadout: readonly MarketReadoutCategory[],
    playerPriorityRates: readonly PlayerCategoryPriorityRate[],
    startingCashUsd: number,
    definitions: readonly CellCategoryExposureDefinition[] = PROPOSED_CELL_CATEGORIES,
    finance?: CompanyFinance,
  ) {
    this.grid = grid;
    if (!Number.isFinite(startingCashUsd) || startingCashUsd < 0) throw new RangeError("Starting company cash must be finite and non-negative");
    this.finance = finance ?? new CompanyFinance({ startingCashUsd });
    this.exposures = new CellCategoryExposureIndex(grid, definitions);
    this.lastCollectedAt = new Float64Array(grid.ids.length);
    this.lastCollectedAt.fill(Number.NaN); // NaN represents never collected (VAM starts at 1).
    this.marketReadout = this.copyMarketReadout(marketReadout);
    this.playerPriorityRates = this.copyPriorityRates(playerPriorityRates);
    this.validateRateSets(this.marketReadout, this.playerPriorityRates);
    this.initialMarketReadout = this.marketReadout.map(category => ({ ...category }));
    this.initialPriorityRates = this.playerPriorityRates.map(rate => ({ ...rate }));
  }

  get companyCashUsd(): number { return this.finance.cashUsd; }
  get realizedRevenueUsd(): number { return this.finance.realizedRevenueUsd; }

  /** Restore the in-memory preview to its supplied scenario defaults. */
  resetPreview(): void {
    this.lastCollectedAt.fill(Number.NaN);
    this.collectionEvents.length = 0;
    this.captureEventIds.clear();
    this.lifecycleEventIds.clear();
    this.images.clear();
    this.lifecycleEvents.length = 0;
    this.finance.reset();
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

  getImages(): readonly CellImageRecord[] {
    return [...this.images.values()].map(image => ({ ...image }));
  }

  getImage(imageId: string): CellImageRecord | null {
    const image = this.images.get(imageId);
    return image ? { ...image } : null;
  }

  getImageLifecycleEvents(): readonly ImageLifecycleEvent[] {
    return this.lifecycleEvents.map(event => ({ ...event }));
  }

  getImagerySummary(): { onboardCount: number; onboardBytes: number; partiallyTransferredCount: number; transferredBytes: number; deletedCount: number; lostValuePotentialUsd: number; realizedRevenueUsd: number } {
    const records = [...this.images.values()];
    const onboard = records.filter(image => image.status === "onboard");
    const deleted = records.filter(image => image.status === "deleted");
    return {
      onboardCount: onboard.length,
      onboardBytes: onboard.reduce((total, image) => total + image.sizeBytes, 0),
      partiallyTransferredCount: onboard.filter(image => image.transferredBytes > 0).length,
      transferredBytes: onboard.reduce((total, image) => total + image.transferredBytes, 0),
      deletedCount: deleted.length,
      lostValuePotentialUsd: deleted.reduce((total, image) => total + image.valuePotentialUsdAtCapture, 0),
      realizedRevenueUsd: this.realizedRevenueUsd,
    };
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

  calculateCell(
    cellIndex: number,
    nowSeconds: number,
    projectedLastCollectedAtSeconds?: number | null,
  ): CellMarketStateSnapshot {
    this.validateCellIndex(cellIndex);
    const lastCollectedAtSeconds = projectedLastCollectedAtSeconds === undefined
      ? this.lastCollectedAtSeconds(cellIndex)
      : projectedLastCollectedAtSeconds;
    const snapshot = calculateCellEconomy(
      this.combinedRates(),
      this.exposures.forCell(cellIndex),
      nowSeconds,
      { lastCollectedAtSeconds },
    );
    return { ...snapshot, cellId: this.grid.ids[cellIndex] };
  }

  /** Create one onboard image and reset cell recovery without crediting cash. */
  completeCellCapture(
    cellIndex: number,
    satelliteId: string,
    eventId: string,
    completedAtSeconds: number,
    sizeBytes = PROTOTYPE_CELL_IMAGE_SIZE_BYTES,
  ): RecordedCellCapture {
    this.validateCellIndex(cellIndex);
    if (!satelliteId.trim()) throw new Error("Satellite ID is required for a cell capture");
    if (!eventId.trim()) throw new Error("Capture event ID is required");
    if (this.captureEventIds.has(eventId)) throw new Error(`Capture event already committed: ${eventId}`);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new RangeError("Image size must be a positive safe integer number of bytes");

    const capture = recordSuccessfulCellCapture(
      this.grid.ids[cellIndex],
      this.combinedRates(),
      this.exposures.forCell(cellIndex),
      completedAtSeconds,
      { lastCollectedAtSeconds: this.lastCollectedAtSeconds(cellIndex) },
    );
    const event: RecordedCellCapture = {
      ...capture.event,
      eventId,
      satelliteId,
      imageId: `${eventId}:image`,
      sizeBytes,
      initialRetentionPriorityPoints: capture.priorityPointsAtCompletion,
    };
    const image: CellImageRecord = {
      imageId: event.imageId,
      captureEventId: eventId,
      cellId: event.cellId,
      satelliteId,
      capturedAtSeconds: completedAtSeconds,
      sizeBytes,
      transferredBytes: 0,
      valuePotentialUsdAtCapture: event.valuePotentialUsd,
      initialRetentionPriorityPoints: event.initialRetentionPriorityPoints,
      status: "onboard",
      deliveredAtSeconds: null,
      settledRevenueUsd: null,
      deletedAtSeconds: null,
    };

    // All validation and value calculation precede these synchronous commits.
    this.collectionEvents.push(event);
    this.captureEventIds.add(eventId);
    this.images.set(image.imageId, image);
    this.lastCollectedAt[cellIndex] = capture.nextRecoveryState.lastCollectedAtSeconds!;
    return { ...event, categoryPayoutsUsd: { ...event.categoryPayoutsUsd } };
  }

  /** Record cumulative bytes transferred while an image remains onboard. */
  updateImageTransferProgress(
    imageId: string,
    eventId: string,
    timeSeconds: number,
    transferredBytes: number,
  ): ImageLifecycleEvent {
    const image = this.requireOnboardImage(imageId);
    this.validateLifecycleEvent(eventId, timeSeconds, image);
    if (!Number.isSafeInteger(transferredBytes) || transferredBytes < image.transferredBytes || transferredBytes >= image.sizeBytes) {
      throw new RangeError("Partial transfer progress must increase and remain below the full image size");
    }
    const event: ImageLifecycleEvent = { kind: "image-transfer-progressed", eventId, imageId, timeSeconds, transferredBytes };
    image.transferredBytes = transferredBytes;
    this.lifecycleEventIds.add(eventId);
    this.lifecycleEvents.push(event);
    return { ...event };
  }

  /** Settle one fully delivered image exactly once using a quote supplied by the caller. */
  downlinkImage(imageId: string, eventId: string, timeSeconds: number, revenueUsd: number): ImageLifecycleEvent {
    const image = this.requireOnboardImage(imageId);
    this.validateLifecycleEvent(eventId, timeSeconds, image);
    if (!Number.isFinite(revenueUsd) || revenueUsd < 0) throw new RangeError("Settlement revenue must be finite and non-negative");
    const settlement = this.finance.recordDownlinkRevenue(eventId, imageId, timeSeconds, revenueUsd);
    const settledRevenueUsd = settlement.amountCents / 100;
    const event: ImageLifecycleEvent = { kind: "image-downlinked", eventId, imageId, timeSeconds, revenueUsd: settledRevenueUsd };
    image.status = "delivered";
    image.transferredBytes = image.sizeBytes;
    image.deliveredAtSeconds = timeSeconds;
    image.settledRevenueUsd = settledRevenueUsd;
    this.lifecycleEventIds.add(eventId);
    this.lifecycleEvents.push(event);
    return { ...event };
  }

  /** Remove an undelivered image from onboard inventory without revenue. */
  deleteUndeliveredImage(imageId: string, eventId: string, timeSeconds: number): ImageLifecycleEvent {
    const image = this.requireOnboardImage(imageId);
    this.validateLifecycleEvent(eventId, timeSeconds, image);
    const event: ImageLifecycleEvent = {
      kind: "image-deleted",
      eventId,
      imageId,
      timeSeconds,
      lostValuePotentialUsd: image.valuePotentialUsdAtCapture,
    };
    image.status = "deleted";
    image.deletedAtSeconds = timeSeconds;
    this.lifecycleEventIds.add(eventId);
    this.lifecycleEvents.push(event);
    return { ...event };
  }

  private requireOnboardImage(imageId: string): CellImageRecord {
    if (!imageId.trim()) throw new Error("Image ID is required");
    const image = this.images.get(imageId);
    if (!image) throw new Error(`Unknown image: ${imageId}`);
    if (image.status !== "onboard") throw new Error(`Image is not onboard: ${imageId}`);
    return image;
  }

  private validateLifecycleEvent(eventId: string, timeSeconds: number, image: CellImageRecord): void {
    if (!eventId.trim()) throw new Error("Lifecycle event ID is required");
    if (this.lifecycleEventIds.has(eventId)) throw new Error(`Lifecycle event already committed: ${eventId}`);
    if (!Number.isFinite(timeSeconds) || timeSeconds < image.capturedAtSeconds) {
      throw new RangeError("Delivery or deletion time must be finite and no earlier than capture");
    }
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
