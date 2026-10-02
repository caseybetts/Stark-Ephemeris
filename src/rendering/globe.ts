import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  EllipsoidTerrainProvider,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  PolylineGlowMaterialProperty,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
} from "cesium";
import type { SatelliteDefinition, SurfaceObject, WorldSnapshot } from "../simulation/model";
import { rotateInertialToEarthFixed, satellitePositionInertial } from "../simulation/world";
import { earthFixedKilometersToCartesian, locationToCartesian } from "./coordinates";

export type GlobeView = {
  viewer: Viewer;
  update(snapshot: WorldSnapshot, satellite: SatelliteDefinition): void;
  setTrackVisible(visible: boolean): void;
  setSurfaceObjectsVisible(visible: boolean): void;
  destroy(): void;
};

function orbitPathPositions(satellite: SatelliteDefinition, elapsedSeconds: number): Cartesian3[] {
  const path: Cartesian3[] = [];
  const samples = 180;

  for (let index = 0; index <= samples; index += 1) {
    const phaseDegrees = satellite.orbit.initialPhaseDeg + (360 * index) / samples;
    const position = satellitePositionInertial(
      { ...satellite.orbit, initialPhaseDeg: phaseDegrees },
      0,
    );
    const earthFixed = rotateInertialToEarthFixed(position, elapsedSeconds);
    path.push(earthFixedKilometersToCartesian(earthFixed));
  }

  return path;
}

function addSurfaceObject(viewer: Viewer, object: SurfaceObject) {
  const isStation = object.kind === "ground-station";
  return viewer.entities.add({
    id: object.id,
    name: object.name,
    description: object.description,
    position: locationToCartesian(object.location),
    point: {
      pixelSize: isStation ? 9 : 7,
      color: isStation ? Color.fromCssColorString("#ffbd70") : Color.fromCssColorString("#73d7c1"),
      outlineColor: Color.fromCssColorString("#071016"),
      outlineWidth: 2,
      heightReference: HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: object.name.toUpperCase(),
      font: "600 10px Inter, sans-serif",
      fillColor: Color.fromCssColorString("#e7f1f2"),
      outlineColor: Color.fromCssColorString("#071016"),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
      pixelOffset: new Cartesian2(11, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

export async function createGlobeView(
  satellite: SatelliteDefinition,
  surfaceObjects: readonly SurfaceObject[],
): Promise<GlobeView> {
  const viewer = new Viewer("globe", {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    scene3DOnly: true,
    terrainProvider: new EllipsoidTerrainProvider(),
    shouldAnimate: false,
  });

  viewer.scene.globe.baseColor = Color.fromCssColorString("#102c39");
  viewer.scene.globe.enableLighting = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_000_000;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
  viewer.scene.globe.depthTestAgainstTerrain = false;

  try {
    const earthImagery = await TileMapServiceImageryProvider.fromUrl(CesiumBaseUrl("Assets/Textures/NaturalEarthII"));
    viewer.imageryLayers.addImageryProvider(earthImagery);
  } catch {
    viewer.scene.globe.baseColor = Color.fromCssColorString("#163640");
    console.warn("Natural Earth II imagery did not load; using the globe base color.");
  }

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-27, 17, 23_000_000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });

  const satelliteEntity = viewer.entities.add({
    id: satellite.id,
    name: satellite.name,
    position: new ConstantPositionProperty(
      earthFixedKilometersToCartesian(
        rotateInertialToEarthFixed(satellitePositionInertial(satellite.orbit, 0), 0),
      ),
    ),
    point: {
      pixelSize: 13,
      color: Color.fromCssColorString("#f4f870"),
      outlineColor: Color.fromCssColorString("#161c0b"),
      outlineWidth: 3,
      heightReference: HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: satellite.name.toUpperCase(),
      font: "700 11px Inter, sans-serif",
      fillColor: Color.fromCssColorString("#f4f870"),
      outlineColor: Color.fromCssColorString("#071016"),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -22),
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const orbitEntity = viewer.entities.add({
    id: `${satellite.id}-orbit`,
    name: `${satellite.name} orbit`,
    polyline: {
      positions: new ConstantProperty(orbitPathPositions(satellite, 0)),
      width: 2,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.12,
        color: Color.fromCssColorString("#e3e977").withAlpha(0.74),
      }),
      arcType: ArcType.NONE,
    },
  });

  const surfaceEntities = surfaceObjects.map((object) => ({
    object,
    entity: addSurfaceObject(viewer, object),
  }));

  return {
    viewer,
    update(snapshot, activeSatellite) {
      satelliteEntity.position = new ConstantPositionProperty(
        earthFixedKilometersToCartesian(snapshot.satelliteEarthFixedKm),
      );
      orbitEntity.polyline!.positions = new ConstantProperty(
        orbitPathPositions(activeSatellite, snapshot.elapsedSeconds),
      );

      for (const { object, entity } of surfaceEntities) {
        if (object.kind === "imaging-market") {
          const state = snapshot.surfaceObjects.find((item) => item.object.id === object.id);
          const color = state?.sunlit ? "#73d7c1" : "#547f78";
          entity.point!.color = new ConstantProperty(Color.fromCssColorString(color));
        }
      }

      viewer.scene.requestRender();
    },
    setTrackVisible(visible) {
      orbitEntity.show = visible;
      viewer.scene.requestRender();
    },
    setSurfaceObjectsVisible(visible) {
      for (const item of surfaceEntities) item.entity.show = visible;
      viewer.scene.requestRender();
    },
    destroy() {
      viewer.destroy();
    },
  };
}

function CesiumBaseUrl(assetPath: string): string {
  return new URL(`${import.meta.env.BASE_URL}cesium/${assetPath}`, window.location.href).toString();
}
