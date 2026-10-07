/** Quarter-degree market geography. This module has no renderer or browser dependencies. */
export const CELL_DEGREES = 0.25;
export const CELL_COLUMNS = 1440;
export const CELL_ROWS = 720;
export const GLOBAL_CELL_COUNT = CELL_COLUMNS * CELL_ROWS;
export const CELL_FLAGS = { coastal: 1, urban: 2, border: 4, cropland: 8, powerPlants: 16, oilPipelines: 32 } as const;

export type CellLayer = "coverage" | "cityCount" | "cityPopulation" | "portCount" | "urban" | "border" | "coastal" |
  "cropland" | "pasture" | "powerPlants" | "powerCapacity" | "oilPipelines" | "militarySites" | "dataCenters" | "researchSites" | "monuments";
export const CELL_LAYERS: Record<CellLayer, { label: string; description: string }> = {
  coverage: { label: "Eligible cells", description: "All cells touched by mapped land, including coasts and islands." },
  cityCount: { label: "Cities & towns", description: "Number of mapped populated places per cell." },
  cityPopulation: { label: "Mapped city population", description: "Source population estimates at city points; not total cell population." },
  portCount: { label: "Ports & harbors", description: "Number of mapped ports per cell." },
  urban: { label: "Urban footprint area", description: "Estimated square kilometres of mapped urban polygons per cell (Natural Earth, sampled within each cell)." },
  border: { label: "Land borders", description: "Cells intersecting a mapped international land boundary." },
  coastal: { label: "Coastal cells", description: "Cells intersecting the mapped coastline; no land percentage weighting." },
  cropland: { label: "Cropland area", description: "Estimated cropland area in hectares per cell (circa 2015)." },
  pasture: { label: "Pasture area", description: "Estimated pasture area in hectares per cell (circa 2015)." },
  powerPlants: { label: "Power plants", description: "Mapped power plant records per cell (WRI v1.3.0)." },
  powerCapacity: { label: "Power capacity", description: "Mapped plant capacity in megawatts per cell (WRI v1.3.0)." },
  oilPipelines: { label: "Major oil pipelines", description: "Mapped operating, construction, and proposed oil routes crossing each cell." },
  militarySites: { label: "Military installations", description: "DoD/NTAD installation polygons intersecting each cell; large installations can span multiple cells." },
  dataCenters: { label: "Data centers", description: "Approximate Gigawatt Map records; campus polygons appear in each intersected cell." },
  researchSites: { label: "Research sites", description: "NOAA Global Monitoring Laboratory atmospheric and environmental observation stations." },
  monuments: { label: "World Heritage sites", description: "UNESCO World Heritage entries with mapped point locations." },
};

export const UNSOURCED_ATTRIBUTES = [
  "Natural gas pipelines", "Power transmission lines", "Substations",
  "Sensitive ecological areas", "Ships of interest",
] as const;

export type CellSource = { key: string; name: string; version: string; url: string; sha256: string; license: string; licenseUrl: string; retrievedOn: string; scale: string; attribution?: string; pagination?: string };
export type CellGridMetadata = {
  schemaVersion: number; resolutionDeg: number; rows: number; columns: number;
  recordBytes: number; count: number; totalCells: number;
  gridSha256: string; uncompressedBytes: number;
  statistics: { coastalCells: number; urbanCells: number; borderCells: number; cities: number; ports: number;
    maximumCityPopulation: number; maximumCityCount: number; maximumPortCount: number;
    urbanFootprintAreaKm2: number; maximumUrbanAreaDeciKm2: number;
    cellsWithCropland: number; cellsWithPasture: number; croplandAreaHa: number; pastureAreaHa: number;
    maximumCroplandAreaHa: number; maximumPastureAreaHa: number;
    powerPlants: number; powerCapacityMw: number; cellsWithOilPipelines: number; mappedOilPipelineRoutes: number;
    maximumPowerPlantCount: number; maximumPowerCapacityMw: number; maximumOilPipelineCount: number;
    militaryInstallations: number; cellsWithMilitarySites: number; dataCenterRecords: number; cellsWithDataCenters: number;
    researchStations: number; cellsWithResearchSites: number; worldHeritageRecords: number; cellsWithMonuments: number;
    militaryInstallationPolygons: number; dataCenterPolygons: number; mappedResearchSites: number; mappedMonuments: number;
    maximumMilitarySiteCount: number; maximumDataCenterCount: number; maximumResearchSiteCount: number; maximumMonumentCount: number;
    excludedPoints: Record<string, number>; excludedPointFeatures: Record<string, number> };
  sources: CellSource[]; limitations: string[]; unsourcedAttributes: string[];
};
export type CellPlace = { name: string; kind: "city" | "port"; population?: number | null; region?: string };
export type CellPlaces = Record<string, CellPlace[]>;
export type OilPipelineRoutes = { type: "FeatureCollection"; features: unknown[]; attribution?: string; sourceUrl?: string };

/** Null means unconfigured/unknown. No revenue or recharge defaults are invented. */
export type CellEconomy = {
  maximumValueUsd: number | null;
  availableValueUsd: number | null;
  lastCollectedAtSeconds: number | null;
  recoveryDurationSeconds: number | null;
};

export function cellIdAt(latitudeDeg: number, longitudeDeg: number): number | null {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) return null;
  const longitude = ((longitudeDeg + 180) % 360 + 360) % 360;
  const column = Math.floor(longitude / CELL_DEGREES);
  const row = Math.min(CELL_ROWS - 1, Math.floor((90 - latitudeDeg) / CELL_DEGREES));
  return row * CELL_COLUMNS + column;
}

export function cellBounds(id: number) {
  if (!Number.isInteger(id) || id < 0 || id >= GLOBAL_CELL_COUNT) throw new RangeError("Invalid cell ID");
  const row = Math.floor(id / CELL_COLUMNS);
  const column = id % CELL_COLUMNS;
  const west = -180 + column * CELL_DEGREES;
  const north = 90 - row * CELL_DEGREES;
  return { west, east: west + CELL_DEGREES, north, south: north - CELL_DEGREES,
    latitudeDeg: north - CELL_DEGREES / 2, longitudeDeg: west + CELL_DEGREES / 2 };
}

export function cellLabel(id: number): string { return `C${id.toString().padStart(7, "0")}`; }

export class CellGrid {
  readonly ids: Uint32Array;
  readonly population: Uint32Array;
  readonly cityCounts: Uint16Array;
  readonly portCounts: Uint16Array;
  readonly croplandHa: Uint32Array;
  readonly pastureHa: Uint32Array;
  readonly powerPlantCounts: Uint16Array;
  readonly powerCapacityMw: Uint32Array;
  readonly oilPipelineCounts: Uint16Array;
  readonly militarySiteCounts: Uint16Array;
  readonly dataCenterCounts: Uint16Array;
  readonly researchSiteCounts: Uint16Array;
  readonly monumentCounts: Uint16Array;
  readonly flags: Uint8Array;
  readonly urbanAreaDeciKm2: Uint16Array;
  readonly indexById = new Int32Array(GLOBAL_CELL_COUNT).fill(-1);
  readonly metadata: CellGridMetadata;
  readonly places: CellPlaces;
  readonly oilPipelineRoutes: OilPipelineRoutes | null;
  readonly searchNames = new Map<number, string>();

  constructor(buffer: ArrayBuffer, metadata: CellGridMetadata, places: CellPlaces, oilPipelineRoutes: OilPipelineRoutes | null = null) {
    const bytes = new DataView(buffer);
    if (buffer.byteLength < 12 || bytes.getUint32(0, false) !== 0x53454347 || bytes.getUint32(4, true) !== 4 ||
        metadata.schemaVersion !== 4 || metadata.resolutionDeg !== CELL_DEGREES ||
        metadata.rows !== CELL_ROWS || metadata.columns !== CELL_COLUMNS || metadata.totalCells !== GLOBAL_CELL_COUNT ||
        metadata.recordBytes !== 40 || bytes.getUint32(8, true) !== metadata.count ||
        buffer.byteLength !== 12 + metadata.count * 40) throw new Error("Invalid or incompatible cell grid data");
    this.metadata = metadata;
    this.places = places;
    const n = metadata.count;
    this.ids = new Uint32Array(n);
    this.population = new Uint32Array(n);
    this.cityCounts = new Uint16Array(n);
    this.portCounts = new Uint16Array(n);
    this.croplandHa = new Uint32Array(n);
    this.pastureHa = new Uint32Array(n);
    this.powerPlantCounts = new Uint16Array(n);
    this.powerCapacityMw = new Uint32Array(n);
    this.oilPipelineCounts = new Uint16Array(n);
    this.militarySiteCounts = new Uint16Array(n);
    this.dataCenterCounts = new Uint16Array(n);
    this.researchSiteCounts = new Uint16Array(n);
    this.monumentCounts = new Uint16Array(n);
    this.flags = new Uint8Array(n);
    this.urbanAreaDeciKm2 = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const offset = 12 + i * 40;
      const id = bytes.getUint32(offset, true);
      if (id >= GLOBAL_CELL_COUNT || (i > 0 && id <= this.ids[i - 1])) throw new Error("Invalid cell ordering");
      this.ids[i] = id;
      this.population[i] = bytes.getUint32(offset + 4, true);
      this.cityCounts[i] = bytes.getUint16(offset + 8, true);
      this.portCounts[i] = bytes.getUint16(offset + 10, true);
      this.flags[i] = bytes.getUint8(offset + 12);
      this.urbanAreaDeciKm2[i] = bytes.getUint16(offset + 13, true);
      this.croplandHa[i] = bytes.getUint32(offset + 16, true);
      this.pastureHa[i] = bytes.getUint32(offset + 20, true);
      this.powerPlantCounts[i] = bytes.getUint16(offset + 24, true);
      this.powerCapacityMw[i] = bytes.getUint32(offset + 26, true);
      this.oilPipelineCounts[i] = bytes.getUint16(offset + 30, true);
      this.militarySiteCounts[i] = bytes.getUint16(offset + 32, true);
      this.dataCenterCounts[i] = bytes.getUint16(offset + 34, true);
      this.researchSiteCounts[i] = bytes.getUint16(offset + 36, true);
      this.monumentCounts[i] = bytes.getUint16(offset + 38, true);
      this.indexById[id] = i;
    }
    this.oilPipelineRoutes = oilPipelineRoutes;
    for (const [id, entries] of Object.entries(places)) {
      this.searchNames.set(Number(id), entries.map(p => `${p.name} ${p.region ?? ""}`).join(" ").toLocaleLowerCase());
    }
  }

  indexAt(latitudeDeg: number, longitudeDeg: number): number {
    const id = cellIdAt(latitudeDeg, longitudeDeg);
    return id === null ? -1 : this.indexById[id];
  }

  value(index: number, layer: CellLayer): number {
    switch (layer) {
      case "coverage": return 1;
      case "cityCount": return this.cityCounts[index];
      case "cityPopulation": return this.population[index];
      case "portCount": return this.portCounts[index];
      case "cropland": return this.croplandHa[index];
      case "pasture": return this.pastureHa[index];
      case "powerPlants": return this.powerPlantCounts[index];
      case "powerCapacity": return this.powerCapacityMw[index];
      case "oilPipelines": return this.oilPipelineCounts[index];
      case "militarySites": return this.militarySiteCounts[index];
      case "dataCenters": return this.dataCenterCounts[index];
      case "researchSites": return this.researchSiteCounts[index];
      case "monuments": return this.monumentCounts[index];
      case "urban": return this.urbanAreaDeciKm2[index];
      case "border": case "coastal": return (this.flags[index] & CELL_FLAGS[layer]) ? 1 : 0;
    }
  }

  maximum(layer: CellLayer): number {
    const stats = this.metadata.statistics;
    if (layer === "cityPopulation") return stats.maximumCityPopulation;
    if (layer === "urban") return stats.maximumUrbanAreaDeciKm2;
    if (layer === "cityCount") return stats.maximumCityCount;
    if (layer === "portCount") return stats.maximumPortCount;
    if (layer === "cropland") return stats.maximumCroplandAreaHa;
    if (layer === "pasture") return stats.maximumPastureAreaHa;
    if (layer === "powerPlants") return stats.maximumPowerPlantCount;
    if (layer === "powerCapacity") return stats.maximumPowerCapacityMw;
    if (layer === "oilPipelines") return stats.maximumOilPipelineCount;
    if (layer === "militarySites") return stats.maximumMilitarySiteCount;
    if (layer === "dataCenters") return stats.maximumDataCenterCount;
    if (layer === "researchSites") return stats.maximumResearchSiteCount;
    if (layer === "monuments") return stats.maximumMonumentCount;
    return 1;
  }

  cell(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.ids.length) throw new RangeError("Invalid cell index");
    const id = this.ids[index];
    return {
      id, label: cellLabel(id), bounds: cellBounds(id), places: this.places[id] ?? [],
      attributes: { cityCount: this.cityCounts[index], cityPopulation: this.population[index], portCount: this.portCounts[index],
        croplandAreaHa: this.croplandHa[index], pastureAreaHa: this.pastureHa[index],
        urbanAreaDeciKm2: this.urbanAreaDeciKm2[index],
        powerPlantCount: this.powerPlantCounts[index], powerCapacityMW: this.powerCapacityMw[index], oilPipelineCount: this.oilPipelineCounts[index],
        coastal: Boolean(this.flags[index] & CELL_FLAGS.coastal), urban: Boolean(this.flags[index] & CELL_FLAGS.urban), border: Boolean(this.flags[index] & CELL_FLAGS.border),
        militarySiteCount: this.militarySiteCounts[index], dataCenterCount: this.dataCenterCounts[index], energyGridLineLengthKm: null, substationCount: null,
        ecologicalAreaCount: null, researchSiteCount: this.researchSiteCounts[index], monumentCount: this.monumentCounts[index], shipCount: null },
      economy: { maximumValueUsd: null, availableValueUsd: null, lastCollectedAtSeconds: null, recoveryDurationSeconds: null } satisfies CellEconomy,
    };
  }
}
