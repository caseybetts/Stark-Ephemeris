import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import { AVAILABLE_TIME_MULTIPLIERS, DEFAULT_TIME_MULTIPLIER, EFFECTIVE_CONTACT_RADIUS_KM, INITIAL_FLEET, SURFACE_OBJECTS } from "./simulation/constants";
import { createWorldSnapshot } from "./simulation/world";
import { createPrototypeCellMarket } from "./simulation/prototypeCellMarket";
import type { CellMarketState } from "./simulation/cellMarketState";
import type { SatelliteDefinition, SurfaceObject, WorldSnapshot } from "./simulation/model";

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

window.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;

const elements = {
  globe: document.querySelector<HTMLDivElement>("#globe")!,
  runState: document.querySelector<HTMLElement>("#run-state")!,
  simClock: document.querySelector<HTMLElement>("#sim-clock")!,
  pauseToggle: document.querySelector<HTMLButtonElement>("#pause-toggle")!,
  pauseLabel: document.querySelector<HTMLElement>("#pause-label")!,
  pauseIcon: document.querySelector<HTMLElement>("#pause-icon")!,
  trackToggle: document.querySelector<HTMLButtonElement>("#track-toggle")!,
  timeSpeed: document.querySelector<HTMLSelectElement>("#time-speed")!,
  satCoordinate: document.querySelector<HTMLElement>("#sat-coordinate")!,
  satAltitude: document.querySelector<HTMLElement>("#sat-altitude")!,
  satelliteName: document.querySelector<HTMLElement>("#satellite-name")!,
  satelliteIdentifier: document.querySelector<HTMLElement>("#satellite-identifier")!,
  satSunState: document.querySelector<HTMLElement>("#sat-sun-state")!,
  satContactState: document.querySelector<HTMLElement>("#sat-contact-state")!,
  surfaceSunlit: document.querySelector<HTMLElement>("#surface-sunlit")!,
  eclipseState: document.querySelector<HTMLElement>("#eclipse-state")!,
  subsolarLongitude: document.querySelector<HTMLElement>("#subsolar-longitude")!,
  stationCount: document.querySelector<HTMLElement>("#station-count")!,
  stationList: document.querySelector<HTMLElement>("#station-list")!,
  stationTableCount: document.querySelector<HTMLElement>("#station-table-count")!,
  stationTableBody: document.querySelector<HTMLTableSectionElement>("#station-table-body")!,
  spacecraftCount: document.querySelector<HTMLElement>("#spacecraft-count")!,
  spacecraftTableBody: document.querySelector<HTMLTableSectionElement>("#spacecraft-table-body")!,
  spacecraftDetailTitle: document.querySelector<HTMLElement>("#spacecraft-detail-title")!,
  spacecraftDetailState: document.querySelector<HTMLElement>("#spacecraft-detail-state")!,
  spacecraftDetailAltitude: document.querySelector<HTMLElement>("#spacecraft-detail-altitude")!,
  spacecraftDetailInclination: document.querySelector<HTMLElement>("#spacecraft-detail-inclination")!,
  spacecraftDetailCoordinate: document.querySelector<HTMLElement>("#spacecraft-detail-coordinate")!,
  spacecraftDetailStation: document.querySelector<HTMLElement>("#spacecraft-detail-station")!,
  contactRadius: document.querySelector<HTMLElement>("#contact-radius")!,
  locationCount: document.querySelector<HTMLElement>("#location-count")!,
  locationList: document.querySelector<HTMLElement>("#location-list")!,
};

const fleet: readonly SatelliteDefinition[] = INITIAL_FLEET.satellites;
const surfaceObjects = SURFACE_OBJECTS as readonly SurfaceObject[];
let selectedSatelliteId = fleet[0]!.id;
const simulation = {
  elapsedSeconds: 0,
  timeMultiplier: DEFAULT_TIME_MULTIPLIER,
  running: true,
  showTrack: true,
  lastFrameMilliseconds: performance.now(),
};

type SpacecraftTableRow = {
  row: HTMLTableRowElement;
  selectButton: HTMLButtonElement;
  coordinate: HTMLElement;
  altitude: HTMLElement;
  lighting: HTMLElement;
  stationAccess: HTMLElement;
};

const spacecraftTableRows = new Map<string, SpacecraftTableRow>();

const formatCoordinate = (latitude: number, longitude: number): string => {
  const latDirection = latitude >= 0 ? "N" : "S";
  const lonDirection = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(2)}° ${latDirection}  /  ${Math.abs(longitude).toFixed(2)}° ${lonDirection}`;
};

const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (totalSeconds % 60).toString().padStart(2, "0");
  return `T+${hours}:${minutes}:${remainder}`;
};

const formatDistance = (distanceKm: number): string => `${Math.round(distanceKm).toLocaleString()} km`;

function renderStations(snapshot: ReturnType<typeof createWorldSnapshot>): void {
  const stations = snapshot.stationContacts;
  const activeCount = stations.filter((contact) => contact.available).length;
  elements.stationCount.textContent = `${activeCount} / ${stations.length} IN RANGE`;
  elements.stationList.replaceChildren(
    ...stations.map((contact) => {
      const row = document.createElement("div");
      row.className = "station-row";
      const marker = document.createElement("span");
      marker.className = `row-marker ${contact.available ? "row-marker-active" : ""}`;
      const copy = document.createElement("span");
      copy.className = "row-copy";
      const name = document.createElement("strong");
      name.textContent = contact.station.name;
      const detail = document.createElement("small");
      detail.textContent = contact.station.description;
      copy.append(name, detail);
      const state = document.createElement("span");
      state.className = `row-state ${contact.available ? "row-state-active" : ""}`;
      state.textContent = contact.available ? "IN RANGE" : formatDistance(contact.distanceKm);
      row.append(marker, copy, state);
      return row;
    }),
  );
  renderNearestStationContact(stations);
}

function renderGroundStationTable(): void {
  const groundStations = surfaceObjects.filter((object) => object.kind === "ground-station");
  const operationalCount = groundStations.filter(
    (station) => station.groundStationDetails?.operationalStatus === "available",
  ).length;
  elements.stationTableCount.textContent = `${operationalCount} / ${groundStations.length} OPERATIONAL`;
  elements.stationTableBody.replaceChildren(
    ...groundStations.map((station) => {
      const row = document.createElement("tr");
      const stationCell = document.createElement("th");
      stationCell.scope = "row";
      stationCell.textContent = station.name;

      const locationCell = document.createElement("td");
      const locationName = document.createElement("strong");
      locationName.className = "table-location-name";
      locationName.textContent = station.description.replace(/^Ground station · /, "");
      const coordinates = document.createElement("small");
      coordinates.className = "table-coordinate";
      coordinates.textContent = formatCoordinate(
        station.location.latitudeDeg,
        station.location.longitudeDeg,
      );
      locationCell.append(locationName, coordinates);

      const contactCell = document.createElement("td");
      const state = document.createElement("span");
      const isOperational = station.groundStationDetails?.operationalStatus === "available";
      state.className = `table-status ${isOperational ? "table-status-active" : ""}`;
      state.textContent = station.groundStationDetails
        ? isOperational ? "AVAILABLE" : "DOWN"
        : "UNCONFIGURED";
      contactCell.append(state);

      const uplinkCell = document.createElement("td");
      uplinkCell.className = "table-rate";
      uplinkCell.textContent = station.groundStationDetails
        ? station.groundStationDetails.uplinkRateMbps.toLocaleString()
        : "UNCONFIGURED";

      const downlinkCell = document.createElement("td");
      downlinkCell.className = "table-rate";
      downlinkCell.textContent = station.groundStationDetails
        ? station.groundStationDetails.downlinkRateMbps.toLocaleString()
        : "UNCONFIGURED";

      row.append(stationCell, locationCell, contactCell, uplinkCell, downlinkCell);
      return row;
    }),
  );
}

function buildSpacecraftTable(onSelect: (satelliteId: string) => void): void {
  elements.spacecraftCount.textContent = `${fleet.length} SPACECRAFT`;
  spacecraftTableRows.clear();
  elements.spacecraftTableBody.replaceChildren(
    ...fleet.map((satellite) => {
      const row = document.createElement("tr");
      const identityCell = document.createElement("th");
      identityCell.scope = "row";
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "spacecraft-select";
      selectButton.textContent = satellite.name;
      selectButton.setAttribute("aria-label", `Select ${satellite.name}`);
      selectButton.addEventListener("click", () => onSelect(satellite.id));
      identityCell.append(selectButton);

      const coordinate = document.createElement("td");
      const altitude = document.createElement("td");
      altitude.className = "table-rate";
      const lighting = document.createElement("td");
      const stationAccess = document.createElement("td");
      row.append(identityCell, coordinate, altitude, lighting, stationAccess);
      spacecraftTableRows.set(satellite.id, {
        row,
        selectButton,
        coordinate,
        altitude,
        lighting,
        stationAccess,
      });
      return row;
    }),
  );
}

function renderSpacecraftTable(snapshots: readonly WorldSnapshot[]): void {
  for (const snapshot of snapshots) {
    const row = spacecraftTableRows.get(snapshot.satelliteId);
    if (!row) continue;
    const satellite = fleet.find(({ id }) => id === snapshot.satelliteId);
    if (!satellite) continue;

    row.row.classList.toggle("spacecraft-row-selected", satellite.id === selectedSatelliteId);
    row.selectButton.setAttribute("aria-pressed", String(satellite.id === selectedSatelliteId));
    row.coordinate.textContent = formatCoordinate(
      snapshot.subSatellitePoint.latitudeDeg,
      snapshot.subSatellitePoint.longitudeDeg,
    );
    row.altitude.textContent = `${Math.round(satellite.orbit.altitudeKm).toLocaleString()} km`;
    row.lighting.textContent = snapshot.satelliteEclipsed ? "EARTH ECLIPSE" : "SUNLIT";
    const accessibleStation = snapshot.stationContacts.find((contact) => contact.available);
    row.stationAccess.textContent = accessibleStation
      ? `IN RANGE · ${accessibleStation.station.name}`
      : "NO CONTACT";
  }
}

function renderSelectedSpacecraft(satellite: SatelliteDefinition, snapshot: WorldSnapshot): void {
  elements.satelliteName.textContent = satellite.name;
  elements.satelliteIdentifier.textContent = `SPACECRAFT · ${satellite.id.toUpperCase()}`;
  elements.spacecraftDetailTitle.textContent = satellite.name;
  elements.spacecraftDetailState.textContent = snapshot.satelliteEclipsed ? "EARTH ECLIPSE" : "SUNLIT";
  elements.spacecraftDetailState.classList.toggle("table-status-active", !snapshot.satelliteEclipsed);
  elements.spacecraftDetailAltitude.textContent = `${Math.round(satellite.orbit.altitudeKm).toLocaleString()} km`;
  elements.spacecraftDetailInclination.textContent = `${satellite.orbit.inclinationDeg.toFixed(1)}°`;
  elements.spacecraftDetailCoordinate.textContent = formatCoordinate(
    snapshot.subSatellitePoint.latitudeDeg,
    snapshot.subSatellitePoint.longitudeDeg,
  );
  const nearestStation = [...snapshot.stationContacts].sort((left, right) => left.distanceKm - right.distanceKm)[0];
  elements.spacecraftDetailStation.textContent = nearestStation
    ? `${nearestStation.station.name} · ${formatDistance(nearestStation.distanceKm)}${nearestStation.available ? " · IN RANGE" : ""}`
    : "NONE CONFIGURED";
}

function renderNearestStationContact(stations: ReturnType<typeof createWorldSnapshot>["stationContacts"]): void {
  const nearestContact = [...stations].sort((left, right) => left.distanceKm - right.distanceKm)[0];
  if (nearestContact) {
    elements.satContactState.textContent = nearestContact.available
      ? `IN RANGE · ${nearestContact.station.name.toUpperCase()}`
      : `NO LINK · ${formatDistance(nearestContact.distanceKm)} TO ${nearestContact.station.name.toUpperCase()}`;
    elements.satContactState.classList.toggle("state-warning", !nearestContact.available);
  } else {
    elements.satContactState.textContent = "NO STATIONS CONFIGURED";
  }
}

function renderLocations(snapshot: ReturnType<typeof createWorldSnapshot>): void {
  const markets = snapshot.surfaceObjects.filter(({ object }) => object.kind === "imaging-market");
  const sunlitCount = markets.filter(({ sunlit }) => sunlit).length;
  elements.locationCount.textContent = `${sunlitCount} / ${markets.length} IN SUN`;
  elements.locationList.replaceChildren(
    ...markets.map(({ object, sunlit }) => {
      const row = document.createElement("div");
      row.className = "location-row";
      const marker = document.createElement("span");
      marker.className = `row-marker ${sunlit ? "row-marker-sunlit" : "row-marker-night"}`;
      const name = document.createElement("strong");
      name.textContent = object.name;
      const state = document.createElement("span");
      state.className = `location-state ${sunlit ? "location-state-sunlit" : ""}`;
      state.textContent = sunlit ? "DAYLIGHT" : "NIGHT";
      row.append(marker, name, state);
      return row;
    }),
  );
}

function renderSnapshot(snapshot: WorldSnapshot, currentSatellite: SatelliteDefinition): void {
  const lat = snapshot.subSatellitePoint.latitudeDeg;
  const lon = snapshot.subSatellitePoint.longitudeDeg;

  elements.simClock.textContent = formatDuration(snapshot.elapsedSeconds);
  elements.satCoordinate.textContent = formatCoordinate(lat, lon);
  elements.satAltitude.textContent = `${Math.round(currentSatellite.orbit.altitudeKm)} km`;

  const illuminated = !snapshot.satelliteEclipsed;
  elements.satSunState.textContent = illuminated ? "SOLAR ARRAY LIT" : "EARTH ECLIPSE";
  elements.satSunState.classList.toggle("state-warning", !illuminated);
  elements.eclipseState.textContent = snapshot.satelliteEclipsed ? "IN UMBRA" : "SUNLIT";
  elements.eclipseState.classList.toggle("warning-text", snapshot.satelliteEclipsed);

  const daylightLocations = snapshot.surfaceObjects.filter(({ sunlit }) => sunlit).length;
  elements.surfaceSunlit.textContent = `${daylightLocations} / ${snapshot.surfaceObjects.length} LOCATIONS`;
  const subsolarLongitude = (Math.atan2(snapshot.sunDirectionEarthFixed.y, snapshot.sunDirectionEarthFixed.x) * 180) / Math.PI;
  elements.subsolarLongitude.textContent = `${subsolarLongitude.toFixed(1)}°`;

  renderStations(snapshot);
  renderLocations(snapshot);
}

function setupManagementTabs(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[role='tab']")];
  const panels = [...document.querySelectorAll<HTMLElement>("[role='tabpanel']")];
  const activeViewTitle = document.querySelector<HTMLElement>("#active-view-title");

  const selectTab = (selectedTab: HTMLButtonElement, moveFocus = false) => {
    tabs.forEach((tab) => {
      const selected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !selected;
    });
    if (activeViewTitle) activeViewTitle.textContent = selectedTab.textContent?.trim() ?? "Summary";
    if (moveFocus) selectedTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event: KeyboardEvent) => {
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        selectTab(tabs[nextIndex], true);
      }
    });
  });

  const initiallySelected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
  if (initiallySelected) selectTab(initiallySelected);
  panels.forEach((panel) => {
    const selectedTab = tabs.find((tab) => tab.getAttribute("aria-controls") === panel.id);
    panel.hidden = !selectedTab || selectedTab !== initiallySelected;
  });
}

async function start(): Promise<void> {
  setupManagementTabs();
  renderGroundStationTable();
  elements.contactRadius.textContent = EFFECTIVE_CONTACT_RADIUS_KM.toLocaleString();
  elements.stationList.innerHTML = '<div class="loading-row">CALCULATING ACCESS WINDOWS…</div>';

  const { createGlobeView } = await import("./rendering/globe");
  const globe = await createGlobeView(fleet, surfaceObjects);
  buildSpacecraftTable((satelliteId) => {
    selectedSatelliteId = satelliteId;
    globe.setSelectedSatellite(satelliteId);
  });
  globe.setSelectedSatellite(selectedSatelliteId);
  globe.setTrackVisible(simulation.showTrack);

  // Geography loads independently so a data failure does not stop the world clock.
  let cellMarket: CellMarketState | null = null;
  let refreshCellMarket: (() => void) | null = null;
  const setSimulationRunning = (running: boolean) => {
    simulation.running = running;
    elements.pauseToggle.setAttribute("aria-pressed", String(!running));
    elements.pauseLabel.textContent = running ? "PAUSE" : "RESUME";
    elements.pauseIcon.textContent = running ? "Ⅱ" : "▶";
    elements.runState.textContent = running ? "SIMULATION RUNNING" : "SIMULATION PAUSED";
    document.querySelector(".live-dot")?.classList.toggle("paused-dot", !running);
  };
  const advanceSimulationBySeconds = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("Preview time advance must be positive");
    setSimulationRunning(false);
    simulation.elapsedSeconds += seconds;
    simulation.lastFrameMilliseconds = performance.now();
    refreshCellMarket?.();
  };
  const resetPreview = () => {
    setSimulationRunning(false);
    simulation.elapsedSeconds = 0;
    simulation.lastFrameMilliseconds = performance.now();
    cellMarket?.resetPreview();
    refreshCellMarket?.();
  };
  void import("./ui/cellMarket").then(({ setupCellMarket }) => setupCellMarket(
    globe.viewer,
    {
      nowSeconds: () => simulation.elapsedSeconds,
      getOrCreateMarket: grid => cellMarket ??= createPrototypeCellMarket(grid),
      getSatelliteId: () => selectedSatelliteId,
      pauseSimulation: () => setSimulationRunning(false),
      advanceSimulationBySeconds,
      resetPreview,
    },
    refresh => { refreshCellMarket = refresh; },
  ));

  const updateFleetViews = (snapshots: readonly WorldSnapshot[]) => {
    globe.update(snapshots);
    renderSpacecraftTable(snapshots);
    const selectedSnapshot = snapshots.find(({ satelliteId }) => satelliteId === selectedSatelliteId);
    const selectedSatellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!selectedSnapshot || !selectedSatellite) return;
    renderSnapshot(selectedSnapshot, selectedSatellite);
    renderSelectedSpacecraft(selectedSatellite, selectedSnapshot);
  };

  elements.trackToggle.addEventListener("click", () => {
    simulation.showTrack = !simulation.showTrack;
    elements.trackToggle.setAttribute("aria-pressed", String(simulation.showTrack));
    globe.setTrackVisible(simulation.showTrack);
  });

  elements.pauseToggle.addEventListener("click", () => setSimulationRunning(!simulation.running));

  elements.timeSpeed.value = String(simulation.timeMultiplier);
  elements.timeSpeed.addEventListener("change", () => {
    const nextMultiplier = Number(elements.timeSpeed.value);
    if (AVAILABLE_TIME_MULTIPLIERS.includes(nextMultiplier as (typeof AVAILABLE_TIME_MULTIPLIERS)[number])) {
      simulation.timeMultiplier = nextMultiplier;
    }
  });

  let previousUiUpdate = 0;
  const animate = (frameMilliseconds: number) => {
    const elapsedRealSeconds = Math.min((frameMilliseconds - simulation.lastFrameMilliseconds) / 1_000, 0.25);
    simulation.lastFrameMilliseconds = frameMilliseconds;
    if (simulation.running) simulation.elapsedSeconds += elapsedRealSeconds * simulation.timeMultiplier;

    if (frameMilliseconds - previousUiUpdate > 120) {
      const snapshots = fleet.map((satellite) =>
        createWorldSnapshot(satellite, surfaceObjects, simulation.elapsedSeconds),
      );
      updateFleetViews(snapshots);
      refreshCellMarket?.();
      previousUiUpdate = frameMilliseconds;
    }

    requestAnimationFrame(animate);
  };

  const firstSnapshots = fleet.map((satellite) =>
    createWorldSnapshot(satellite, surfaceObjects, simulation.elapsedSeconds),
  );
  updateFleetViews(firstSnapshots);
  requestAnimationFrame(animate);
}

start().catch((error: unknown) => {
  console.error(error);
  elements.globe.innerHTML = '<div class="globe-error"><strong>Globe initialization failed</strong><span>Check your network connection, then reload. The prototype loads CesiumJS assets and Earth imagery at startup.</span></div>';
  elements.runState.textContent = "WORLD MODEL OFFLINE";
  elements.runState.classList.add("error-state");
});
