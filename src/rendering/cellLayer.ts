import {
  Cartesian2, Cartesian3, Cartographic, Color, ConstantPositionProperty, ConstantProperty, Credit, Event,
  GeographicTilingScheme, ImageryLayer, Math as CesiumMath, Rectangle,
  LabelStyle, ScreenSpaceEventHandler, ScreenSpaceEventType, TextureMagnificationFilter, TextureMinificationFilter,
} from "cesium";
import type { ImageryProvider, Viewer } from "cesium";
import { cellBounds } from "../simulation/cells";
import type { CellGrid } from "../simulation/cells";
import type { CellMarketState } from "../simulation/cellMarketState";
import type { CellOperationalVisualization } from "../simulation/operationalLoop";
import { rasterizeCellTile } from "../simulation/cellRaster";
import { monthlyCloudBaselineAtPercent, WEATHER_EPOCH_UTC_MS } from "../simulation/weather";

export type CellPlanningLayer = "none" | "scheduled" | "imaging" | "maximum-value" | "current-priority";
type CellDotLayer = "maximum-value" | "current-priority";
type Route = { name: string; url?: string; latitudeDeg: number; longitudeDeg: number };

export function categoryPriorityDisplayMaximum(categoryId: string, market: CellMarketState): number {
  const rate = market.getPlayerPriorityRates().find(item => item.categoryId === categoryId);
  return Math.max(1, market.exposures.maximum(categoryId) * (rate?.pointsPerUnit ?? 0));
}

function colorAt(t: number): [number, number, number] {
  const start = [246, 222, 83], end = [18, 156, 137];
  return start.map((value, index) => Math.round(value + (end[index]! - value) * t)) as [number, number, number];
}

function maximumCellValueScaleCeiling(market: CellMarketState): number {
  const prices = new Map(market.getMarketReadout().map(category => [category.id, category.marketPriceUsdPerUnit]));
  return Math.max(1, market.exposures.definitions.reduce((sum, definition) =>
    sum + market.exposures.maximum(definition.id) * (prices.get(definition.id) ?? 0), 0));
}

function maximumCellPriorityScaleCeiling(market: CellMarketState): number {
  const rates = new Map(market.getPlayerPriorityRates().map(rate => [rate.categoryId, rate.pointsPerUnit]));
  return Math.max(1, market.exposures.definitions.reduce((sum, definition) =>
    sum + market.exposures.maximum(definition.id) * (rates.get(definition.id) ?? 0), 0));
}

function createProvider(
  grid: CellGrid,
  categoryId: string | null,
  getMarket: () => CellMarketState,
  nowSeconds: () => number,
  getCloudBaselineTable: () => Uint8Array | undefined,
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
      const cloudLayer = categoryId === "cloud-cover";
      const cloudBaseline = cloudLayer ? getCloudBaselineTable() : undefined;
      const cloudMonth = new Date(WEATHER_EPOCH_UTC_MS + now * 1000).getUTCMonth();
      const maximum = categoryId && !cloudLayer ? categoryPriorityDisplayMaximum(categoryId, market) : 100;
      const scale = 2 ** level, span = 720 / scale;
      const rowStart = y * span, columnStart = x * span;
      const rowFrom = Math.max(0, Math.floor(rowStart)), rowTo = Math.min(720, Math.ceil(rowStart + span));
      const colFrom = Math.max(0, Math.floor(columnStart)), colTo = Math.min(1440, Math.ceil(columnStart + span));
      for (let row = rowFrom; row < rowTo; row++) for (let col = colFrom; col < colTo; col++) {
        const index = grid.indexById[row * 1440 + col];
        if (index < 0) continue;
        let cellValue = 0;
        if (cloudLayer) {
          cellValue = cloudBaseline
            ? monthlyCloudBaselineAtPercent(cloudBaseline, row * 1440 + col, cloudMonth)
            : 50;
        } else if (categoryId) {
          cellValue = market.calculateCell(index, now).categories
            .find(category => category.categoryId === categoryId)?.availablePriorityPoints ?? 0;
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
      if (categoryId) {
        const ceiling = Math.log1p(maximum);
        for (let pixel = 0; pixel < values.length; pixel++) {
          const value = values[pixel]!;
          if (value < 0) continue;
          const t = cloudLayer ? value / 100 : Math.log1p(value) / ceiling;
          const [red, green, blue] = colorAt(t);
          const offset = pixel * 4;
          image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue;
          image.data[offset + 3] = value === 0 ? 0 : 88;
        }
      } else {
        image.data.set(rasterizeCellTile(grid, "coverage", x, y, level));
      }
      context.putImageData(image, 0, 0);
      return Promise.resolve(canvas);
    },
  };
}

function maximumValueColorAt(value: number): [number, number, number] {
  const stops: readonly (readonly [number, number, number])[] = [
    [37, 99, 235],   // blue
    [34, 197, 94],   // green
    [250, 204, 21],  // yellow
    [249, 115, 22],  // orange
    [239, 68, 68],   // red
  ];
  const position = Math.max(0, Math.min(1, value)) * (stops.length - 1);
  const startIndex = Math.min(stops.length - 2, Math.floor(position));
  const segment = position - startIndex;
  const start = stops[startIndex]!;
  const end = stops[startIndex + 1]!;
  return start.map((channel, index) => Math.round(channel + (end[index]! - channel) * segment)) as [number, number, number];
}

function createCellDotProvider(
  grid: CellGrid,
  getMarket: () => CellMarketState,
  nowSeconds: () => number,
  mode: CellDotLayer,
): ImageryProvider {
  const tilingScheme = new GeographicTilingScheme();
  return {
    tileWidth: 256, tileHeight: 256, minimumLevel: 0, maximumLevel: 9,
    tilingScheme, rectangle: tilingScheme.rectangle, hasAlphaChannel: true,
    errorEvent: new Event(), credit: new Credit(mode === "maximum-value"
      ? "Maximum potential cell payout: sample market rates and mapped geographic exposures"
      : "Current available cell priority: player priority rates and cell recovery"),
    proxy: undefined!, tileDiscardPolicy: undefined!, getTileCredits: () => [], pickFeatures: () => undefined,
    requestImage(x, y, level) {
      const market = getMarket();
      const prices = new Map(market.getMarketReadout().map(category => [category.id, category.marketPriceUsdPerUnit]));
      const scaleCeiling = Math.log1p(mode === "maximum-value"
        ? maximumCellValueScaleCeiling(market)
        : maximumCellPriorityScaleCeiling(market));
      const now = nowSeconds();
      const scale = 2 ** level, span = 720 / scale;
      const rowStart = y * span, columnStart = x * span;
      const pixelsPerCell = 256 / span;
      const radius = Math.min(2.4, Math.max(0.75, pixelsPerCell * 0.24));
      const pixelRadius = Math.ceil(radius);
      const bufferWidth = 256 + pixelRadius * 2;
      const centers = new Float32Array(bufferWidth * bufferWidth).fill(-1);
      const marginCells = Math.ceil(pixelRadius / pixelsPerCell);
      const rowFrom = Math.max(0, Math.floor(rowStart - marginCells));
      const rowTo = Math.min(720, Math.ceil(rowStart + span + marginCells));
      const colFrom = Math.max(0, Math.floor(columnStart - marginCells));
      const colTo = Math.min(1440, Math.ceil(columnStart + span + marginCells));

      for (let row = rowFrom; row < rowTo; row++) for (let col = colFrom; col < colTo; col++) {
        const index = grid.indexById[row * 1440 + col];
        if (index < 0) continue;
        const cellValue = mode === "maximum-value"
          ? market.exposures.forCell(index).reduce((sum, exposure) =>
            sum + exposure.quantity * (prices.get(exposure.categoryId) ?? 0), 0)
          : market.calculateCell(index, now).availablePriorityPoints;
        const normalized = Math.log1p(cellValue) / scaleCeiling;
        const centerX = Math.floor((col + 0.5 - columnStart) * pixelsPerCell) + pixelRadius;
        const centerY = Math.floor((row + 0.5 - rowStart) * pixelsPerCell) + pixelRadius;
        if (centerX < 0 || centerX >= bufferWidth || centerY < 0 || centerY >= bufferWidth) continue;
        const pixel = centerY * bufferWidth + centerX;
        centers[pixel] = Math.max(centers[pixel]!, normalized);
      }

      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(256, 256);
      const painted = new Float32Array(256 * 256).fill(-1);
      const radiusSquared = radius * radius;
      for (let center = 0; center < centers.length; center++) {
        const value = centers[center]!;
        if (value < 0) continue;
        const centerX = (center % bufferWidth) - pixelRadius;
        const centerY = Math.floor(center / bufferWidth) - pixelRadius;
        for (let dy = -pixelRadius; dy <= pixelRadius; dy++) for (let dx = -pixelRadius; dx <= pixelRadius; dx++) {
          if ((dx * dx) + (dy * dy) > radiusSquared) continue;
          const x = centerX + dx, y = centerY + dy;
          if (x < 0 || x >= 256 || y < 0 || y >= 256) continue;
          const pixel = y * 256 + x;
          painted[pixel] = Math.max(painted[pixel]!, value);
        }
      }
      for (let pixel = 0; pixel < painted.length; pixel++) {
        const value = painted[pixel]!;
        if (value < 0) continue;
        const [red, green, blue] = maximumValueColorAt(value);
        const offset = pixel * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 220;
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
  getCloudBaselineTable: () => Uint8Array | undefined,
) {
  let layer: ImageryLayer;
  let maximumValueLayer: ImageryLayer | null = null;
  let currentPriorityLayer: ImageryLayer | null = null;
  let visible = true;
  let selectedCategoryId: string | null = null;
  let planningLayer: CellPlanningLayer = "none";
  const selection = viewer.entities.add({
    id: "selected-market-cell", show: false,
    rectangle: { coordinates: Rectangle.fromDegrees(0, 0, 0.25, 0.25),
      material: Color.fromCssColorString("#f4f870").withAlpha(0.3),
      outline: true, outlineColor: Color.fromCssColorString("#f4f870"), height: 100 },
  });
  const scheduledEntities = new Map<number, ReturnType<Viewer["entities"]["add"]>>();
  const activeCellEntity = viewer.entities.add({ id: "active-imaging-cell", show: false,
    rectangle: { coordinates: Rectangle.fromDegrees(0, 0, 0.25, 0.25),
      material: Color.TRANSPARENT,
      outline: true, outlineColor: Color.fromCssColorString("#ffe45c"), outlineWidth: 3, height: 1_500 },
  });
  const activeCellMarker = viewer.entities.add({ id: "active-imaging-cell-marker", show: false,
    position: new ConstantPositionProperty(Cartesian3.fromDegrees(0, 0, 1_700)),
    point: { pixelSize: 13, color: Color.fromCssColorString("#ffe45c"), outlineColor: Color.fromCssColorString("#17242a"), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: "IMAGING", font: "bold 11px sans-serif", fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
  const imagingRay = viewer.entities.add({ id: "satellite-imaging-ray", show: false,
    polyline: { positions: [], width: 5, material: Color.fromCssColorString("#ffe45c"), clampToGround: false },
  });
  let selectedIndex = -1;
  let hasActiveCapture = false;
  let lastOperationalState: CellOperationalVisualization = { scheduledCellIndexes: [], activeCapture: null };
  let lastSatelliteEarthFixedKm: { x: number; y: number; z: number } | null = null;
  const setCategory = (categoryId: string | null) => {
    selectedCategoryId = categoryId;
    if (layer) viewer.imageryLayers.remove(layer, true);
    layer = new ImageryLayer(createProvider(grid, categoryId, getMarket, nowSeconds, getCloudBaselineTable), {
      magnificationFilter: TextureMagnificationFilter.NEAREST,
      minificationFilter: TextureMinificationFilter.NEAREST,
    });
    layer.show = visible;
    viewer.imageryLayers.add(layer);
    if (maximumValueLayer) viewer.imageryLayers.raiseToTop(maximumValueLayer);
    if (currentPriorityLayer) viewer.imageryLayers.raiseToTop(currentPriorityLayer);
    viewer.scene.requestRender();
  };
  setCategory(null);
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

  const renderOperationalOverlay = (state: CellOperationalVisualization, satelliteEarthFixedKm: { x: number; y: number; z: number } | null) => {
      const uniqueIndexes = [...new Set(state.scheduledCellIndexes)];
      const keep = new Set(uniqueIndexes);
      for (const [index, entity] of scheduledEntities) if (!keep.has(index)) {
        viewer.entities.remove(entity); scheduledEntities.delete(index);
      }
      for (const index of uniqueIndexes) if (!scheduledEntities.has(index)) {
        const b = cellBounds(grid.ids[index]!);
        scheduledEntities.set(index, viewer.entities.add({ id: `scheduled-cell-${index}`,
          rectangle: { coordinates: Rectangle.fromDegrees(b.west, b.south, b.east, b.north),
            material: Color.TRANSPARENT,
            outline: true, outlineColor: Color.fromCssColorString("#ff7043"), outlineWidth: 3, height: 1_000 },
        }));
      }
      const capture = state.activeCapture;
      hasActiveCapture = capture !== null;
      const activeVisible = visible && planningLayer === "imaging" && capture !== null;
      activeCellEntity.show = activeVisible;
      activeCellMarker.show = activeVisible;
      imagingRay.show = visible && planningLayer === "imaging" && capture !== null && satelliteEarthFixedKm !== null;
      if (capture) {
        const b = cellBounds(grid.ids[capture.cellIndex]!);
        activeCellEntity.rectangle!.coordinates = new ConstantProperty(Rectangle.fromDegrees(b.west, b.south, b.east, b.north));
        activeCellMarker.position = new ConstantPositionProperty(Cartesian3.fromDegrees(b.longitudeDeg, b.latitudeDeg, 1_700));
        if (satelliteEarthFixedKm) imagingRay.polyline!.positions = new ConstantProperty([
          new Cartesian3(satelliteEarthFixedKm.x * 1_000, satelliteEarthFixedKm.y * 1_000, satelliteEarthFixedKm.z * 1_000),
          Cartesian3.fromDegrees(capture.target.longitudeDeg, capture.target.latitudeDeg, 100),
        ]);
      }
      for (const entity of scheduledEntities.values()) entity.show = visible && planningLayer === "scheduled";
      if (maximumValueLayer) maximumValueLayer.show = visible && planningLayer === "maximum-value";
      if (currentPriorityLayer) currentPriorityLayer.show = visible && planningLayer === "current-priority";
      viewer.scene.requestRender();
  };

  return {
    setCategory,
    refreshCategory() { if (selectedCategoryId) setCategory(selectedCategoryId); },
    setPlanningLayer(mode: CellPlanningLayer) {
      planningLayer = mode;
      if (mode === "maximum-value" && !maximumValueLayer) {
        maximumValueLayer = new ImageryLayer(createCellDotProvider(grid, getMarket, nowSeconds, "maximum-value"), {
          magnificationFilter: TextureMagnificationFilter.NEAREST,
          minificationFilter: TextureMinificationFilter.NEAREST,
        });
        maximumValueLayer.show = visible;
        viewer.imageryLayers.add(maximumValueLayer);
      }
      if (mode === "current-priority" && !currentPriorityLayer) {
        currentPriorityLayer = new ImageryLayer(createCellDotProvider(grid, getMarket, nowSeconds, "current-priority"), {
          magnificationFilter: TextureMagnificationFilter.NEAREST,
          minificationFilter: TextureMinificationFilter.NEAREST,
        });
        currentPriorityLayer.show = visible;
        viewer.imageryLayers.add(currentPriorityLayer);
      }
      if (maximumValueLayer) maximumValueLayer.show = visible && mode === "maximum-value";
      if (currentPriorityLayer) currentPriorityLayer.show = visible && mode === "current-priority";
      renderOperationalOverlay(lastOperationalState, lastSatelliteEarthFixedKm);
    },
    refreshCurrentPriority() {
      if (!currentPriorityLayer || planningLayer !== "current-priority") return;
      viewer.imageryLayers.remove(currentPriorityLayer, true);
      currentPriorityLayer = new ImageryLayer(createCellDotProvider(grid, getMarket, nowSeconds, "current-priority"), {
        magnificationFilter: TextureMagnificationFilter.NEAREST,
        minificationFilter: TextureMinificationFilter.NEAREST,
      });
      currentPriorityLayer.show = visible;
      viewer.imageryLayers.add(currentPriorityLayer);
      viewer.scene.requestRender();
    },
    setOperationalOverlay(state: CellOperationalVisualization, satelliteEarthFixedKm: { x: number; y: number; z: number } | null) {
      lastOperationalState = state;
      lastSatelliteEarthFixedKm = satelliteEarthFixedKm;
      renderOperationalOverlay(state, satelliteEarthFixedKm);
    },
    setVisible(show: boolean) {
      visible = show; layer.show = show;
      if (maximumValueLayer) maximumValueLayer.show = show && planningLayer === "maximum-value";
      if (currentPriorityLayer) currentPriorityLayer.show = show && planningLayer === "current-priority";
      selection.show = show && selectedIndex !== -1;
      for (const entity of scheduledEntities.values()) entity.show = show && planningLayer === "scheduled";
      activeCellEntity.show = show && planningLayer === "imaging" && hasActiveCapture;
      activeCellMarker.show = activeCellEntity.show;
      imagingRay.show = show && planningLayer === "imaging" && hasActiveCapture;
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
      clickHandler.destroy(); viewer.entities.remove(selection); viewer.entities.remove(activeCellEntity); viewer.entities.remove(activeCellMarker); viewer.entities.remove(imagingRay);
      for (const entity of scheduledEntities.values()) viewer.entities.remove(entity);
      if (maximumValueLayer) viewer.imageryLayers.remove(maximumValueLayer, true);
      if (currentPriorityLayer) viewer.imageryLayers.remove(currentPriorityLayer, true);
      viewer.imageryLayers.remove(layer, true);
    },
  };
}
