import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  EllipsoidTerrainProvider,
  GeoJsonDataSource,
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
import type { DataSource, ImageryLayer } from "cesium";
import type { SatelliteDefinition, SurfaceObject, WorldSnapshot } from "../simulation/model";
import { SIMULATED_DAY_SECONDS } from "../simulation/constants";
import {
  circularOrbitPeriodSeconds,
  rotateInertialToEarthFixed,
  satellitePositionInertial,
} from "../simulation/world";
import { earthFixedKilometersToCartesian, locationToCartesian } from "./coordinates";

export type GlobeView = {
  viewer: Viewer;
  update(snapshots: readonly WorldSnapshot[]): void;
  setSatellites(satellites: readonly SatelliteDefinition[]): void;
  setSelectedSatellite(satelliteId: string): void;
  setTrackVisible(visible: boolean): void;
  setBasemapVisible(visible: boolean): void;
  setSurfaceObjectsVisible(visible: boolean): void;
  destroy(): void;
};

function inertialKilometersToCartesian(positionKm: { x: number; y: number; z: number }): Cartesian3 {
  return new Cartesian3(positionKm.x * 1_000, positionKm.y * 1_000, positionKm.z * 1_000);
}

function orbitArcPositions(
  satellite: SatelliteDefinition,
  startPhaseDeg: number,
  endPhaseDeg: number,
): Cartesian3[] {
  const path: Cartesian3[] = [];
  const samples = 90;

  for (let index = 0; index <= samples; index += 1) {
    const phaseDegrees = startPhaseDeg + ((endPhaseDeg - startPhaseDeg) * index) / samples;
    const position = satellitePositionInertial(
      { ...satellite.orbit, ascendingNodeDeg: 0, inclinationDeg: 0, initialPhaseDeg: phaseDegrees },
      0,
    );
    path.push(inertialKilometersToCartesian(position));
  }

  return path;
}

function orbitEarthFixedMatrix(satellite: SatelliteDefinition, elapsedSeconds: number): Matrix4 {
  const radians = Math.PI / 180;
  const earthAngle = (2 * Math.PI * elapsedSeconds) / SIMULATED_DAY_SECONDS;
  const currentPhase = (satellite.orbit.initialPhaseDeg * radians)
    + (2 * Math.PI * elapsedSeconds) / circularOrbitPeriodSeconds(satellite.orbit.altitudeKm);
  const inclination = satellite.orbit.inclinationDeg * radians;
  const ascendingNode = satellite.orbit.ascendingNodeDeg * radians;
  const orbitalOrientation = Matrix3.multiply(
    Matrix3.fromRotationZ(ascendingNode),
    Matrix3.multiply(
      Matrix3.fromRotationX(inclination),
      Matrix3.fromRotationZ(currentPhase),
      new Matrix3(),
    ),
    new Matrix3(),
  );
  const earthFixedOrientation = Matrix3.multiply(
    Matrix3.fromRotationZ(-earthAngle),
    orbitalOrientation,
    new Matrix3(),
  );
  return Matrix4.fromRotationTranslation(
    earthFixedOrientation,
    Cartesian3.ZERO,
    new Matrix4(),
  );
}

function createOrbitPrimitive(
  satellite: SatelliteDefinition,
  startPhaseDeg: number,
  endPhaseDeg: number,
  color: Color,
): Primitive {
  return new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: new PolylineGeometry({
        positions: orbitArcPositions(satellite, startPhaseDeg, endPhaseDeg),
        width: 2,
        vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance: new PolylineMaterialAppearance({
      material: Material.fromType("PolylineGlow", {
        color,
        glowPower: 0.12,
      }),
      translucent: true,
    }),
    modelMatrix: Matrix4.IDENTITY,
    asynchronous: false,
  });
}

function createOrbitVisual(satellite: SatelliteDefinition, selected: boolean, color: Color) {
  const ahead = createOrbitPrimitive(
    satellite,
    0,
    180,
    color.withAlpha(selected ? 0.82 : 0.46),
  );
  const behind = createOrbitPrimitive(
    satellite,
    -180,
    0,
    color.withAlpha(selected ? 0.3 : 0.16),
  );
  const modelMatrix = orbitEarthFixedMatrix(satellite, 0);
  ahead.modelMatrix = modelMatrix;
  behind.modelMatrix = modelMatrix;
  return { ahead, behind };
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

  let basemapLayer: ImageryLayer | undefined;
  try {
    const earthImagery = await TileMapServiceImageryProvider.fromUrl(CesiumBaseUrl("Assets/Textures/NaturalEarthII"));
    basemapLayer = viewer.imageryLayers.addImageryProvider(earthImagery);
  } catch {
    viewer.scene.globe.baseColor = Color.fromCssColorString("#163640");
    console.warn("Natural Earth II imagery did not load; using the globe base color.");
  }

  let countryBoundaries: DataSource | undefined;
  try {
    const response = await fetch(new URL(`${import.meta.env.BASE_URL}data/cells/country-boundaries.geojson.gz`, window.location.href));
    if (!response.ok) throw new Error(`Country boundaries returned ${response.status}`);
    const compressed = await response.arrayBuffer();
    const decoded = new Uint8Array(compressed);
    const geoJsonText = decoded[0] === 0x1f && decoded[1] === 0x8b
      ? await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : new TextDecoder().decode(decoded);
    const boundaryData = await GeoJsonDataSource.load(JSON.parse(geoJsonText), {
      stroke: Color.fromCssColorString("#8fa3ad"),
      strokeWidth: 1.1,
      clampToGround: true,
    });
    boundaryData.show = false;
    countryBoundaries = await viewer.dataSources.add(boundaryData);
  } catch (error) {
    console.warn("Country boundary outlines did not load.", error);
  }

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-27, 17, 23_000_000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });

  const satelliteColors = ["#f4f870", "#72d7ff", "#ff9b76", "#c4a7ff", "#7ce2a4"];
  let satelliteDefinitions = [...satellites];
  let selectedSatelliteId = satelliteDefinitions[0]?.id;
  const createSatelliteVisual = (satellite: SatelliteDefinition, index: number) => {
    const color = Color.fromCssColorString(satelliteColors[index % satelliteColors.length]);
    const selectedInitially = satellite.id === selectedSatelliteId;
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
    const orbit = createOrbitVisual(satellite, selectedInitially, color);
    viewer.scene.primitives.add(orbit.ahead);
    viewer.scene.primitives.add(orbit.behind);
    return { entity, orbit };
  };
  const satelliteVisuals = new Map<string, ReturnType<typeof createSatelliteVisual>>(
    satelliteDefinitions.map((satellite, index) => [satellite.id, createSatelliteVisual(satellite, index)]),
  );
  const applySelectedSatellite = (satelliteId: string): void => {
    if (!satelliteVisuals.has(satelliteId)) return;
    selectedSatelliteId = satelliteId;
    satelliteDefinitions.forEach((satellite, index) => {
      const visual = satelliteVisuals.get(satellite.id);
      if (!visual) return;
      const selected = satellite.id === selectedSatelliteId;
      const color = Color.fromCssColorString(satelliteColors[index % satelliteColors.length]);
      visual.entity.point!.pixelSize = new ConstantProperty(selected ? 13 : 9);
      visual.entity.point!.outlineWidth = new ConstantProperty(selected ? 3 : 2);
      visual.entity.label!.show = new ConstantProperty(selected);
      visual.orbit.ahead.appearance!.material.uniforms.color = color.withAlpha(selected ? 0.82 : 0.46);
      visual.orbit.behind.appearance!.material.uniforms.color = color.withAlpha(selected ? 0.3 : 0.16);
    });
    viewer.scene.requestRender();
  };

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
        const satellite = satelliteDefinitions.find((item) => item.id === snapshot.satelliteId);
        if (!satellite) continue;
        const modelMatrix = orbitEarthFixedMatrix(satellite, snapshot.elapsedSeconds);
        visual.orbit.ahead.modelMatrix = modelMatrix;
        visual.orbit.behind.modelMatrix = modelMatrix;
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
    setSatellites(nextSatellites) {
      for (const visual of satelliteVisuals.values()) {
        viewer.entities.remove(visual.entity);
        viewer.scene.primitives.remove(visual.orbit.ahead);
        viewer.scene.primitives.remove(visual.orbit.behind);
      }
      satelliteVisuals.clear();
      satelliteDefinitions = [...nextSatellites];
      if (!satelliteDefinitions.some(satellite => satellite.id === selectedSatelliteId)) {
        selectedSatelliteId = satelliteDefinitions[0]?.id;
      }
      satelliteDefinitions.forEach((satellite, index) => {
        satelliteVisuals.set(satellite.id, createSatelliteVisual(satellite, index));
      });
      if (selectedSatelliteId) applySelectedSatellite(selectedSatelliteId);
      viewer.scene.requestRender();
    },
    setSelectedSatellite(satelliteId) {
      applySelectedSatellite(satelliteId);
    },
    setTrackVisible(visible) {
      for (const visual of satelliteVisuals.values()) {
        visual.orbit.ahead.show = visible;
        visual.orbit.behind.show = visible;
      }
      viewer.scene.requestRender();
    },
    setBasemapVisible(visible) {
      if (basemapLayer) basemapLayer.show = visible;
      viewer.scene.globe.baseColor = Color.fromCssColorString(visible ? "#102c39" : "#071016");
      if (countryBoundaries) countryBoundaries.show = !visible;
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
