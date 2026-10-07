import {
  Cartesian3, Cartographic, Color, ConstantProperty, Credit, Event, GeoJsonDataSource,
  GeographicTilingScheme, ImageryLayer, Math as CesiumMath, Rectangle,
  ScreenSpaceEventHandler, ScreenSpaceEventType, TextureMagnificationFilter, TextureMinificationFilter,
} from "cesium";
import type { Cartesian2, ImageryProvider, Viewer } from "cesium";
import { cellBounds } from "../simulation/cells";
import type { CellGrid, CellLayer } from "../simulation/cells";
import { rasterizeCellTile } from "../simulation/cellRaster";

function createProvider(grid: CellGrid, metric: CellLayer): ImageryProvider {
  const tilingScheme = new GeographicTilingScheme();
  return {
    tileWidth: 256, tileHeight: 256, minimumLevel: 0, maximumLevel: 9,
    tilingScheme, rectangle: tilingScheme.rectangle, hasAlphaChannel: true,
    errorEvent: new Event(), credit: new Credit("Geographic market data: Natural Earth, IFPRI, WRI, Global Energy Monitor (CC BY 4.0)"),
    // Cesium permits these to be undefined although its interface types omit that union.
    proxy: undefined!, tileDiscardPolicy: undefined!,
    getTileCredits: () => [], pickFeatures: () => undefined,
    requestImage(x, y, level) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(256, 256);
      image.data.set(rasterizeCellTile(grid, metric, x, y, level));
      context.putImageData(image, 0, 0);
      return Promise.resolve(canvas);
    },
  };
}

export async function createCellLayer(viewer: Viewer, grid: CellGrid, onSelect: (index: number, route?: { name: string; url?: string; latitudeDeg: number; longitudeDeg: number }) => void) {
  let layer: ImageryLayer;
  let visible = true;
  let selectedMetric: CellLayer = "coverage";
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
  let selectedIndex = -1;
  const setMetric = (metric: CellLayer) => {
    selectedMetric = metric;
    if (layer) viewer.imageryLayers.remove(layer, true);
    layer = new ImageryLayer(createProvider(grid, metric), {
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
    const name = route?.name?.getValue();
    const url = route?.source_url?.getValue();
    const latitudeDeg = CesiumMath.toDegrees(location.latitude), longitudeDeg = CesiumMath.toDegrees(location.longitude);
    onSelect(grid.indexAt(latitudeDeg, longitudeDeg), name ? { name, url, latitudeDeg, longitudeDeg } : undefined);
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    setMetric,
    setVisible(show: boolean) {
      visible = show;
      layer.show = show;
      if (pipelineSource) pipelineSource.show = show && selectedMetric === "oilPipelines";
      selection.show = show && selectedIndex !== -1;
      viewer.scene.requestRender();
    },
    select(index: number, flyTo = false) {
      selectedIndex = index;
      selection.show = visible && index !== -1;
      if (index !== -1) {
        const b = cellBounds(grid.ids[index]);
        selection.rectangle!.coordinates = new ConstantProperty(Rectangle.fromDegrees(b.west, b.south, b.east, b.north));
        if (flyTo) viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(b.longitudeDeg, b.latitudeDeg, 180_000),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.2,
        });
      }
      viewer.scene.requestRender();
    },
    overview() {
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(-27, 17, 23_000_000),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.2 });
    },
    destroy() {
      clickHandler.destroy();
      viewer.entities.remove(selection);
      viewer.imageryLayers.remove(layer, true);
      if (pipelineSource) void viewer.dataSources.remove(pipelineSource, true);
    },
  };
}
