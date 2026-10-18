import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import { AVAILABLE_TIME_MULTIPLIERS, DEFAULT_TIME_MULTIPLIER, EFFECTIVE_CONTACT_RADIUS_KM, INITIAL_FLEET, SURFACE_OBJECTS } from "./simulation/constants";
import { createWorldSnapshot } from "./simulation/world";
import { SimulationRuntime } from "./simulation/runtime";
import { predictGroundContactWindows, type GroundContactWindow } from "./simulation/contacts";
import { GroundOperations } from "./simulation/groundOperations";
import { createPrototypeCellMarket } from "./simulation/prototypeCellMarket";
import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt, type CellCaptureScenario } from "./simulation/cellCapture";
import { cellLabel } from "./simulation/cells";
import type { CellMarketState } from "./simulation/cellMarketState";
import { OperationalLoop } from "./simulation/operationalLoop";
import { CompanyFinance } from "./simulation/companyFinance";
import { getSpacecraftEquipmentOption, quoteSpacecraftPurchase, purchaseSpacecraftWithEquipment } from "./simulation/spacecraftCatalog";
import type { GeographicLocation, SatelliteDefinition, SurfaceObject, WorldSnapshot } from "./simulation/model";
import { setupFinanceView } from "./ui/finance";

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
  summarySatelliteCards: document.querySelector<HTMLElement>("#summary-satellite-cards")!,
  surfaceSunlit: document.querySelector<HTMLElement>("#surface-sunlit")!,
  eclipseState: document.querySelector<HTMLElement>("#eclipse-state")!,
  subsolarLongitude: document.querySelector<HTMLElement>("#subsolar-longitude")!,
  stationCount: document.querySelector<HTMLElement>("#station-count")!,
  stationList: document.querySelector<HTMLElement>("#station-list")!,
  nextContact: document.querySelector<HTMLElement>("#next-contact")!,
  groundPlanStatus: document.querySelector<HTMLElement>("#ground-plan-status")!,
  telStatus: document.querySelector<HTMLElement>("#tel-status")!,
  telEvent: document.querySelector<HTMLElement>("#tel-event")!,
  spacecraftPlanStatus: document.querySelector<HTMLElement>("#spacecraft-plan-status")!,
  stationTableCount: document.querySelector<HTMLElement>("#station-table-count")!,
  stationTableBody: document.querySelector<HTMLTableSectionElement>("#station-table-body")!,
  spacecraftCount: document.querySelector<HTMLElement>("#spacecraft-count")!,
  spacecraftTableBody: document.querySelector<HTMLTableSectionElement>("#spacecraft-table-body")!,
  purchaseOrbitAltitude: document.querySelector<HTMLInputElement>("#purchase-orbit-altitude")!,
  purchaseOrbitInclination: document.querySelector<HTMLInputElement>("#purchase-orbit-inclination")!,
  purchaseOrbitNode: document.querySelector<HTMLInputElement>("#purchase-orbit-node")!,
  purchaseOrbitPhase: document.querySelector<HTMLInputElement>("#purchase-orbit-phase")!,
  purchaseEquipmentOption: document.querySelector<HTMLSelectElement>("#purchase-equipment-option")!,
  purchasePackageSummary: document.querySelector<HTMLElement>("#purchase-package-summary")!,
  purchaseSpacecraft: document.querySelector<HTMLButtonElement>("#purchase-spacecraft")!,
  purchaseSpacecraftStatus: document.querySelector<HTMLElement>("#purchase-spacecraft-status")!,
  spacecraftDetailTitle: document.querySelector<HTMLElement>("#spacecraft-detail-title")!,
  spacecraftDetailState: document.querySelector<HTMLElement>("#spacecraft-detail-state")!,
  spacecraftDetailAltitude: document.querySelector<HTMLElement>("#spacecraft-detail-altitude")!,
  spacecraftDetailInclination: document.querySelector<HTMLElement>("#spacecraft-detail-inclination")!,
  spacecraftDetailSlew: document.querySelector<HTMLElement>("#spacecraft-detail-slew")!,
  spacecraftDetailCoordinate: document.querySelector<HTMLElement>("#spacecraft-detail-coordinate")!,
  spacecraftDetailStation: document.querySelector<HTMLElement>("#spacecraft-detail-station")!,
  spacecraftDetailBattery: document.querySelector<HTMLElement>("#spacecraft-detail-battery")!,
  spacecraftDetailPowerState: document.querySelector<HTMLElement>("#spacecraft-detail-power-state")!,
  spacecraftDetailPowerFlow: document.querySelector<HTMLElement>("#spacecraft-detail-power-flow")!,
  spacecraftDetailPowerReason: document.querySelector<HTMLElement>("#spacecraft-detail-power-reason")!,
  spacecraftTelStatus: document.querySelector<HTMLElement>("#spacecraft-tel-status")!,
  spacecraftTelCommands: document.querySelector<HTMLOListElement>("#spacecraft-tel-commands")!,
  contactRadius: document.querySelector<HTMLElement>("#contact-radius")!,
  locationCount: document.querySelector<HTMLElement>("#location-count")!,
  locationList: document.querySelector<HTMLElement>("#location-list")!,
};

let fleet: readonly SatelliteDefinition[] = [...INITIAL_FLEET.satellites];
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
const companyFinance = new CompanyFinance({ startingCashUsd: -50_000 });
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

type SummarySatelliteCard = {
  name: HTMLElement;
  payload: HTMLElement;
  power: HTMLElement;
  contact: HTMLElement;
};

const spacecraftTableRows = new Map<string, SpacecraftTableRow>();
const summarySatelliteCards = new Map<string, SummarySatelliteCard>();
const stationAntennaCells = new Map<string, HTMLElement>();

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
const formatCurrencyCents = (cents: number): string => (cents / 100).toLocaleString(undefined, {
  style: "currency",
  currency: "USD",
});

function renderStations(
  snapshot: ReturnType<typeof createWorldSnapshot>,
  nextWindow: GroundContactWindow | undefined,
  groundOperations: GroundOperations,
  runtime: SimulationRuntime,
): void {
  const stations = snapshot.stationContacts;
  const activeStationIds = new Set(groundOperations.getSatelliteState(snapshot.satelliteId).activeStationIds);
  const activeCount = activeStationIds.size;
  elements.stationCount.textContent = `${activeCount} / ${stations.length} IN CONTACT`;
  elements.stationList.replaceChildren(
    ...stations.map((contact) => {
      const row = document.createElement("div");
      row.className = "station-row";
      const marker = document.createElement("span");
      const isOperational = contact.stationOperational;
      marker.className = `row-marker ${isOperational ? "row-marker-active" : ""}`;
      const copy = document.createElement("span");
      copy.className = "row-copy";
      const name = document.createElement("strong");
      name.textContent = contact.station.name;
      const detail = document.createElement("small");
      const averageDailyExpense = companyFinance.getAverageDailyGroundStationExpenseCents(
        contact.station.id,
        snapshot.elapsedSeconds,
      );
      detail.textContent = `3-DAY AVG EXPENSE · ${formatCurrencyCents(averageDailyExpense)} / DAY`;
      copy.append(name, detail);
      const state = document.createElement("span");
      state.className = `row-state ${isOperational ? "row-state-active" : "state-warning"}`;
      state.textContent = isOperational ? "AVAILABLE" : "DOWN";
      row.append(marker, copy, state);
      return row;
    }),
  );
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

      const contactCostCell = document.createElement("td");
      contactCostCell.className = "table-rate";
      contactCostCell.textContent = station.groundStationDetails
        ? station.groundStationDetails.contactCostUsdPerMinute.toLocaleString(undefined, { style: "currency", currency: "USD" })
        : "UNCONFIGURED";

      const antennaCell = document.createElement("td");
      antennaCell.className = "antenna-status-cell";
      antennaCell.textContent = "NO ACTIVE LINK";
      stationAntennaCells.set(station.id, antennaCell);

      row.append(stationCell, locationCell, contactCell, uplinkCell, downlinkCell, contactCostCell, antennaCell);
      return row;
    }),
  );
}

function renderAntennaOccupancy(groundOperations: GroundOperations): void {
  for (const [stationId, cell] of stationAntennaCells) {
    const state = groundOperations.getAntennaState(stationId);
    const ownerName = state.ownerSatelliteId
      ? fleet.find(({ id }) => id === state.ownerSatelliteId)?.name ?? state.ownerSatelliteId
      : null;
    const waitingNames = state.waitingSatelliteIds
      .map(id => fleet.find(satellite => satellite.id === id)?.name ?? id);
    cell.textContent = ownerName
      ? `${ownerName}${waitingNames.length > 0 ? ` · waiting: ${waitingNames.join(", ")}` : ""}`
      : waitingNames.length > 0
        ? `Waiting: ${waitingNames.join(", ")}`
      : "NO ACTIVE LINK";
    cell.title = waitingNames.join(", ");
  }
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

function renderSpacecraftTable(snapshots: readonly WorldSnapshot[], groundOperations: GroundOperations): void {
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
    const groundState = groundOperations.getSatelliteState(snapshot.satelliteId);
    const linkedStationId = groundState.activeStationIds[0];
    const linkedStation = linkedStationId
      ? surfaceObjects.find(({ id }) => id === linkedStationId)
      : undefined;
    const waitingContact = snapshot.stationContacts.find(contact => {
      const antenna = groundOperations.getAntennaState(contact.station.id);
      return contact.geometricInRange && contact.stationOperational
        && antenna.ownerSatelliteId !== null
        && antenna.ownerSatelliteId !== snapshot.satelliteId;
    });
    row.stationAccess.textContent = linkedStation
      ? `LINK · ${linkedStation.name}`
      : waitingContact
        ? `WAITING · ${waitingContact.station.name}`
        : "NO CONTACT";
  }
}

function renderSummarySatelliteCards(
  snapshots: readonly WorldSnapshot[],
  forecasts: ReadonlyMap<string, GroundContactWindow | undefined>,
  operationalLoop: OperationalLoop,
  groundOperations: GroundOperations,
  market: CellMarketState | null,
): void {
  const activeIds = new Set(snapshots.map(({ satelliteId }) => satelliteId));
  const onboardImageCounts = new Map<string, number>();
  for (const image of market?.getImages() ?? []) {
    if (image.status === "onboard") {
      onboardImageCounts.set(image.satelliteId, (onboardImageCounts.get(image.satelliteId) ?? 0) + 1);
    }
  }
  for (const [satelliteId, card] of summarySatelliteCards) {
    if (!activeIds.has(satelliteId)) {
      card.name.closest("article")?.remove();
      summarySatelliteCards.delete(satelliteId);
    }
  }

  for (const snapshot of snapshots) {
    const satellite = fleet.find(({ id }) => id === snapshot.satelliteId);
    if (!satellite) continue;
    let card = summarySatelliteCards.get(satellite.id);
    if (!card) {
      const article = document.createElement("article");
      article.className = "satellite-card";
      const heading = document.createElement("h2");
      heading.className = "satellite-card-name";
      const metrics = document.createElement("div");
      metrics.className = "satellite-card-metrics";
      const createMetric = (label: string): HTMLElement => {
        const metric = document.createElement("div");
        metric.className = "satellite-card-metric";
        const caption = document.createElement("span");
        caption.textContent = label;
        const value = document.createElement("strong");
        metric.append(caption, value);
        metrics.append(metric);
        return value;
      };
      card = {
        name: heading,
        payload: createMetric("PAYLOAD STATUS"),
        power: createMetric("POWER STATUS"),
        contact: createMetric("NEXT CONTACT"),
      };
      article.append(heading, metrics);
      elements.summarySatelliteCards.append(article);
      summarySatelliteCards.set(satellite.id, card);
    }

    card.name.textContent = satellite.name;
    const payload = operationalLoop.getCellOperationalVisualization(satellite.id);
    const onboardImageCount = onboardImageCounts.get(satellite.id) ?? 0;
    card.payload.textContent = payload.activeCapture
      ? `IMAGING · ${onboardImageCount} STORED`
      : onboardImageCount > 0
        ? `${onboardImageCount} IMAGE${onboardImageCount === 1 ? "" : "S"} ABOARD`
        : market
          ? "IDLE · NO IMAGERY"
          : "AWAITING CELL DATA";

    const power = operationalLoop.getPowerSnapshot(satellite.id);
    const powerLabel = power.depleted
      ? "DEPLETED"
      : power.energyWh <= power.reserveWh
        ? "AT RESERVE"
        : "NOMINAL";
    card.power.textContent = `${powerLabel} · ${Math.round(power.chargePercent)}%`;

    const groundState = groundOperations.getSatelliteState(satellite.id);
    const activeStationId = groundState.activeStationIds[0];
    const activeStation = activeStationId
      ? snapshot.stationContacts.find(contact => contact.station.id === activeStationId)?.station
      : undefined;
    const waitingContact = !activeStation
      ? snapshot.stationContacts.find(contact => {
        const owner = groundOperations.getAntennaState(contact.station.id).ownerSatelliteId;
        return contact.geometricInRange && contact.stationOperational && owner !== null && owner !== satellite.id;
      })
      : undefined;
    const nextWindow = forecasts.get(satellite.id);
    const timeUntil = (seconds: number): string => formatDuration(seconds).replace(/^T\+/, "");
    card.contact.textContent = activeStation
      ? `${activeStation.name} · NOW`
      : waitingContact
        ? `${waitingContact.station.name} · NOW, WAITING`
        : nextWindow
          ? `${nextWindow.stationName} · IN ${timeUntil(nextWindow.startsAtSeconds - snapshot.elapsedSeconds)}`
          : "NO CONTACT PREDICTED IN 24H";
  }
}

function renderSelectedSpacecraft(
  satellite: SatelliteDefinition,
  snapshot: WorldSnapshot,
  power: ReturnType<OperationalLoop["getPowerSnapshot"]>,
  groundOperations: GroundOperations,
  runtime: SimulationRuntime,
  focusCellOnMap: (index: number) => void,
): void {
  elements.spacecraftDetailTitle.textContent = satellite.name;
  elements.spacecraftDetailState.textContent = snapshot.satelliteEclipsed ? "EARTH ECLIPSE" : "SUNLIT";
  elements.spacecraftDetailState.classList.toggle("table-status-active", !snapshot.satelliteEclipsed);
  elements.spacecraftDetailAltitude.textContent = `${Math.round(satellite.orbit.altitudeKm).toLocaleString()} km`;
  elements.spacecraftDetailInclination.textContent = `${satellite.orbit.inclinationDeg.toFixed(1)}°`;
  const equipment = satellite.equipmentOptionId
    ? getSpacecraftEquipmentOption(satellite.equipmentOptionId)
    : getSpacecraftEquipmentOption("standard");
  elements.spacecraftDetailSlew.textContent = `${equipment.name} · ${satellite.slew.slewRateDegPerSecond}°/s · ${satellite.slew.settlingTimeSeconds}s settle`;
  elements.spacecraftDetailCoordinate.textContent = formatCoordinate(
    snapshot.subSatellitePoint.latitudeDeg,
    snapshot.subSatellitePoint.longitudeDeg,
  );
  const groundState = groundOperations.getSatelliteState(satellite.id);
  const activeStation = groundState.activeStationIds
    .map(id => snapshot.stationContacts.find(contact => contact.station.id === id))
    .find((contact): contact is NonNullable<typeof contact> => Boolean(contact));
  const waitingStation = snapshot.stationContacts.find(contact => {
    const ownerId = groundOperations.getAntennaState(contact.station.id).ownerSatelliteId;
    return contact.geometricInRange && contact.stationOperational && ownerId !== null && ownerId !== satellite.id;
  });
  const waitingOwnerId = waitingStation
    ? groundOperations.getAntennaState(waitingStation.station.id).ownerSatelliteId
    : null;
  const waitingOwner = waitingOwnerId ? fleet.find(({ id }) => id === waitingOwnerId)?.name : null;
  const nearestStation = [...snapshot.stationContacts].sort((left, right) => left.distanceKm - right.distanceKm)[0];
  elements.spacecraftDetailStation.textContent = activeStation
    ? `${activeStation.station.name} · ANTENNA LINK`
    : waitingStation
      ? `${waitingStation.station.name} · WAITING${waitingOwner ? ` BEHIND ${waitingOwner}` : ""}`
      : nearestStation
        ? `${nearestStation.station.name} · ${formatDistance(nearestStation.distanceKm)}`
        : "NONE CONFIGURED";
  elements.spacecraftDetailBattery.textContent = `${power.energyWh.toFixed(1)} / ${power.capacityWh} Wh (${power.chargePercent.toFixed(0)}%) · ${power.reserveWh} Wh reserve`;
  elements.spacecraftDetailPowerState.textContent = power.depleted ? "DEPLETED · RECHARGING" : power.radioPaused ? "DOWNLINK PAUSED" : "NOMINAL";
  elements.spacecraftDetailPowerFlow.textContent = `${power.generationW} W generation · ${power.loadW.toFixed(0)} W load · ${power.netW.toFixed(0)} W net`;
  elements.spacecraftDetailPowerReason.textContent = power.reason ?? "No active power restriction.";

  const onboardCommands = groundState.onboardCommands;
  const currentAction = runtime.getSatelliteState(satellite.id).currentAction;
  const hasActiveTelCommand = currentAction?.kind === "tel-command";
  const currentIndex = groundState.nextCommandIndex;
  const pendingUpload = groundOperations.hasPendingGroundPlan(satellite.id);
  const telVersion = groundState.onboardTelVersion;
  const remainingCount = Math.max(0, onboardCommands.length - currentIndex);
  elements.spacecraftPlanStatus.textContent = groundState.groundPlanVersion === 0
    ? "Automatic scheduler is initializing or waiting for enough available contact opportunities to prepare the first TEL."
    : pendingUpload
      ? `Automatic ground plan V${groundState.groundPlanVersion} is ready and will upload at the next available contact.`
      : `Automatic ground plan V${groundState.groundPlanVersion} is synchronized with the onboard TEL.`;
  elements.spacecraftTelStatus.textContent = telVersion === null
    ? groundState.groundPlanVersion > 0
      ? `NO TEL ONBOARD · GROUND PLAN V${groundState.groundPlanVersion} AWAITS CONTACT`
      : "NO TEL ONBOARD · AUTOMATIC PLAN INITIALIZING"
    : `${groundState.mode === "standby" ? "STANDBY" : `ONBOARD TEL V${telVersion}`} · ${remainingCount} command${remainingCount === 1 ? "" : "s"} remaining${pendingUpload ? ` · Ground plan V${groundState.groundPlanVersion} awaits contact` : ""}${groundState.mode === "standby" && groundState.standbyCause === "tel-exhausted" ? " · TEL exhausted" : ""}`;
  elements.spacecraftTelCommands.replaceChildren();
  if (onboardCommands.length === 0) {
    const empty = document.createElement("li");
    empty.className = "spacecraft-tel-empty";
    empty.textContent = groundState.groundPlanVersion > 0 && telVersion === null
      ? `Ground plan V${groundState.groundPlanVersion} will upload at the next available contact.`
      : groundState.standbyCause === "no-uploaded-tel"
        ? "The automatic scheduler is preparing the first ground plan. It will upload at the next available contact."
      : "No commands are currently stored onboard.";
    elements.spacecraftTelCommands.append(empty);
  } else {
    onboardCommands.forEach((command, index) => {
      const item = document.createElement("li");
      item.className = "spacecraft-tel-command";
      const status = index < currentIndex
        ? "COMPLETED"
        : index === currentIndex && hasActiveTelCommand
          ? "IN PROGRESS"
          : index === currentIndex
            ? "NEXT"
            : "QUEUED";
      item.classList.toggle("spacecraft-tel-command-current", status === "IN PROGRESS" || status === "NEXT");
      if (command.cellCapture) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "spacecraft-tel-cell";
        button.textContent = `${cellLabel(command.cellCapture.cellIndex)} · ${command.label}`;
        button.setAttribute("aria-label", `Center ${cellLabel(command.cellCapture.cellIndex)} on the map`);
        button.addEventListener("click", () => focusCellOnMap(command.cellCapture!.cellIndex));
        const stateLabel = document.createElement("span");
        stateLabel.className = "spacecraft-tel-command-state";
        stateLabel.textContent = status;
        item.append(button, stateLabel);
      } else {
        const label = document.createElement("span");
        label.className = "spacecraft-tel-command-label";
        label.textContent = command.label;
        const stateLabel = document.createElement("span");
        stateLabel.className = "spacecraft-tel-command-state";
        stateLabel.textContent = status;
        item.append(label, stateLabel);
      }
      elements.spacecraftTelCommands.append(item);
    });
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
  const waitingStationId = activeStation
    ? undefined
    : groundOperations.getGeometricStationIds(satelliteId).find(stationId => {
      const ownerId = groundOperations.getAntennaState(stationId).ownerSatelliteId;
      return ownerId !== null && ownerId !== satelliteId;
    });
  const waitingStationName = waitingStationId
    ? surfaceObjects.find(({ id }) => id === waitingStationId)?.name
    : undefined;
  const waitingOwnerId = waitingStationId
    ? groundOperations.getAntennaState(waitingStationId).ownerSatelliteId
    : null;
  const waitingOwnerName = waitingOwnerId ? fleet.find(({ id }) => id === waitingOwnerId)?.name : undefined;
  elements.nextContact.textContent = activeStation
    ? `ANTENNA LINK OPEN · ${activeStation.toUpperCase()}`
    : waitingStationName
      ? `WAITING · ${waitingStationName.toUpperCase()} SERVING ${waitingOwnerName?.toUpperCase() ?? waitingOwnerId}`
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
  nextWindow: GroundContactWindow | undefined,
): void {
  elements.simClock.textContent = formatDuration(snapshot.elapsedSeconds);
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

function setupWorkspaceLayout(resizeGlobe: () => void): void {
  const shell = document.querySelector<HTMLElement>(".sim-shell")!;
  const controls = [...document.querySelectorAll<HTMLButtonElement>("[data-layout-direction]")];
  const syncControls = () => {
    const layout = shell.dataset.layout;
    controls.forEach((button) => {
      const direction = button.dataset.layoutDirection;
      const visible = layout === "split"
        || (layout === "map" && direction === "right")
        || (layout === "info" && direction === "left");
      const label = layout === "split"
        ? direction === "left" ? "Collapse information section" : "Collapse map section"
        : layout === "map" ? "Expand information section" : "Expand map section";
      button.hidden = !visible;
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  };
  controls.forEach((button) => button.addEventListener("click", () => {
    const direction = button.dataset.layoutDirection;
    const layout = shell.dataset.layout;
    if (layout === "split") shell.dataset.layout = direction === "left" ? "map" : "info";
    else shell.dataset.layout = "split";
    syncControls();
    window.setTimeout(resizeGlobe, 280);
  }));
  syncControls();
  window.addEventListener("resize", resizeGlobe);
}

function updateMiniGlobe(snapshots: readonly WorldSnapshot[]): void {
  const layer = document.querySelector<SVGGElement>("#mini-globe-satellites");
  if (!layer) return;
  const colors = ["#f4f870", "#72d7ff", "#ff9b76", "#c4a7ff", "#7ce2a4"];
  layer.replaceChildren(...snapshots.map((snapshot, index) => {
    const point = snapshot.satelliteEarthFixedKm;
    const scale = 54 / 7_000;
    const x = Math.max(28, Math.min(152, 90 + point.x * scale));
    const y = Math.max(28, Math.min(152, 90 - point.z * scale));
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    marker.setAttribute("class", "mini-globe-satellite");
    marker.setAttribute("cx", String(x));
    marker.setAttribute("cy", String(y));
    marker.setAttribute("r", "3.5");
    marker.setAttribute("fill", colors[index % colors.length]!);
    return marker;
  }));
}

async function start(): Promise<void> {
  setupManagementTabs();
  renderGroundStationTable();
  renderAntennaOccupancy(groundOperations);
  elements.contactRadius.textContent = EFFECTIVE_CONTACT_RADIUS_KM.toLocaleString();
  elements.stationList.innerHTML = '<div class="loading-row">CALCULATING ACCESS WINDOWS…</div>';

  const { createGlobeView } = await import("./rendering/globe");
  const globe = await createGlobeView(fleet, surfaceObjects);
  setupWorkspaceLayout(() => {
    globe.viewer.resize();
    globe.viewer.scene.requestRender();
  });
  buildSpacecraftTable((satelliteId) => {
    selectedSatelliteId = satelliteId;
    globe.setSelectedSatellite(satelliteId);
  });
  globe.setSelectedSatellite(selectedSatelliteId);
  globe.setTrackVisible(simulation.showTrack);

  // Geography loads independently so a data failure does not stop the world clock.
  let cellMarket: CellMarketState | null = null;
  let cellGrid: import("./simulation/cells").CellGrid | null = null;
  const automaticallyPlannedSatellites = new Set<string>();
  const enableAutomaticPlanning = (satelliteId: string, grid: import("./simulation/cells").CellGrid): void => {
    if (automaticallyPlannedSatellites.has(satelliteId)) return;
    operationalLoop.enableAutomaticPlanning(satelliteId, grid);
    automaticallyPlannedSatellites.add(satelliteId);
  };
  const enableAutomaticPlanningForFleet = (grid: import("./simulation/cells").CellGrid): void => {
    for (const satellite of fleet) enableAutomaticPlanning(satellite.id, grid);
  };
  const refreshFinance = setupFinanceView(companyFinance, () => simulationRuntime.elapsedSeconds);
  refreshFinance();
  let purchaseNotice: string | null = null;
  let purchaseNoticeWarning = false;
  let purchaseNoticeRevision = -1;
  const updatePurchaseStatus = (message: string, warning = false): void => {
    elements.purchaseSpacecraftStatus.textContent = message;
    elements.purchaseSpacecraftStatus.dataset.state = warning ? "warning" : "ready";
  };
  const refreshGrowth = (): void => {
    refreshFinance();
    const validOrbit = [
      elements.purchaseOrbitAltitude,
      elements.purchaseOrbitInclination,
      elements.purchaseOrbitNode,
      elements.purchaseOrbitPhase,
    ].every(input => input.checkValidity());
    let quote: ReturnType<typeof quoteSpacecraftPurchase>;
    try {
      quote = quoteSpacecraftPurchase(elements.purchaseEquipmentOption.value, companyFinance.getSnapshot().cashCents);
    } catch {
      elements.purchaseSpacecraft.disabled = true;
      elements.purchasePackageSummary.textContent = "Choose a valid spacecraft package.";
      updatePurchaseStatus("Choose a valid spacecraft package.", true);
      return;
    }
    const cashCents = companyFinance.getSnapshot().cashCents;
    const { option: equipment, totalCostCents: purchaseCostCents, cashAfterPurchaseCents } = quote;
    const money = (cents: number): string => new Intl.NumberFormat(undefined, {
      style: "currency", currency: "USD", maximumFractionDigits: 0,
    }).format(cents / 100);
    elements.purchasePackageSummary.textContent = `${equipment.name}: spacecraft ${money(equipment.spacecraftCostCents)} · upgrade ${money(equipment.upgradeCostCents)} · launch ${money(equipment.launchCostCents)} · total ${money(purchaseCostCents)} · cash after launch ${money(cashAfterPurchaseCents)} · ${equipment.slew.slewRateDegPerSecond}°/second, ${equipment.slew.settlingTimeSeconds}s settling`;
    elements.purchaseSpacecraft.disabled = !validOrbit || !quote.affordable;
    if (purchaseNotice && purchaseNoticeRevision === companyFinance.revision) {
      updatePurchaseStatus(purchaseNotice, purchaseNoticeWarning);
      return;
    }
    purchaseNotice = null;
    if (!validOrbit) {
      updatePurchaseStatus("Enter a valid orbit before launch.", true);
    } else if (!quote.affordable) {
      const required = money(purchaseCostCents);
      const current = (cashCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
      updatePurchaseStatus(`Requires ${required} available cash. Current cash: ${current}.`, true);
    } else {
      const orbit = `${Number(elements.purchaseOrbitAltitude.value).toLocaleString()} km · ${Number(elements.purchaseOrbitInclination.value).toFixed(1)}° inclination`;
      updatePurchaseStatus(`Ready to launch in the selected orbit: ${orbit}.`);
    }
  };
  const operationalLoop = new OperationalLoop({
    fleet,
    stations: surfaceObjects,
    scenario: PROPOSED_CELL_CAPTURE_SCENARIO,
    weather: { seed: 20261014, epochUtcMs: Date.parse("2026-01-01T00:00:00Z"), baselinePercent: 50 },
    getMarket: () => cellMarket,
    storageCapacityBytesBySatellite: Object.fromEntries(fleet.map(({ id }) => [id, PROTOTYPE_STORAGE_CAPACITY_BYTES])),
    runtime: simulationRuntime,
    groundOperations,
    finance: companyFinance,
  });
  let refreshCellMarket: (() => void) | null = null;
  let focusCellOnMap: (index: number) => void = () => {};
  let selectedSatelliteEarthFixedKm: { x: number; y: number; z: number } | null = null;
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
    refreshGrowth();
  };
  const resetPreview = () => {
    setSimulationRunning(false);
    operationalLoop.reset();
    automaticallyPlannedSatellites.clear();
    fleet = operationalLoop.getFleet();
    if (cellGrid) enableAutomaticPlanningForFleet(cellGrid);
    selectedSatelliteId = fleet[0]!.id;
    elements.purchaseOrbitAltitude.value = "550";
    elements.purchaseOrbitInclination.value = "53";
    elements.purchaseOrbitNode.value = "12";
    elements.purchaseOrbitPhase.value = "8";
    elements.purchaseEquipmentOption.value = "standard";
    purchaseNotice = null;
    purchaseNoticeWarning = false;
    purchaseNoticeRevision = -1;
    globe.setSatellites(fleet);
    buildSpacecraftTable((satelliteId) => {
      selectedSatelliteId = satelliteId;
      globe.setSelectedSatellite(satelliteId);
    });
    globe.setSelectedSatellite(selectedSatelliteId);
    captureDrafts.clear();
    captureSequence = 0;
    contactForecasts.clear();
    simulation.lastFrameMilliseconds = performance.now();
    refreshCellMarket?.();
    refreshGrowth();
  };
  void import("./ui/cellMarket").then(({ setupCellMarket }) => setupCellMarket(
    globe.viewer,
    {
      nowSeconds: () => simulationRuntime.elapsedSeconds,
      getOrCreateMarket: grid => {
        cellGrid = grid;
        const market = cellMarket ??= createPrototypeCellMarket(grid, companyFinance);
        enableAutomaticPlanningForFleet(grid);
        return market;
      },
      getSatelliteId: () => selectedSatelliteId,
      hasGroundContact: () => groundOperations.getSatelliteState(selectedSatelliteId).activeStationIds.length > 0,
      pauseSimulation: () => setSimulationRunning(false),
      advanceSimulationBySeconds,
      resetPreview,
      addCellCaptureToTel: queueCaptureDraft,
      clearCellCaptureDraft: clearCaptureDraft,
      enforceStorageCapacity: (satelliteId, timeSeconds) =>
        operationalLoop.enforceStorageCapacity(satelliteId, timeSeconds),
      notifySchedulingInputsChanged: () => operationalLoop.notifySchedulingInputsChanged(),
      getCellOperationalVisualization: () => operationalLoop.getCellOperationalVisualization(selectedSatelliteId),
      getSatelliteEarthFixedKm: () => selectedSatelliteEarthFixedKm,
    },
    (refresh, focusCell) => {
      refreshCellMarket = refresh;
      focusCellOnMap = focusCell;
    },
  ));

  const updateFleetViews = (snapshots: readonly WorldSnapshot[]) => {
    globe.update(snapshots);
    updateMiniGlobe(snapshots);
    selectedSatelliteEarthFixedKm = snapshots.find(({ satelliteId }) => satelliteId === selectedSatelliteId)?.satelliteEarthFixedKm ?? null;
    renderSpacecraftTable(snapshots, groundOperations);
    renderAntennaOccupancy(groundOperations);

    const forecasts = new Map<string, GroundContactWindow | undefined>();
    for (const snapshot of snapshots) {
      const satellite = fleet.find(({ id }) => id === snapshot.satelliteId);
      if (!satellite) continue;
      let forecast = contactForecasts.get(satellite.id);
      if (!forecast || snapshot.elapsedSeconds >= forecast.computedAt + 900
        || (forecast.window && snapshot.elapsedSeconds > forecast.window.endsAtSeconds)) {
        const windows = predictGroundContactWindows(
          satellite,
          surfaceObjects,
          snapshot.elapsedSeconds,
          snapshot.elapsedSeconds + CONTACT_FORECAST_HORIZON_SECONDS,
          { sampleStepSeconds: CONTACT_FORECAST_SAMPLE_SECONDS, maximumWindowsPerStation: 1 },
        );
        const active = snapshot.stationContacts.find((contact) => contact.available);
        forecast = {
          computedAt: snapshot.elapsedSeconds,
          window: active
            ? windows.find((window) => window.stationId === active.station.id)
            : windows[0],
        };
        contactForecasts.set(satellite.id, forecast);
      }
      forecasts.set(satellite.id, forecast.window);
    }
    renderSummarySatelliteCards(
      snapshots,
      forecasts,
      operationalLoop,
      groundOperations,
      cellMarket,
    );

    const selectedSnapshot = snapshots.find(({ satelliteId }) => satelliteId === selectedSatelliteId);
    const selectedSatellite = fleet.find(({ id }) => id === selectedSatelliteId);
    if (!selectedSnapshot || !selectedSatellite) return;
    const nextWindow = forecasts.get(selectedSatellite.id);
    renderSnapshot(selectedSnapshot, nextWindow);
    renderSelectedSpacecraft(selectedSatellite, selectedSnapshot, operationalLoop.getPowerSnapshot(selectedSatellite.id), groundOperations, simulationRuntime, focusCellOnMap);
  };

  const commitPurchase = (): void => {
    if (![
      elements.purchaseOrbitAltitude,
      elements.purchaseOrbitInclination,
      elements.purchaseOrbitNode,
      elements.purchaseOrbitPhase,
    ].every(input => input.checkValidity())) {
      elements.purchaseOrbitAltitude.reportValidity();
      elements.purchaseOrbitInclination.reportValidity();
      elements.purchaseOrbitNode.reportValidity();
      elements.purchaseOrbitPhase.reportValidity();
      refreshGrowth();
      return;
    }

    const now = simulationRuntime.elapsedSeconds;
    const ordinal = fleet.length + 1;
    const satelliteId = `asteria-${ordinal}`;
    const firstSatellite = fleet[0]!;
    const selectedAltitudeKm = Number(elements.purchaseOrbitAltitude.value);
    const selectedInclinationDeg = Number(elements.purchaseOrbitInclination.value);
    const selectedNodeDeg = Number(elements.purchaseOrbitNode.value);
    const selectedPhaseAtLaunchDeg = Number(elements.purchaseOrbitPhase.value);
    let definition: SatelliteDefinition;
    let equipment: ReturnType<typeof getSpacecraftEquipmentOption>;
    try {
      const purchase = purchaseSpacecraftWithEquipment({
        eventId: `purchase:${satelliteId}`,
        satelliteId,
        satelliteName: `Asteria-${ordinal}`,
        equipmentOptionId: elements.purchaseEquipmentOption.value,
        timeSeconds: now,
        altitudeKm: selectedAltitudeKm,
        inclinationDeg: selectedInclinationDeg,
        ascendingNodeDeg: selectedNodeDeg,
        phaseAtLaunchDeg: selectedPhaseAtLaunchDeg,
        referenceSatelliteId: firstSatellite.id,
        spacecraftIds: fleet.map(({ id }) => id),
        groundStationIds: surfaceObjects.filter(station => station.kind === "ground-station").map(({ id }) => id),
        storageCapacityBytes: PROTOTYPE_STORAGE_CAPACITY_BYTES,
        operationalLoop,
        finance: companyFinance,
        powerOperations: operationalLoop.powerOperations,
      });
      definition = purchase.definition;
      equipment = purchase.option;
    } catch (error) {
      purchaseNotice = error instanceof Error ? error.message : "Purchase could not be completed.";
      purchaseNoticeWarning = true;
      purchaseNoticeRevision = companyFinance.revision;
      updatePurchaseStatus(purchaseNotice, true);
      refreshGrowth();
      return;
    }

    fleet = operationalLoop.getFleet();
    selectedSatelliteId = satelliteId;
    if (cellGrid) enableAutomaticPlanning(satelliteId, cellGrid);
    contactForecasts.clear();
    globe.setSatellites(fleet);
    buildSpacecraftTable((nextSatelliteId) => {
      selectedSatelliteId = nextSatelliteId;
      globe.setSelectedSatellite(nextSatelliteId);
    });
    globe.setSelectedSatellite(satelliteId);
    purchaseNotice = `Launched ${definition.name} with ${equipment.name} at ${selectedAltitudeKm.toLocaleString()} km, ${selectedInclinationDeg}° inclination, ${selectedNodeDeg}° ascending node, and ${selectedPhaseAtLaunchDeg}° phase. It starts with empty storage and its own operations.`;
    purchaseNoticeWarning = false;
    purchaseNoticeRevision = companyFinance.revision;
    updatePurchaseStatus(purchaseNotice);
    refreshGrowth();
  };

  elements.purchaseSpacecraft.addEventListener("click", commitPurchase);
  [
    elements.purchaseOrbitAltitude,
    elements.purchaseOrbitInclination,
    elements.purchaseOrbitNode,
    elements.purchaseOrbitPhase,
  ].forEach(input => input.addEventListener("input", () => {
    purchaseNotice = null;
    refreshGrowth();
  }));
  elements.purchaseEquipmentOption.addEventListener("change", () => {
    purchaseNotice = null;
    refreshGrowth();
  });
  refreshGrowth();

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
    if (simulation.running) {
      advanceGroundOperations(elapsedRealSeconds * simulation.timeMultiplier);
    }

    if (frameMilliseconds - previousUiUpdate > 120) {
      const snapshots = fleet.map((satellite) =>
        createWorldSnapshot(satellite, surfaceObjects, simulationRuntime.elapsedSeconds),
      );
      updateFleetViews(snapshots);
      refreshCellMarket?.();
      refreshGrowth();
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
