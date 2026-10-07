import type { CellGrid } from "./cells.ts";
import type { CellCategoryExposure } from "./cellEconomy.ts";

export type CellCategoryExposureDefinition = {
  id: string;
  label: string;
  unit: string;
  sourceField: string;
  read: (grid: CellGrid, index: number) => number;
};

/**
 * Proposed initial market categories. These define only measurable exposure;
 * market prices, player priority rates, and cadences remain scenario inputs.
 */
export const PROPOSED_CELL_CATEGORIES: readonly CellCategoryExposureDefinition[] = [
  { id: "urban", label: "Urban footprint", unit: "km2", sourceField: "urbanAreaDeciKm2", read: (grid, index) => grid.urbanAreaDeciKm2[index] / 10 },
  { id: "cropland", label: "Cropland", unit: "km2", sourceField: "croplandHa", read: (grid, index) => grid.croplandHa[index] / 100 },
  { id: "pasture", label: "Pasture", unit: "km2", sourceField: "pastureHa", read: (grid, index) => grid.pastureHa[index] / 100 },
  { id: "cities", label: "Mapped populated-place records", unit: "city-record", sourceField: "cityCounts", read: (grid, index) => grid.cityCounts[index] },
  { id: "ports", label: "Mapped port records", unit: "port-record", sourceField: "portCounts", read: (grid, index) => grid.portCounts[index] },
  { id: "power-plants", label: "Mapped power-plant records", unit: "plant-record", sourceField: "powerPlantCounts", read: (grid, index) => grid.powerPlantCounts[index] },
  { id: "power-capacity", label: "Mapped power capacity", unit: "MW", sourceField: "powerCapacityMw", read: (grid, index) => grid.powerCapacityMw[index] },
  { id: "oil-pipelines", label: "Mapped oil pipeline route features", unit: "route-feature", sourceField: "oilPipelineCounts", read: (grid, index) => grid.oilPipelineCounts[index] },
  { id: "military-installations", label: "Military installation polygon presence", unit: "installation-polygon", sourceField: "militarySiteCounts", read: (grid, index) => grid.militarySiteCounts[index] },
  { id: "data-centers", label: "Mapped data-center records/polygon presence", unit: "data-center-record-or-polygon", sourceField: "dataCenterCounts", read: (grid, index) => grid.dataCenterCounts[index] },
  { id: "research-sites", label: "NOAA research station records", unit: "station-record", sourceField: "researchSiteCounts", read: (grid, index) => grid.researchSiteCounts[index] },
  { id: "world-heritage", label: "Mapped World Heritage site records", unit: "site-record", sourceField: "monumentCounts", read: (grid, index) => grid.monumentCounts[index] },
];

/** Provides normalized exposures on demand without building per-cell objects. */
export class CellCategoryExposureIndex {
  readonly definitions: readonly CellCategoryExposureDefinition[];
  private readonly definitionById: Map<string, CellCategoryExposureDefinition>;
  private readonly maximums = new Map<string, number>();
  private readonly grid: CellGrid;

  constructor(grid: CellGrid, definitions = PROPOSED_CELL_CATEGORIES) {
    this.grid = grid;
    const seen = new Set<string>();
    for (const definition of definitions) {
      if (!definition.id.trim() || seen.has(definition.id)) throw new Error(`Invalid or duplicate exposure category: ${definition.id}`);
      if (!definition.unit.trim()) throw new Error(`Exposure category ${definition.id} must declare a unit`);
      seen.add(definition.id);
    }
    this.definitions = definitions;
    this.definitionById = new Map(definitions.map(definition => [definition.id, definition]));
  }

  forCell(index: number): CellCategoryExposure[] {
    this.validateIndex(index);
    return this.definitions.map(definition => ({
      categoryId: definition.id,
      unit: definition.unit,
      quantity: definition.read(this.grid, index),
    }));
  }

  quantity(index: number, categoryId: string): number {
    this.validateIndex(index);
    const definition = this.definitionById.get(categoryId);
    if (!definition) throw new Error(`Unknown exposure category: ${categoryId}`);
    return definition.read(this.grid, index);
  }

  maximum(categoryId: string): number {
    const cached = this.maximums.get(categoryId);
    if (cached !== undefined) return cached;
    const definition = this.definitionById.get(categoryId);
    if (!definition) throw new Error(`Unknown exposure category: ${categoryId}`);
    let maximum = 0;
    for (let index = 0; index < this.grid.ids.length; index++) {
      maximum = Math.max(maximum, definition.read(this.grid, index));
    }
    this.maximums.set(categoryId, maximum);
    return maximum;
  }

  private validateIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.grid.ids.length) throw new RangeError("Invalid cell index");
  }
}
