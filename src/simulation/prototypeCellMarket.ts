import type { CellGrid } from "./cells";
import { PROPOSED_CELL_CATEGORIES } from "./categoryExposures";
import { CellMarketState } from "./cellMarketState";
import type { CompanyFinance } from "./companyFinance";

/** Reversible sample inputs for inspecting the cell calculation in Orders. */
export function createPrototypeCellMarket(grid: CellGrid, finance?: CompanyFinance): CellMarketState {
  const cadenceSeconds = 100 * 24 * 60 * 60;
  return new CellMarketState(
    grid,
    PROPOSED_CELL_CATEGORIES.map(category => ({
      id: category.id,
      unit: category.unit,
      marketPriceUsdPerUnit: 1,
      cadenceSeconds,
    })),
    PROPOSED_CELL_CATEGORIES.map(category => ({
      categoryId: category.id,
      unit: category.unit,
      pointsPerUnit: 1,
    })),
    0,
    undefined,
    finance,
  );
}
