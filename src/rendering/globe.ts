import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  EllipsoidTerrainProvider,
  GeometryInstance,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  Material,
  Matrix3,
  Matrix4,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
} from "cesium";
import { SIMULATED_DAY_SECONDS } from "../simulation/constants";
import type { SatelliteDefinition, SurfaceObject, WorldSnapshot } from "../simulation/model";
import { rotateInertialToEarthFixed, satellitePositionInertial } from "../simulation/world";
import { earthFixedKilometersToCartesian, locationToCartesian } from "./coordinates";

export type GlobeView = {
  viewer: Viewer;
  update(snapshots: readonly WorldSnapshot[]): void;
  setSelectedSatellite(satelliteId: string): void;
  setTrackVisible(visible: boolean): void;
  setSurfaceObjectsVisible(visible: boolean): void;
  destroy(): void;
};

function inertialKilometersToCartesian(positionKm: { x: number; y: number; z: number }): Cartesian3 {
  return new Cartesian3(positionKm.x * 1_000, positionKm.y * 1_000, positionKm.z * 1_000);
}

function orbitPathPositions(satellite: SatelliteDefinition): Cartesian3[] {
  const path: Cartesian3[] = [];
  const samples = 180;

  for (let index = 0; index <= samples; index += 1) {
    const phaseDegrees = satellite.orbit.initialPhaseDeg + (360 * index) / samples;
    const position = satellitePositionInertial(
      { ...satellite.orbit, initialPhaseDeg: phaseDegrees },
      0,
    );
    path.push(inertialKilometersToCartesian(position));
  }

  return path;
}

function orbitEarthFixedMatrix(elapsedSeconds: number): Matrix4 {
  const earthAngle = (2 * Math.PI * elapsedSeconds) / SIMULATED_DAY_SECONDS;
  return Matrix4.fromRotationTranslation(
    Matrix3.fromRotationZ(-earthAngle),
    Cartesian3.ZERO,
    new Matrix4(),
  );
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
    },
  });
}

export async function createGlobeView(
  satellites: readonly SatelliteDefinition[],
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
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 15_000;
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

  const satelliteColors = ["#f4f870", "#72d7ff", "#ff9b76", "#c4a7ff", "#7ce2a4"];
  const satelliteVisuals = new Map(satellites.map((satellite, index) => {
    const color = Color.fromCssColorString(satelliteColors[index % satelliteColors.length]);
    const selectedInitially = index === 0;
    const entity = viewer.entities.add({
      id: satellite.id,
      name: satellite.name,
      position: new ConstantPositionProperty(
        earthFixedKilometersToCartesian(
          rotateInertialToEarthFixed(satellitePositionInertial(satellite.orbit, 0), 0),
        ),
      ),
      point: {
        pixelSize: selectedInitially ? 13 : 9,
        color,
        outlineColor: Color.fromCssColorString("#071016"),
        outlineWidth: selectedInitially ? 3 : 2,
        heightReference: HeightReference.NONE,
      },
      label: {
        text: satellite.name.toUpperCase(),
        show: selectedInitially,
        font: "700 11px Inter, sans-serif",
        fillColor: color,
        outlineColor: Color.fromCssColorString("#071016"),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -22),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
      },
    });
    const orbit = viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new PolylineGeometry({
            positions: orbitPathPositions(satellite),
            width: 2,
            vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
          }),
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType("PolylineGlow", {
            color: color.withAlpha(selectedInitially ? 0.74 : 0.4),
            glowPower: 0.12,
          }),
          translucent: true,
        }),
        modelMatrix: orbitEarthFixedMatrix(0),
        asynchronous: false,
      }),
    );
    return [satellite.id, { entity, orbit }];
  }));
  let selectedSatelliteId = satellites[0]?.id;

  const surfaceEntities = surfaceObjects.map((object) => ({
    object,
    entity: addSurfaceObject(viewer, object),
  }));

  return {
    viewer,
    update(snapshots) {
      for (const snapshot of snapshots) {
        const visual = satelliteVisuals.get(snapshot.satelliteId);
        if (!visual) continue;
        visual.entity.position = new ConstantPositionProperty(
          earthFixedKilometersToCartesian(snapshot.satelliteEarthFixedKm),
        );
        visual.orbit.modelMatrix = orbitEarthFixedMatrix(snapshot.elapsedSeconds);
      }

      const surfaceSnapshot = snapshots[0];
      if (surfaceSnapshot) {
        for (const { object, entity } of surfaceEntities) {
          if (object.kind === "imaging-market") {
            const state = surfaceSnapshot.surfaceObjects.find((item) => item.object.id === object.id);
            const color = state?.sunlit ? "#73d7c1" : "#547f78";
            entity.point!.color = new ConstantProperty(Color.fromCssColorString(color));
          }
        }
      }

      viewer.scene.requestRender();
    },
    setSelectedSatellite(satelliteId) {
      if (!satelliteVisuals.has(satelliteId)) return;
      selectedSatelliteId = satelliteId;
      satellites.forEach((satellite, index) => {
        const visual = satelliteVisuals.get(satellite.id);
        if (!visual) return;
        const selected = satellite.id === selectedSatelliteId;
        const color = Color.fromCssColorString(satelliteColors[index % satelliteColors.length]);
        visual.entity.point!.pixelSize = new ConstantProperty(selected ? 13 : 9);
        visual.entity.point!.outlineWidth = new ConstantProperty(selected ? 3 : 2);
        visual.entity.label!.show = new ConstantProperty(selected);
        visual.orbit.appearance!.material.uniforms.color = color.withAlpha(selected ? 0.74 : 0.4);
      });
      viewer.scene.requestRender();
    },
    setTrackVisible(visible) {
      for (const visual of satelliteVisuals.values()) visual.orbit.show = visible;
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
