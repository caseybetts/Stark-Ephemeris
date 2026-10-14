import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import { AVAILABLE_TIME_MULTIPLIERS, DEFAULT_TIME_MULTIPLIER, EFFECTIVE_CONTACT_RADIUS_KM, INITIAL_FLEET, SURFACE_OBJECTS } from "./simulation/constants";
import { createWorldSnapshot } from "./simulation/world";
import { SimulationRuntime } from "./simulation/runtime";
import { predictGroundContactWindows, type GroundContactWindow } from "./simulation/contacts";
import { GroundOperations } from "./simulation/groundOperations";
import { createPrototypeCellMarket } from "./simulation/prototypeCellMarket";
import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt, type CellCaptureScenario } from "./simulation/cellCapture";
import { generateGreedyCellSchedule } from "./simulation/cellScheduler";
import type { CellMarketState } from "./simulation/cellMarketState";
import { OperationalLoop } from "./simulation/operationalLoop";
import type { GeographicLocation, SatelliteDefinition, SurfaceObject, WorldSnapshot } from "./simulation/model";

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
  nextContact: document.querySelector<HTMLElement>("#next-contact")!,
  groundPlanStatus: document.querySelector<HTMLElement>("#ground-plan-status")!,
  telStatus: document.querySelector<HTMLElement>("#tel-status")!,
  telEvent: document.querySelector<HTMLElement>("#tel-event")!,
  prepareTel: document.querySelector<HTMLButtonElement>("#prepare-tel")!,
  generateGreedyTel: document.querySelector<HTMLButtonElement>("#generate-greedy-tel")!,
  spacecraftPlanStatus: document.querySelector<HTMLElement>("#spacecraft-plan-status")!,
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
const CONTACT_FORECAST_HORIZON_SECONDS = 24 * 60 * 60;
const CONTACT_FORECAST_SAMPLE_SECONDS = 120;
// Proposed demonstration values only; capture geometry and timing remain open gameplay choices.
const PROPOSED_CELL_CAPTURE_SCENARIO: CellCaptureScenario = {
  maximumOffNadirAngleDeg: 25,
  collectionDurationSeconds: 45,
  requireSunlitTarget: false,
};
// Prototype-only capacity placeholder: 100 MiB per configured spacecraft.
// Image size and capacity remain open gameplay tuning values.
const PROTOTYPE_STORAGE_CAPACITY_BYTES = 100 * 1024 * 1024;
let selectedSatelliteId = fleet[0]!.id;
const simulationRuntime = new SimulationRuntime(fleet.map(({ id }) => id));
const groundOperations = new GroundOperations(fleet.map(({ id }) => id), simulationRuntime);
const contactForecasts = new Map<string, { computedAt: number; window?: GroundContactWindow }>();
const simulation = {
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

function renderStations(
  snapshot: ReturnType<typeof createWorldSnapshot>,
  nextWindow: GroundContactWindow | undefined,
  groundOperations: GroundOperations,
  runtime: SimulationRuntime,
): void {
  const stations = snapshot.stationContacts;
  const activeCount = stations.filter((contact) => contact.available).length;
  elements.stationCount.textContent = `${activeCount} / ${stations.length} IN CONTACT`;
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
      state.textContent = contact.available
        ? "IN CONTACT"
        : contact.geometricInRange && !contact.stationOperational
          ? "STATION DOWN"
          : formatDistance(contact.distanceKm);
      row.append(marker, copy, state);
      return row;
    }),
  );
  renderNearestStationContact(stations, nextWindow, snapshot.elapsedSeconds);
  renderGroundControl(
    snapshot.satelliteId,
    snapshot.elapsedSeconds,
    nextWindow,
    groundOperations,
    runtime,
  );
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

function renderNearestStationContact(
  stations: ReturnType<typeof createWorldSnapshot>["stationContacts"],
  nextWindow: GroundContactWindow | undefined,
  nowSeconds: number,
): void {
  const activeContact = stations.find((contact) => contact.available);
  const nearestContact = [...stations].sort((left, right) => left.distanceKm - right.distanceKm)[0];
  if (activeContact) {
    elements.satContactState.textContent = `IN CONTACT · ${activeContact.station.name.toUpperCase()}`;
    elements.satContactState.classList.remove("state-warning");
  } else if (nearestContact?.geometricInRange && !nearestContact.stationOperational) {
    elements.satContactState.textContent = `STATION DOWN · ${nearestContact.station.name.toUpperCase()}`;
    elements.satContactState.classList.add("state-warning");
  } else if (nextWindow) {
    elements.satContactState.textContent = `NEXT · ${nextWindow.stationName.toUpperCase()} IN ${formatDuration(nextWindow.startsAtSeconds - nowSeconds)}`;
    elements.satContactState.classList.remove("state-warning");
  } else if (nearestContact) {
    elements.satContactState.textContent = `NO LINK · ${formatDistance(nearestContact.distanceKm)} TO ${nearestContact.station.name.toUpperCase()}`;
    elements.satContactState.classList.add("state-warning");
  } else {
    elements.satContactState.textContent = "NO STATIONS CONFIGURED";
    elements.satContactState.classList.add("state-warning");
  }
}

function renderGroundControl(
  satelliteId: string,
  nowSeconds: number,
  nextWindow: GroundContactWindow | undefined,
  groundOperations: GroundOperations,
  runtime: SimulationRuntime,
): void {
  const state = groundOperations.getSatelliteState(satelliteId);
  const activeRuntimeAction = runtime.getSatelliteState(satelliteId).currentAction;
  const activeStation = state.activeStationIds
    .map((stationId) => surfaceObjects.find((station) => station.id === stationId)?.name)
    .find((name): name is string => Boolean(name));
  elements.nextContact.textContent = activeStation
    ? `CONTACT OPEN · ${activeStation.toUpperCase()}`
    : nextWindow
      ? `NEXT CONTACT · ${nextWindow.stationName.toUpperCase()} IN ${formatDuration(nextWindow.startsAtSeconds - nowSeconds)}`
      : "NO AVAILABLE CONTACT PREDICTED IN 24H";
  elements.groundPlanStatus.textContent = state.groundPlanVersion > 0
    ? `GROUND PLAN V${state.groundPlanVersion} · ${state.groundPlan.length} COMMANDS`
    : "GROUND PLAN · NONE";
  if (state.mode === "standby") {
    elements.telStatus.textContent = state.standbyCause === "tel-exhausted"
      ? `STANDBY · TEL V${state.onboardTelVersion} EXHAUSTED`
      : "STANDBY · NO TEL UPLOADED";
  } else {
    const nextCommand = state.onboardCommands[state.nextCommandIndex];
    const coverage = state.onboardCoverageEndsAtSeconds === null
      ? "COVERAGE UNKNOWN"
      : `COVERS TO ${formatDuration(state.onboardCoverageEndsAtSeconds)}`;
    const running = activeRuntimeAction?.kind === "tel-command" ? " · COMMAND RUNNING" : "";
    elements.telStatus.textContent =
      `ONBOARD TEL V${state.onboardTelVersion} · ${state.nextCommandIndex + 1}/${state.onboardCommands.length} · ${nextCommand?.label ?? "READY"} · ${coverage}${running}`;
  }
  const latestEvent = [...groundOperations.events].reverse().find((event) => event.satelliteId === satelliteId);
  elements.telEvent.textContent = latestEvent?.detail ?? "No ground-control events yet.";
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

function renderSnapshot(
  snapshot: WorldSnapshot,
  currentSatellite: SatelliteDefinition,
  nextWindow: GroundContactWindow | undefined,
): void {
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

  renderStations(snapshot, nextWindow, groundOperations, simulationRuntime);
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
  let cellGrid: import("./simulation/cells").CellGrid | null = null;
  const operationalLoop = new OperationalLoop({
    fleet,
    stations: surfaceObjects,
    scenario: PROPOSED_CELL_CAPTURE_SCENARIO,
    getMarket: () => cellMarket,
    storageCapacityBytesBySatellite: Object.fromEntries(fleet.map(({ id }) => [id, PROTOTYPE_STORAGE_CAPACITY_BYTES])),
    runtime: simulationRuntime,
    groundOperations,
  });
  let refreshCellMarket: (() => void) | null = null;
  let captureSequence = 0;
  type DraftCapture = { id: string; cellIndex: number; target: GeographicLocation };
  const captureDrafts = new Map<string, DraftCapture[]>();
  const clearCaptureDraftFor = (satelliteId: string) => {
    captureDrafts.delete(satelliteId);
  };
  const queueCaptureDraft = (cellIndex: number, target: GeographicLocation): string => {
    const satellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!satellite) return "No spacecraft is selected.";
    const now = simulationRuntime.elapsedSeconds;
    const contacts = predictGroundContactWindows(
      satellite,
      surfaceObjects,
      now,
      now + 48 * 60 * 60,
      { sampleStepSeconds: CONTACT_FORECAST_SAMPLE_SECONDS, maximumWindowsPerStation: 4 },
    );
    const nextContact = contacts[0];
    if (!nextContact) return "No available ground-station contact is predicted in the next 48 hours.";

    const draft = [...(captureDrafts.get(satellite.id) ?? []), {
      id: `cell-capture-${captureSequence++}`,
      cellIndex,
      target: { ...target },
    }];
    let cursorSeconds = nextContact.startsAtSeconds;
    let previousPointing = nadirPointingAt(satellite, cursorSeconds);
    const commands = draft.map((item) => {
      const feasibility = evaluateCellCaptureOpportunity({
        satellite,
        target: item.target,
        previousPointing,
        startsAtSeconds: cursorSeconds,
        scenario: PROPOSED_CELL_CAPTURE_SCENARIO,
      });
      const durationSeconds = Math.max(1, feasibility.completesAtSeconds - cursorSeconds);
      const command = {
        id: item.id,
        label: `Capture cell ${item.cellIndex}`,
        durationSeconds,
        cellCapture: { cellIndex: item.cellIndex, target: { ...item.target } },
      };
      cursorSeconds += durationSeconds;
      previousPointing = cellLookDirectionAt(satellite, item.target, cursorSeconds);
      return command;
    });
    const version = operationalLoop.reviseGroundPlan(satellite.id, commands, now);
    clearCaptureDraftFor(satellite.id);
    captureDrafts.set(satellite.id, draft);
    return `Ground plan V${version}: ${draft.length} capture command(s), predicted to upload at ${nextContact.stationName}. Proposed preview: ≤25° off-nadir, 45 seconds per collection, sunlight ignored; these are not approved gameplay rules.`;
  };
  const clearCaptureDraft = (): string => {
    const satellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!satellite) return "No spacecraft is selected.";
    clearCaptureDraftFor(satellite.id);
    const version = operationalLoop.reviseGroundPlan(satellite.id, [], simulationRuntime.elapsedSeconds);
    return `Capture draft cleared. Empty ground plan V${version} will replace the onboard TEL at the next available contact.`;
  };
  const generateGreedyTel = (grid: import("./simulation/cells").CellGrid): string => {
    const satellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!satellite || !cellMarket) return "The spacecraft or cell market is not ready.";
    const now = simulationRuntime.elapsedSeconds;
    const windows = predictGroundContactWindows(
      satellite,
      surfaceObjects,
      now,
      now + 48 * 60 * 60,
      { sampleStepSeconds: CONTACT_FORECAST_SAMPLE_SECONDS, maximumWindowsPerStation: 4 },
    );
    const distinctWindows: GroundContactWindow[] = [];
    for (const window of windows) {
      const previous = distinctWindows.at(-1);
      if (!previous || window.startsAtSeconds >= previous.endsAtSeconds) distinctWindows.push(window);
      if (distinctWindows.length === 2) break;
    }
    if (distinctWindows.length < 2) return "Could not generate a TEL: two separate available contacts were not found within 48 hours.";
    const uploadContact = distinctWindows[0]!;
    const nextContact = distinctWindows[1]!;
    const schedule = generateGreedyCellSchedule({
      satellite,
      grid,
      market: cellMarket,
      startsAtSeconds: uploadContact.startsAtSeconds,
      endsAtSeconds: nextContact.startsAtSeconds,
      scenario: PROPOSED_CELL_CAPTURE_SCENARIO,
      initialPointing: operationalLoop.getLastCommandedPointing(satellite.id)
        ?? nadirPointingAt(satellite, uploadContact.startsAtSeconds),
    });
    clearCaptureDraftFor(satellite.id);
    const groundPlanVersion = operationalLoop.reviseGroundPlan(satellite.id, schedule.commands, now);
    captureDrafts.delete(satellite.id);
    const first = schedule.decisions[0];
    const choiceSummary = first
      ? ` First choice: C${first.cellId.toString().padStart(7, "0")} at ${first.availablePriorityPoints.toFixed(2)} priority points${first.alternatives[0] ? `; next alternative C${first.alternatives[0].cellId.toString().padStart(7, "0")} scored ${first.alternatives[0].availablePriorityPoints.toFixed(2)}` : ""}.`
      : " No positive-priority feasible capture was found; the plan contains explicit idle segments.";
    return `Generated ground plan V${groundPlanVersion}: ${schedule.decisions.length} capture(s) across ${schedule.optimizationSegments} two-minute optimization segment(s), from ${uploadContact.stationName} to ${nextContact.stationName}. Total projected available priority: ${schedule.projectedPriorityPoints.toFixed(2)}. Idle commands explain gaps.${choiceSummary} Tie-breaks are priority, earliest start, then cell ID; these scheduler details are proposed. Plan uploads only at contact.`;
  };
  const advanceGroundOperations = (seconds: number) => operationalLoop.advanceBy(seconds);
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
    advanceGroundOperations(seconds);
    simulation.lastFrameMilliseconds = performance.now();
    refreshCellMarket?.();
  };
  const resetPreview = () => {
    setSimulationRunning(false);
    operationalLoop.reset();
    captureDrafts.clear();
    captureSequence = 0;
    contactForecasts.clear();
    simulation.lastFrameMilliseconds = performance.now();
    refreshCellMarket?.();
  };
  void import("./ui/cellMarket").then(({ setupCellMarket }) => setupCellMarket(
    globe.viewer,
    {
      nowSeconds: () => simulationRuntime.elapsedSeconds,
      getOrCreateMarket: grid => {
        cellGrid = grid;
        return cellMarket ??= createPrototypeCellMarket(grid);
      },
      getSatelliteId: () => selectedSatelliteId,
      hasGroundContact: () => {
        const satellite = fleet.find(({ id }) => id === selectedSatelliteId);
        return satellite !== undefined
          && createWorldSnapshot(satellite, surfaceObjects, simulationRuntime.elapsedSeconds)
            .stationContacts.some(contact => contact.available);
      },
      pauseSimulation: () => setSimulationRunning(false),
      advanceSimulationBySeconds,
      resetPreview,
      addCellCaptureToTel: queueCaptureDraft,
      clearCellCaptureDraft: clearCaptureDraft,
      enforceStorageCapacity: (satelliteId, timeSeconds) =>
        operationalLoop.enforceStorageCapacity(satelliteId, timeSeconds),
    },
    refresh => { refreshCellMarket = refresh; },
  ));

  const updateFleetViews = (snapshots: readonly WorldSnapshot[]) => {
    globe.update(snapshots);
    renderSpacecraftTable(snapshots);
    const selectedSnapshot = snapshots.find(({ satelliteId }) => satelliteId === selectedSatelliteId);
    const selectedSatellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!selectedSnapshot || !selectedSatellite) return;
    let forecast = contactForecasts.get(selectedSatellite.id);
    if (!forecast || selectedSnapshot.elapsedSeconds >= forecast.computedAt + 900
      || (forecast.window && selectedSnapshot.elapsedSeconds > forecast.window.endsAtSeconds)) {
      const windows = predictGroundContactWindows(
        selectedSatellite,
        surfaceObjects,
        selectedSnapshot.elapsedSeconds,
        selectedSnapshot.elapsedSeconds + CONTACT_FORECAST_HORIZON_SECONDS,
        { sampleStepSeconds: CONTACT_FORECAST_SAMPLE_SECONDS, maximumWindowsPerStation: 1 },
      );
      const active = selectedSnapshot.stationContacts.find((contact) => contact.available);
      forecast = {
        computedAt: selectedSnapshot.elapsedSeconds,
        window: active
          ? windows.find((window) => window.stationId === active.station.id)
          : windows[0],
      };
      contactForecasts.set(selectedSatellite.id, forecast);
    }
    renderSnapshot(selectedSnapshot, selectedSatellite, forecast.window);
    renderSelectedSpacecraft(selectedSatellite, selectedSnapshot);
  };

  elements.trackToggle.addEventListener("click", () => {
    simulation.showTrack = !simulation.showTrack;
    elements.trackToggle.setAttribute("aria-pressed", String(simulation.showTrack));
    globe.setTrackVisible(simulation.showTrack);
  });

  elements.pauseToggle.addEventListener("click", () => setSimulationRunning(!simulation.running));

  elements.prepareTel.addEventListener("click", () => {
    const satellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!satellite) return;
    const now = simulationRuntime.elapsedSeconds;
    const windows = predictGroundContactWindows(
      satellite,
      surfaceObjects,
      now,
      now + 48 * 60 * 60,
      { sampleStepSeconds: CONTACT_FORECAST_SAMPLE_SECONDS, maximumWindowsPerStation: 4 },
    );
    const distinctWindows: GroundContactWindow[] = [];
    for (const window of windows) {
      const previous = distinctWindows.at(-1);
      if (!previous || window.startsAtSeconds >= previous.endsAtSeconds) distinctWindows.push(window);
      if (distinctWindows.length === 2) break;
    }
    if (distinctWindows.length < 2) {
      elements.spacecraftPlanStatus.textContent = `Could not prepare a TEL for ${satellite.name}: two separate contacts were not found within 48 hours.`;
      return;
    }
    const coverageSeconds = distinctWindows[1]!.startsAtSeconds - distinctWindows[0]!.startsAtSeconds;
    const version = groundOperations.getSatelliteState(satellite.id).groundPlanVersion + 1;
    clearCaptureDraftFor(satellite.id);
    groundOperations.reviseGroundPlan(satellite.id, [
      { id: `authored-v${version}-1`, label: "Authored autonomous segment 1", durationSeconds: coverageSeconds / 2 },
      { id: `authored-v${version}-2`, label: "Authored autonomous segment 2", durationSeconds: coverageSeconds / 2 },
    ], now);
    elements.spacecraftPlanStatus.textContent = `Ground plan V${version} prepared for ${satellite.name}'s next two predicted contacts. It will upload at contact.`;
  });

  elements.generateGreedyTel.addEventListener("click", () => {
    setSimulationRunning(false);
    elements.spacecraftPlanStatus.textContent = cellGrid
      ? generateGreedyTel(cellGrid)
      : "Cell market is still loading; the spacecraft plan is not ready yet.";
  });

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
    if (simulation.running) {
      advanceGroundOperations(elapsedRealSeconds * simulation.timeMultiplier);
    }

    if (frameMilliseconds - previousUiUpdate > 120) {
      const snapshots = fleet.map((satellite) =>
        createWorldSnapshot(satellite, surfaceObjects, simulationRuntime.elapsedSeconds),
      );
      updateFleetViews(snapshots);
      refreshCellMarket?.();
      previousUiUpdate = frameMilliseconds;
    }

    requestAnimationFrame(animate);
  };

  const firstSnapshots = fleet.map((satellite) =>
    createWorldSnapshot(satellite, surfaceObjects, simulationRuntime.elapsedSeconds),
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
