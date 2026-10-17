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

export type CellPlanningLayer = "none" | "scheduled" | "imaging";
type Route = { name: string; url?: string; latitudeDeg: number; longitudeDeg: number };

export function categoryPriorityDisplayMaximum(categoryId: string, market: CellMarketState): number {
  const rate = market.getPlayerPriorityRates().find(item => item.categoryId === categoryId);
  return Math.max(1, market.exposures.maximum(categoryId) * (rate?.pointsPerUnit ?? 0));
}

function colorAt(t: number): [number, number, number] {
  const start = [246, 222, 83], end = [18, 156, 137];
  return start.map((value, index) => Math.round(value + (end[index]! - value) * t)) as [number, number, number];
}

function createProvider(
  grid: CellGrid,
  categoryId: string | null,
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
      const maximum = categoryId ? categoryPriorityDisplayMaximum(categoryId, market) : 1;
      const scale = 2 ** level, span = 720 / scale;
      const rowStart = y * span, columnStart = x * span;
      const rowFrom = Math.max(0, Math.floor(rowStart)), rowTo = Math.min(720, Math.ceil(rowStart + span));
      const colFrom = Math.max(0, Math.floor(columnStart)), colTo = Math.min(1440, Math.ceil(columnStart + span));
      for (let row = rowFrom; row < rowTo; row++) for (let col = colFrom; col < colTo; col++) {
        const index = grid.indexById[row * 1440 + col];
        if (index < 0) continue;
        let cellValue = 0;
        if (categoryId) cellValue = market.calculateCell(index, now).categories
          .find(category => category.categoryId === categoryId)?.availablePriorityPoints ?? 0;
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
          const t = Math.log1p(value) / ceiling;
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

export async function createCellLayer(
  viewer: Viewer,
  grid: CellGrid,
  onSelect: (index: number, route?: Route) => void,
  getMarket: () => CellMarketState,
  nowSeconds: () => number,
) {
  let layer: ImageryLayer;
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
    layer = new ImageryLayer(createProvider(grid, categoryId, getMarket, nowSeconds), {
      magnificationFilter: TextureMagnificationFilter.NEAREST,
      minificationFilter: TextureMinificationFilter.NEAREST,
    });
    layer.show = visible;
    viewer.imageryLayers.add(layer);
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
      viewer.scene.requestRender();
  };

  return {
    setCategory,
    refreshCategory() { if (selectedCategoryId) setCategory(selectedCategoryId); },
    setPlanningLayer(mode: CellPlanningLayer) {
      planningLayer = mode;
      renderOperationalOverlay(lastOperationalState, lastSatelliteEarthFixedKm);
    },
    setOperationalOverlay(state: CellOperationalVisualization, satelliteEarthFixedKm: { x: number; y: number; z: number } | null) {
      lastOperationalState = state;
      lastSatelliteEarthFixedKm = satelliteEarthFixedKm;
      renderOperationalOverlay(state, satelliteEarthFixedKm);
    },
    setVisible(show: boolean) {
      visible = show; layer.show = show;
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
      viewer.imageryLayers.remove(layer, true);
    },
  };
}
