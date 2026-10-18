import type { CellGrid } from "./cells";
import { PROPOSED_CELL_CATEGORIES } from "./categoryExposures";
import { CellMarketState } from "./cellMarketState";
import type { CompanyFinance } from "./companyFinance";

/**
 * Independent, unbalanced sample prices for category-specific tuning.
 * Replace each amount independently; units follow categoryExposures.ts.
 */
export const PROTOTYPE_MARKET_PRICE_USD_PER_UNIT: Readonly<Record<string, number>> = {
  "coastal-cells": 100,
  urban: 50,
  cropland: 30,
  pasture: 20,
  cities: 60,
  ports: 40,
  "power-plants": 500,
  "power-capacity": 150,
  "oil-pipelines": 200,
  "military-installations": 200,
  "data-centers": 1000,
  "research-sites": 50,
  "world-heritage": 30,
};

/** Independently configurable sample customer refresh intervals, in simulation days. */
export const PROTOTYPE_MARKET_REFRESH_CADENCE_DAYS: Readonly<Record<string, number>> = {
  "coastal-cells": 300,
  urban: 50,
  cropland: 100,
  pasture: 200,
  cities: 100,
  ports: 30,
  "power-plants": 50,
  "power-capacity": 200,
  "oil-pipelines": 150,
  "military-installations": 200,
  "data-centers": 30,
  "research-sites": 100,
  "world-heritage": 300,
};

/** Reversible sample inputs for inspecting the cell calculation in Orders. */
export function createPrototypeCellMarket(grid: CellGrid, finance?: CompanyFinance): CellMarketState {
  const categories = PROPOSED_CELL_CATEGORIES;
  const categoryIds = new Set(categories.map(category => category.id));
  const configuredPriceIds = Object.keys(PROTOTYPE_MARKET_PRICE_USD_PER_UNIT);
  const configuredCadenceIds = Object.keys(PROTOTYPE_MARKET_REFRESH_CADENCE_DAYS);
  const missingPrices = categories.filter(category => !Object.prototype.hasOwnProperty.call(PROTOTYPE_MARKET_PRICE_USD_PER_UNIT, category.id));
  const missingCadences = categories.filter(category => !Object.prototype.hasOwnProperty.call(PROTOTYPE_MARKET_REFRESH_CADENCE_DAYS, category.id));
  const unusedPrices = configuredPriceIds.filter(categoryId => !categoryIds.has(categoryId));
  const unusedCadences = configuredCadenceIds.filter(categoryId => !categoryIds.has(categoryId));
  if (missingPrices.length || missingCadences.length || unusedPrices.length || unusedCadences.length) {
    throw new Error(
      `Prototype market configuration must match the category list `
      + `(missing prices: ${missingPrices.map(item => item.id).join(", ") || "none"}; `
      + `missing cadences: ${missingCadences.map(item => item.id).join(", ") || "none"}; `
      + `unused prices: ${unusedPrices.join(", ") || "none"}; `
      + `unused cadences: ${unusedCadences.join(", ") || "none"})`,
    );
  }
  return new CellMarketState(
    grid,
    categories.map(category => ({
      id: category.id,
      unit: category.unit,
      marketPriceUsdPerUnit: PROTOTYPE_MARKET_PRICE_USD_PER_UNIT[category.id]!,
      cadenceSeconds: (() => {
        const days = PROTOTYPE_MARKET_REFRESH_CADENCE_DAYS[category.id]!;
        if (!Number.isFinite(days) || days <= 0) {
          throw new RangeError(`Refresh cadence for ${category.id} must be finite and positive`);
        }
        return days * 24 * 60 * 60;
      })(),
    })),
    categories.map(category => ({
      categoryId: category.id,
      unit: category.unit,
      pointsPerUnit: 1,
    })),
    0,
    undefined,
    finance,
  );
}
