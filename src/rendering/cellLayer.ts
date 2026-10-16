import {
  Cartesian3, Cartographic, Color, ConstantProperty, Credit, Event, GeoJsonDataSource,
  GeographicTilingScheme, ImageryLayer, Math as CesiumMath, Rectangle,
  ScreenSpaceEventHandler, ScreenSpaceEventType, TextureMagnificationFilter, TextureMinificationFilter,
} from "cesium";
import type { Cartesian2, ImageryProvider, Viewer } from "cesium";
import { cellBounds } from "../simulation/cells";
import type { CellGrid, CellLayer } from "../simulation/cells";
import type { CellMarketState } from "../simulation/cellMarketState";
import type { CellOperationalVisualization } from "../simulation/operationalLoop";
import { rasterizeCellTile } from "../simulation/cellRaster";

export type CellVisualizationLayer = CellLayer | "maximumPriority" | "availablePriority" | "availableValue" | "scheduled" | "imaging";
type Route = { name: string; url?: string; latitudeDeg: number; longitudeDeg: number };

export function economyDisplayMaximum(metric: CellVisualizationLayer, market: CellMarketState): number {
  if (!["maximumPriority", "availablePriority", "availableValue"].includes(metric)) return 1;
  const marketRates = new Map(market.getMarketReadout().map(rate => [rate.id, rate]));
  const priorityRates = new Map(market.getPlayerPriorityRates().map(rate => [rate.categoryId, rate]));
  return Math.max(1, market.exposures.definitions.reduce((total, definition) => {
    const rate = metric === "availableValue"
      ? marketRates.get(definition.id)!.marketPriceUsdPerUnit
      : priorityRates.get(definition.id)!.pointsPerUnit;
    return total + market.exposures.maximum(definition.id) * rate;
  }, 0));
}

function colorAt(t: number, layer: CellVisualizationLayer): [number, number, number] {
  const ramps: Record<string, [[number, number, number], [number, number, number]]> = {
    maximumPriority: [[28, 34, 82], [255, 195, 74]],
    availablePriority: [[246, 222, 83], [18, 156, 137]],
    availableValue: [[29, 57, 46], [227, 236, 103]],
  };
  const ramp = ramps[layer];
  if (!ramp) return [42 + 212 * t, 124 + 78 * t, 130 - 32 * t].map(Math.round) as [number, number, number];
  return ramp[0].map((start, index) => Math.round(start + (ramp[1][index]! - start) * t)) as [number, number, number];
}

function createProvider(
  grid: CellGrid,
  metric: CellVisualizationLayer,
  getMarket: () => CellMarketState,
  nowSeconds: () => number,
): ImageryProvider {
  const tilingScheme = new GeographicTilingScheme();
  return {
    tileWidth: 256, tileHeight: 256, minimumLevel: 0, maximumLevel: 9,
    tilingScheme, rectangle: tilingScheme.rectangle, hasAlphaChannel: true,
    errorEvent: new Event(), credit: new Credit("Geographic market data: Natural Earth, IFPRI, WRI, Global Energy Monitor (CC BY 4.0)"),
    proxy: undefined!, tileDiscardPolicy: undefined!, getTileCredits: () => [], pickFeatures: () => undefined,
    requestImage(x, y, level) {
      const values = new Float32Array(256 * 256).fill(-1);
      const market = getMarket();
      const now = nowSeconds();
      const maximum = economyDisplayMaximum(metric, market);
      const scale = 2 ** level, span = 720 / scale;
      const rowStart = y * span, columnStart = x * span;
      const rowFrom = Math.max(0, Math.floor(rowStart)), rowTo = Math.min(720, Math.ceil(rowStart + span));
      const colFrom = Math.max(0, Math.floor(columnStart)), colTo = Math.min(1440, Math.ceil(columnStart + span));
      for (let row = rowFrom; row < rowTo; row++) for (let col = colFrom; col < colTo; col++) {
        const index = grid.indexById[row * 1440 + col];
        if (index < 0) continue;
        let cellValue = 0;
        if (metric === "maximumPriority" || metric === "availablePriority" || metric === "availableValue") {
          const economy = market.calculateCell(index, now);
          cellValue = metric === "maximumPriority" ? economy.maximumPriorityPoints
            : metric === "availablePriority" ? economy.availablePriorityPoints : economy.availablePayoutUsd;
        }
        const top = Math.max(0, Math.floor((row - rowStart) * 256 / span));
        const bottom = Math.min(256, Math.ceil((row + 1 - rowStart) * 256 / span));
        const left = Math.max(0, Math.floor((col - columnStart) * 256 / span));
        const right = Math.min(256, Math.ceil((col + 1 - columnStart) * 256 / span));
        for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
          const pixel = py * 256 + px;
          values[pixel] = Math.max(values[pixel]!, cellValue);
        }
      }
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(256, 256);
      if (metric === "maximumPriority" || metric === "availablePriority" || metric === "availableValue") {
        const ceiling = Math.log1p(maximum);
        for (let pixel = 0; pixel < values.length; pixel++) {
          const value = values[pixel]!;
          if (value < 0) continue;
          const t = Math.log1p(value) / ceiling;
          const [red, green, blue] = colorAt(t, metric);
          const offset = pixel * 4;
          image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue;
          image.data[offset + 3] = value === 0 ? 35 : 190;
        }
      } else {
        image.data.set(rasterizeCellTile(grid, metric === "scheduled" || metric === "imaging" ? "coverage" : metric, x, y, level));
      }
      context.putImageData(image, 0, 0);
      return Promise.resolve(canvas);
    },
  };
}

export async function createCellLayer(
  viewer: Viewer,
  grid: CellGrid,
  onSelect: (index: number, route?: Route) => void,
  getMarket: () => CellMarketState,
  nowSeconds: () => number,
) {
  let layer: ImageryLayer;
  let visible = true;
  let selectedMetric: CellVisualizationLayer = "coverage";
  let pipelineSource: GeoJsonDataSource | undefined;
  if (grid.oilPipelineRoutes) {
    pipelineSource = await GeoJsonDataSource.load(grid.oilPipelineRoutes as Parameters<typeof GeoJsonDataSource.load>[0], {
      stroke: Color.fromCssColorString("#ffbd70"), strokeWidth: 2, clampToGround: true,
    });
    await viewer.dataSources.add(pipelineSource);
    pipelineSource.show = false;
  }
  const selection = viewer.entities.add({
    id: "selected-market-cell", show: false,
    rectangle: { coordinates: Rectangle.fromDegrees(0, 0, 0.25, 0.25),
      material: Color.fromCssColorString("#f4f870").withAlpha(0.3),
      outline: true, outlineColor: Color.fromCssColorString("#f4f870"), height: 100 },
  });
  const scheduledEntities = new Map<number, ReturnType<Viewer["entities"]["add"]>>();
  const activeCellEntity = viewer.entities.add({ id: "active-imaging-cell", show: false,
    rectangle: { coordinates: Rectangle.fromDegrees(0, 0, 0.25, 0.25),
      material: Color.fromCssColorString("#f4f870").withAlpha(0.48),
      outline: true, outlineColor: Color.fromCssColorString("#f4f870"), height: 150 },
  });
  const imagingRay = viewer.entities.add({ id: "satellite-imaging-ray", show: false,
    polyline: { positions: [], width: 3, material: Color.fromCssColorString("#f4f870").withAlpha(0.9), clampToGround: false },
  });
  let selectedIndex = -1;
  let hasActiveCapture = false;
  const setMetric = (metric: CellVisualizationLayer) => {
    selectedMetric = metric;
    if (layer) viewer.imageryLayers.remove(layer, true);
    layer = new ImageryLayer(createProvider(grid, metric, getMarket, nowSeconds), {
      magnificationFilter: TextureMagnificationFilter.NEAREST,
      minificationFilter: TextureMinificationFilter.NEAREST,
    });
    layer.show = visible;
    if (pipelineSource) pipelineSource.show = visible && metric === "oilPipelines";
    viewer.imageryLayers.add(layer);
    viewer.scene.requestRender();
  };
  setMetric("coverage");
  const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((event: { position: Cartesian2 }) => {
    if (!visible) return;
    const point = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
    if (!point) return;
    const location = Cartographic.fromCartesian(point);
    const picked = viewer.scene.drillPick(event.position) as Array<{ id?: { properties?: {
      name?: { getValue: () => string }; source_url?: { getValue: () => string };
    } } }>;
    const route = picked.map((item) => item.id?.properties).find((properties) => properties?.name);
    const name = route?.name?.getValue(), url = route?.source_url?.getValue();
    const latitudeDeg = CesiumMath.toDegrees(location.latitude), longitudeDeg = CesiumMath.toDegrees(location.longitude);
    onSelect(grid.indexAt(latitudeDeg, longitudeDeg), name ? { name, url, latitudeDeg, longitudeDeg } : undefined);
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    setMetric,
    refreshMetric() { if (["maximumPriority", "availablePriority", "availableValue"].includes(selectedMetric)) setMetric(selectedMetric); },
    setOperationalOverlay(state: CellOperationalVisualization, satelliteEarthFixedKm: { x: number; y: number; z: number } | null) {
      const uniqueIndexes = [...new Set(state.scheduledCellIndexes)];
      const keep = new Set(uniqueIndexes);
      for (const [index, entity] of scheduledEntities) if (!keep.has(index)) {
        viewer.entities.remove(entity); scheduledEntities.delete(index);
      }
      for (const index of uniqueIndexes) if (!scheduledEntities.has(index)) {
        const b = cellBounds(grid.ids[index]!);
        scheduledEntities.set(index, viewer.entities.add({ id: `scheduled-cell-${index}`,
          rectangle: { coordinates: Rectangle.fromDegrees(b.west, b.south, b.east, b.north),
            material: Color.fromCssColorString("#ff9b76").withAlpha(0.28),
            outline: true, outlineColor: Color.fromCssColorString("#ff9b76"), height: 120 },
        }));
      }
      const capture = state.activeCapture;
      hasActiveCapture = capture !== null;
      const activeVisible = visible && (selectedMetric === "imaging" || selectedMetric === "scheduled") && capture !== null;
      activeCellEntity.show = activeVisible;
      imagingRay.show = visible && selectedMetric === "imaging" && capture !== null && satelliteEarthFixedKm !== null;
      if (capture) {
        const b = cellBounds(grid.ids[capture.cellIndex]!);
        activeCellEntity.rectangle!.coordinates = new ConstantProperty(Rectangle.fromDegrees(b.west, b.south, b.east, b.north));
        if (satelliteEarthFixedKm) imagingRay.polyline!.positions = new ConstantProperty([
          new Cartesian3(satelliteEarthFixedKm.x * 1_000, satelliteEarthFixedKm.y * 1_000, satelliteEarthFixedKm.z * 1_000),
          Cartesian3.fromDegrees(capture.target.longitudeDeg, capture.target.latitudeDeg, 100),
        ]);
      }
      for (const entity of scheduledEntities.values()) entity.show = visible && selectedMetric === "scheduled";
      viewer.scene.requestRender();
    },
    setVisible(show: boolean) {
      visible = show; layer.show = show;
      if (pipelineSource) pipelineSource.show = show && selectedMetric === "oilPipelines";
      selection.show = show && selectedIndex !== -1;
      for (const entity of scheduledEntities.values()) entity.show = show && selectedMetric === "scheduled";
      activeCellEntity.show = show && (selectedMetric === "scheduled" || selectedMetric === "imaging") && hasActiveCapture;
      imagingRay.show = show && selectedMetric === "imaging" && hasActiveCapture;
      viewer.scene.requestRender();
    },
    select(index: number, flyTo = false) {
      selectedIndex = index;
      selection.show = visible && index !== -1;
      if (index !== -1) {
        const b = cellBounds(grid.ids[index]!);
        selection.rectangle!.coordinates = new ConstantProperty(Rectangle.fromDegrees(b.west, b.south, b.east, b.north));
        if (flyTo) viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(b.longitudeDeg, b.latitudeDeg, 180_000),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.2 });
      }
      viewer.scene.requestRender();
    },
    overview() {
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(-27, 17, 23_000_000),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.2 });
    },
    destroy() {
      clickHandler.destroy(); viewer.entities.remove(selection); viewer.entities.remove(activeCellEntity); viewer.entities.remove(imagingRay);
      for (const entity of scheduledEntities.values()) viewer.entities.remove(entity);
      viewer.imageryLayers.remove(layer, true);
      if (pipelineSource) void viewer.dataSources.remove(pipelineSource, true);
    },
  };
}
