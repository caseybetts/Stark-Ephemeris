import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import { AVAILABLE_TIME_MULTIPLIERS, DEFAULT_SATELLITE, DEFAULT_TIME_MULTIPLIER, EFFECTIVE_CONTACT_RADIUS_KM, SURFACE_OBJECTS } from "./simulation/constants";
import { createWorldSnapshot } from "./simulation/world";
import type { SurfaceObject } from "./simulation/model";

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
  satSunState: document.querySelector<HTMLElement>("#sat-sun-state")!,
  satContactState: document.querySelector<HTMLElement>("#sat-contact-state")!,
  surfaceSunlit: document.querySelector<HTMLElement>("#surface-sunlit")!,
  eclipseState: document.querySelector<HTMLElement>("#eclipse-state")!,
  subsolarLongitude: document.querySelector<HTMLElement>("#subsolar-longitude")!,
  stationCount: document.querySelector<HTMLElement>("#station-count")!,
  stationList: document.querySelector<HTMLElement>("#station-list")!,
  contactRadius: document.querySelector<HTMLElement>("#contact-radius")!,
  locationCount: document.querySelector<HTMLElement>("#location-count")!,
  locationList: document.querySelector<HTMLElement>("#location-list")!,
};

const satellite = DEFAULT_SATELLITE;
const surfaceObjects = SURFACE_OBJECTS as readonly SurfaceObject[];
const simulation = {
  elapsedSeconds: 0,
  timeMultiplier: DEFAULT_TIME_MULTIPLIER,
  running: true,
  showTrack: true,
  lastFrameMilliseconds: performance.now(),
};

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

function renderSnapshot(snapshot: ReturnType<typeof createWorldSnapshot>): void {
  const lat = snapshot.subSatellitePoint.latitudeDeg;
  const lon = snapshot.subSatellitePoint.longitudeDeg;

  elements.simClock.textContent = formatDuration(snapshot.elapsedSeconds);
  elements.satCoordinate.textContent = formatCoordinate(lat, lon);
  elements.satAltitude.textContent = `${Math.round(satellite.orbit.altitudeKm)} km`;

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

async function start(): Promise<void> {
  elements.contactRadius.textContent = EFFECTIVE_CONTACT_RADIUS_KM.toLocaleString();
  elements.stationList.innerHTML = '<div class="loading-row">CALCULATING ACCESS WINDOWS…</div>';

  const { createGlobeView } = await import("./rendering/globe");
  const globe = await createGlobeView(satellite, surfaceObjects);
  globe.setTrackVisible(simulation.showTrack);

  elements.trackToggle.addEventListener("click", () => {
    simulation.showTrack = !simulation.showTrack;
    elements.trackToggle.setAttribute("aria-pressed", String(simulation.showTrack));
    globe.setTrackVisible(simulation.showTrack);
  });

  elements.pauseToggle.addEventListener("click", () => {
    simulation.running = !simulation.running;
    elements.pauseToggle.setAttribute("aria-pressed", String(!simulation.running));
    elements.pauseLabel.textContent = simulation.running ? "PAUSE" : "RESUME";
    elements.pauseIcon.textContent = simulation.running ? "Ⅱ" : "▶";
    elements.runState.textContent = simulation.running ? "SIMULATION RUNNING" : "SIMULATION PAUSED";
    document.querySelector(".live-dot")?.classList.toggle("paused-dot", !simulation.running);
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
    if (simulation.running) simulation.elapsedSeconds += elapsedRealSeconds * simulation.timeMultiplier;

    if (frameMilliseconds - previousUiUpdate > 120) {
      const snapshot = createWorldSnapshot(satellite, surfaceObjects, simulation.elapsedSeconds);
      globe.update(snapshot, satellite);
      renderSnapshot(snapshot);
      previousUiUpdate = frameMilliseconds;
    }

    requestAnimationFrame(animate);
  };

  const firstSnapshot = createWorldSnapshot(satellite, surfaceObjects, simulation.elapsedSeconds);
  globe.update(firstSnapshot, satellite);
  renderSnapshot(firstSnapshot);
  requestAnimationFrame(animate);
}

start().catch((error: unknown) => {
  console.error(error);
  elements.globe.innerHTML = '<div class="globe-error"><strong>Globe initialization failed</strong><span>Check your network connection, then reload. The prototype loads CesiumJS assets and Earth imagery at startup.</span></div>';
  elements.runState.textContent = "WORLD MODEL OFFLINE";
  elements.runState.classList.add("error-state");
});
