/**
 * Pure cell payout and scheduling-priority calculations.
 *
 * Category definitions and cell exposures are inputs so this module can be
 * implemented before market categories or starting rates are finalized.
 */

export type MarketCategoryRate = {
  id: string;
  /** Human-readable unit shared by price, priority rate, and cell exposure. */
  unit: string;
  marketPriceUsdPerUnit: number;
  playerPriorityPointsPerUnit: number;
  cadenceSeconds: number;
};

export type CellCategoryExposure = {
  categoryId: string;
  unit: string;
  quantity: number;
};

export type CellRecoveryState = {
  /** Null means the cell has never been collected and starts fully available. */
  lastCollectedAtSeconds: number | null;
};

export type CellCategoryEconomy = {
  categoryId: string;
  unit: string;
  quantity: number;
  valueAvailabilityMultiplier: number;
  maximumPayoutUsd: number;
  availablePayoutUsd: number;
  maximumPriorityPoints: number;
  availablePriorityPoints: number;
};

export type CellEconomySnapshot = {
  lastCollectedAtSeconds: number | null;
  categories: CellCategoryEconomy[];
  maximumPayoutUsd: number;
  availablePayoutUsd: number;
  maximumPriorityPoints: number;
  availablePriorityPoints: number;
  atMaximum: boolean;
};

export type CellCaptureEvent = {
  kind: "cell-capture";
  cellId: number;
  completedAtSeconds: number;
  revenueUsd: number;
  categoryPayoutsUsd: Record<string, number>;
};

export type CellCaptureSettlement = {
  event: CellCaptureEvent;
  /** Commit this recovery state and the event/revenue together in the caller. */
  nextRecoveryState: CellRecoveryState;
  /** Priority at completion, before the successful capture resets VAM. */
  priorityPointsAtCompletion: number;
};

const MINIMUM_REFRESH_FRACTION = 0.1;
const RAMP_FRACTION = 1 - MINIMUM_REFRESH_FRACTION;

function requireFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number`);
  }
}

/** VAM is 0 through 10% of cadence, ramps linearly, and caps at 1 at cadence. */
export function valueAvailabilityMultiplier(elapsedSeconds: number, cadenceSeconds: number): number {
  requireFiniteNonNegative(elapsedSeconds, "Elapsed time");
  if (!Number.isFinite(cadenceSeconds) || cadenceSeconds <= 0) {
    throw new RangeError("Cadence must be a finite, positive duration");
  }

  const minimumRefreshSeconds = cadenceSeconds * MINIMUM_REFRESH_FRACTION;
  return Math.min(1, Math.max(0,
    (elapsedSeconds - minimumRefreshSeconds) / (cadenceSeconds * RAMP_FRACTION)));
}

function validateInputs(
  categories: readonly MarketCategoryRate[],
  exposures: readonly CellCategoryExposure[],
  nowSeconds: number,
  recoveryState: CellRecoveryState,
): Map<string, CellCategoryExposure> {
  requireFiniteNonNegative(nowSeconds, "Current time");
  const lastCollectedAt = recoveryState.lastCollectedAtSeconds;
  if (lastCollectedAt !== null) {
    requireFiniteNonNegative(lastCollectedAt, "Last collection time");
    if (lastCollectedAt > nowSeconds) throw new RangeError("Last collection time cannot be in the future");
  }

  const categoryIds = new Set<string>();
  for (const category of categories) {
    if (!category.id.trim() || categoryIds.has(category.id)) throw new Error(`Invalid or duplicate category ID: ${category.id}`);
    categoryIds.add(category.id);
    if (!category.unit.trim()) throw new Error(`Category ${category.id} must declare an exposure unit`);
    requireFiniteNonNegative(category.marketPriceUsdPerUnit, `Market price for ${category.id}`);
    requireFiniteNonNegative(category.playerPriorityPointsPerUnit, `Priority rate for ${category.id}`);
    if (!Number.isFinite(category.cadenceSeconds) || category.cadenceSeconds <= 0) {
      throw new RangeError(`Cadence for ${category.id} must be a finite, positive duration`);
    }
  }

  const exposureByCategory = new Map<string, CellCategoryExposure>();
  for (const exposure of exposures) {
    if (exposureByCategory.has(exposure.categoryId)) throw new Error(`Duplicate exposure for ${exposure.categoryId}`);
    if (!categoryIds.has(exposure.categoryId)) throw new Error(`Exposure has no category definition: ${exposure.categoryId}`);
    if (!exposure.unit.trim()) throw new Error(`Exposure for ${exposure.categoryId} must declare a unit`);
    requireFiniteNonNegative(exposure.quantity, `Exposure for ${exposure.categoryId}`);
    exposureByCategory.set(exposure.categoryId, exposure);
  }

  return exposureByCategory;
}

/** Calculate payout and player priority without mutating simulation state. */
export function calculateCellEconomy(
  categories: readonly MarketCategoryRate[],
  exposures: readonly CellCategoryExposure[],
  nowSeconds: number,
  recoveryState: CellRecoveryState,
): CellEconomySnapshot {
  const exposureByCategory = validateInputs(categories, exposures, nowSeconds, recoveryState);
  const lastCollectedAt = recoveryState.lastCollectedAtSeconds;
  const elapsedSeconds = lastCollectedAt === null ? null : nowSeconds - lastCollectedAt;

  const categoryValues = categories.map((category): CellCategoryEconomy => {
    const exposure = exposureByCategory.get(category.id);
    const quantity = exposure?.quantity ?? 0;
    if (exposure && exposure.unit !== category.unit) {
      throw new Error(`Unit mismatch for ${category.id}: expected ${category.unit}, received ${exposure.unit}`);
    }

    const vam = elapsedSeconds === null ? 1 : valueAvailabilityMultiplier(elapsedSeconds, category.cadenceSeconds);
    const maximumPayoutUsd = category.marketPriceUsdPerUnit * quantity;
    const maximumPriorityPoints = category.playerPriorityPointsPerUnit * quantity;
    return {
      categoryId: category.id,
      unit: category.unit,
      quantity,
      valueAvailabilityMultiplier: vam,
      maximumPayoutUsd,
      availablePayoutUsd: maximumPayoutUsd * vam,
      maximumPriorityPoints,
      availablePriorityPoints: maximumPriorityPoints * vam,
    };
  });

  const contributingCategories = categoryValues.filter(category => category.quantity > 0);
  return {
    lastCollectedAtSeconds: lastCollectedAt,
    categories: categoryValues,
    maximumPayoutUsd: categoryValues.reduce((sum, category) => sum + category.maximumPayoutUsd, 0),
    availablePayoutUsd: categoryValues.reduce((sum, category) => sum + category.availablePayoutUsd, 0),
    maximumPriorityPoints: categoryValues.reduce((sum, category) => sum + category.maximumPriorityPoints, 0),
    availablePriorityPoints: categoryValues.reduce((sum, category) => sum + category.availablePriorityPoints, 0),
    atMaximum: contributingCategories.length > 0 && contributingCategories.every(category => category.valueAvailabilityMultiplier === 1),
  };
}

/**
 * Settle a successful capture at completion time. The caller commits the
 * returned event, cash delta, and recovery state together as one simulation action.
 */
export function settleSuccessfulCellCapture(
  cellId: number,
  categories: readonly MarketCategoryRate[],
  exposures: readonly CellCategoryExposure[],
  completedAtSeconds: number,
  recoveryState: CellRecoveryState,
): CellCaptureSettlement {
  if (!Number.isSafeInteger(cellId) || cellId < 0) throw new RangeError("Cell ID must be a non-negative safe integer");
  const snapshot = calculateCellEconomy(categories, exposures, completedAtSeconds, recoveryState);
  const categoryPayoutsUsd = Object.fromEntries(snapshot.categories.map(category => [category.categoryId, category.availablePayoutUsd]));

  return {
    event: {
      kind: "cell-capture",
      cellId,
      completedAtSeconds,
      revenueUsd: snapshot.availablePayoutUsd,
      categoryPayoutsUsd,
    },
    nextRecoveryState: { lastCollectedAtSeconds: completedAtSeconds },
    priorityPointsAtCompletion: snapshot.availablePriorityPoints,
  };
}
