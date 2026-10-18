import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt, type CellCaptureScenario } from "./cellCapture.ts";
import type { CellGrid } from "./cells.ts";
import type { CellMarketState } from "./cellMarketState.ts";
import { predictGroundContactWindows, type GroundContactWindow } from "./contacts.ts";
import { GroundOperations, type GroundContactPredictor, type TaskEventCommand } from "./groundOperations.ts";
import { PROTOTYPE_CELL_IMAGE_SIZE_BYTES } from "./cellMarketState.ts";
import { generateBoundedCellSchedule, PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS } from "./cellScheduler.ts";
import { ImageryOperations } from "./imageryOperations.ts";
import type { GeographicLocation, SatelliteDefinition, SurfaceObject } from "./model.ts";
import { CompanyFinance, SIMULATION_DAY_SECONDS } from "./companyFinance.ts";
import { isEclipsedAt, PowerOperations, projectSatellitePower, PROTOTYPE_POWER_CONFIGURATION, type SatellitePowerConfiguration, validatePowerConfiguration } from "./power.ts";
import { SimulationRuntime, type RuntimeEvent } from "./runtime.ts";
import type { PointingDirection } from "./slew.ts";
import { averageCloudCoverPercent, PROTOTYPE_CLOUD_THRESHOLD_PERCENT, type WeatherConfiguration } from "./weather.ts";

export type OperationalLoopConfiguration = {
  fleet: readonly SatelliteDefinition[];
  stations: readonly SurfaceObject[];
  scenario: CellCaptureScenario;
  getMarket: () => CellMarketState | null;
  storageCapacityBytesBySatellite: Readonly<Record<string, number>>;
  imageSizeBytes?: number;
  runtime?: SimulationRuntime;
  groundOperations?: GroundOperations;
  contactPredictor?: GroundContactPredictor;
  powerConfigurationBySatellite?: Readonly<Record<string, SatellitePowerConfiguration>>;
  weather?: WeatherConfiguration;
  finance?: CompanyFinance;
};

export type CellOperationalVisualization = {
  scheduledCellIndexes: number[];
  activeCapture: { cellIndex: number; target: GeographicLocation } | null;
};

const cloneSatellite = (satellite: SatelliteDefinition): SatelliteDefinition => ({
  id: satellite.id,
  name: satellite.name,
  orbit: { ...satellite.orbit },
  slew: { ...satellite.slew },
  ...(satellite.equipmentOptionId ? { equipmentOptionId: satellite.equipmentOptionId } : {}),
});

type CaptureAction = {
  satelliteId: string;
  commandId: string;
  cellIndex: number;
  target: GeographicLocation;
  durationSeconds: number;
  scenario: CellCaptureScenario;
};

/** Shared renderer-independent execution path for app playback and operations tests. */
export class OperationalLoop {
  readonly runtime: SimulationRuntime;
  readonly groundOperations: GroundOperations;
  readonly imageryOperations: ImageryOperations;
  readonly powerOperations: PowerOperations;
  readonly finance: CompanyFinance;
  private readonly captureActions = new Map<string, CaptureAction>();
  private readonly lastCommandedPointing = new Map<string, PointingDirection>();
  private readonly fleetById = new Map<string, SatelliteDefinition>();
  private readonly initialFleet: SatelliteDefinition[];
  private readonly stations: readonly SurfaceObject[];
  private readonly weather?: WeatherConfiguration;
  private readonly scenario: CellCaptureScenario;
  private readonly getMarket: () => CellMarketState | null;
  private readonly imageSizeBytes: number;
  private readonly predictContacts: GroundContactPredictor;
  private readonly automaticGrids = new Map<string, CellGrid>();
  private observedGroundEventCount = 0;
  private lastAutomaticRefreshAtSeconds: number | null = null;
  private observedPowerEventCount = 0;

  constructor(configuration: OperationalLoopConfiguration) {
    this.initialFleet = configuration.fleet.map(cloneSatellite);
    for (const satellite of this.initialFleet) this.fleetById.set(satellite.id, satellite);
    this.stations = configuration.stations;
    this.weather = configuration.weather ? { ...configuration.weather } : undefined;
    this.finance = configuration.finance ?? new CompanyFinance();
    this.scenario = { ...configuration.scenario };
    this.getMarket = configuration.getMarket;
    this.predictContacts = configuration.contactPredictor ?? predictGroundContactWindows;
    this.imageSizeBytes = configuration.imageSizeBytes ?? PROTOTYPE_CELL_IMAGE_SIZE_BYTES;
    this.runtime = configuration.runtime ?? new SimulationRuntime(configuration.fleet.map(({ id }) => id));
    this.groundOperations = configuration.groundOperations ?? new GroundOperations(
      configuration.fleet.map(({ id }) => id),
      this.runtime,
      configuration.contactPredictor,
    );
    this.imageryOperations = new ImageryOperations({
      storageCapacityBytesBySatellite: configuration.storageCapacityBytesBySatellite,
    });
    const powerConfigurationBySatellite = configuration.powerConfigurationBySatellite
      ?? Object.fromEntries(configuration.fleet.map(({ id }) => [id, PROTOTYPE_POWER_CONFIGURATION]));
    this.powerOperations = new PowerOperations(powerConfigurationBySatellite);
  }

  reviseGroundPlan(satelliteId: string, commands: readonly TaskEventCommand[], timeSeconds: number): number {
    return this.reviseGroundPlanWithCommittedPrefix(satelliteId, commands, timeSeconds, 0);
  }

  enableAutomaticPlanning(satelliteId: string, grid: CellGrid): string | null {
    this.requireSatellite(satelliteId);
    this.automaticGrids.set(satelliteId, grid);
    const result = this.refreshAutomaticPlan(satelliteId);
    this.lastAutomaticRefreshAtSeconds = this.runtime.elapsedSeconds;
    return result;
  }

  getFleet(): readonly SatelliteDefinition[] {
    return [...this.fleetById.values()].map(cloneSatellite);
  }

  getCellOperationalVisualization(satelliteId: string): CellOperationalVisualization {
    const ground = this.groundOperations.getSatelliteState(satelliteId);
    const runtime = this.runtime.getSatelliteState(satelliteId);
    const commands = ground.groundPlanVersion !== ground.onboardTelVersion
      ? ground.groundPlan
      : ground.onboardCommands.slice(ground.nextCommandIndex);
    const scheduledCellIndexes = commands
      .filter(command => command.cellCapture)
      .map(command => command.cellCapture!.cellIndex);
    const active = runtime.currentAction ? this.captureActions.get(runtime.currentAction.id) : undefined;
    return {
      scheduledCellIndexes,
      activeCapture: active ? { cellIndex: active.cellIndex, target: { ...active.target } } : null,
    };
  }

  /** Add an empty spacecraft to the live domain systems without disturbing the existing fleet. */
  registerSatellite(
    definition: SatelliteDefinition,
    configuration: { storageCapacityBytes: number; power: SatellitePowerConfiguration },
  ): SatelliteDefinition {
    this.validateSatelliteRegistration(definition, configuration);
    const satellite = cloneSatellite(definition);
    const { id } = satellite;

    // All inputs and IDs are checked before mutation; each registration below is then a map insertion.
    this.runtime.registerSatellite(id);
    this.groundOperations.registerSatellite(id);
    this.imageryOperations.registerSatellite(id, configuration.storageCapacityBytes);
    this.powerOperations.registerSatellite(id, configuration.power);
    this.fleetById.set(id, satellite);
    return cloneSatellite(satellite);
  }

  validateSatelliteRegistration(
    definition: SatelliteDefinition,
    configuration: { storageCapacityBytes: number; power: SatellitePowerConfiguration },
  ): void {
    this.validateSatelliteDefinition(definition);
    const { id } = definition;
    if (this.fleetById.has(id)
      || this.runtime.hasSatellite(id)
      || this.groundOperations.hasSatellite(id)
      || this.imageryOperations.hasSatellite(id)
      || this.powerOperations.hasSatellite(id)) {
      throw new Error(`Satellite is already registered in the operational loop: ${id}`);
    }
    if (!Number.isSafeInteger(configuration.storageCapacityBytes) || configuration.storageCapacityBytes <= 0) {
      throw new RangeError("Each spacecraft needs a positive whole-byte storage capacity");
    }
    validatePowerConfiguration(configuration.power);
  }

  private validateSatelliteDefinition(satellite: SatelliteDefinition): void {
    if (!satellite.id.trim() || !satellite.name.trim()) throw new Error("Spacecraft ID and name are required");
    const { altitudeKm, inclinationDeg, ascendingNodeDeg, initialPhaseDeg } = satellite.orbit;
    const { slewRateDegPerSecond, settlingTimeSeconds } = satellite.slew;
    if (![altitudeKm, inclinationDeg, ascendingNodeDeg, initialPhaseDeg, slewRateDegPerSecond, settlingTimeSeconds]
      .every(Number.isFinite)
      || altitudeKm <= 0 || inclinationDeg < 0 || inclinationDeg > 180
      || slewRateDegPerSecond <= 0 || settlingTimeSeconds < 0) {
      throw new RangeError("Spacecraft orbit or slew configuration is invalid");
    }
  }

  notifySchedulingInputsChanged(): void {
    this.refreshAutomaticPlans(true);
  }

  private reviseGroundPlanWithCommittedPrefix(
    satelliteId: string,
    commands: readonly TaskEventCommand[],
    timeSeconds: number,
    committedPrefixCount: number,
    explanation?: string,
  ): number {
    if (committedPrefixCount > 0) {
      const committedIds = new Set(commands.slice(0, committedPrefixCount).map(({ id }) => id));
      for (const [actionId, action] of this.captureActions) {
        if (action.satelliteId === satelliteId && !committedIds.has(action.commandId)) {
          this.captureActions.delete(actionId);
        }
      }
    }
    const version = this.groundOperations.reviseGroundPlan(
      satelliteId, commands, timeSeconds, committedPrefixCount, explanation,
    );
    for (const command of commands.slice(committedPrefixCount)) {
      if (!command.cellCapture) continue;
      const actionId = `tel:${satelliteId}:v${version}:${command.id}`;
      this.captureActions.set(actionId, {
        satelliteId,
        commandId: command.id,
        cellIndex: command.cellCapture.cellIndex,
        target: { ...command.cellCapture.target },
        durationSeconds: command.durationSeconds,
        scenario: { ...this.scenario },
      });
    }
    return version;
  }

  advanceBy(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Time advance must be finite and non-negative");
    const targetSeconds = this.runtime.elapsedSeconds + seconds;
    let processedRuntimeEvents = this.runtime.events.length;
    if (seconds === 0) return this.runtime.elapsedSeconds;
    while (this.runtime.elapsedSeconds < targetSeconds) {
      const now = this.runtime.elapsedSeconds;
      const nextRefreshBoundary = (Math.floor(now / PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS) + 1)
        * PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS;
      const nextFinanceBoundary = (Math.floor(now / SIMULATION_DAY_SECONDS) + 1) * SIMULATION_DAY_SECONDS;
      const end = Math.min(targetSeconds, nextRefreshBoundary, nextFinanceBoundary);
      this.groundOperations.advanceBy(end - now, [...this.fleetById.values()], this.stations,
        (startsAtSeconds, endsAtSeconds, contacts) => {
          const market = this.getMarket();
          for (const contact of contacts) {
            const contactRate = contact.station.groundStationDetails?.contactCostUsdPerMinute;
            if (contact.station.kind === "ground-station" && contactRate !== undefined) {
              this.finance.recordGroundStationContactTime(
                contact.station.id,
                startsAtSeconds,
                endsAtSeconds,
                contactRate,
              );
            }
          }
          const radioContacts = contacts.filter(contact => this.powerOperations.radioIsRunning(contact.satelliteId));
          const deliveryBoundary = market
            ? this.imageryOperations.nextDeliveryBoundary(market, startsAtSeconds, radioContacts)
            : null;
          if (market && radioContacts.length > 0) {
            this.imageryOperations.advanceDownlink(market, startsAtSeconds, endsAtSeconds, radioContacts);
          }
          for (const satellite of this.fleetById.values()) {
            const radioEnd = radioContacts.some(contact => contact.satelliteId === satellite.id)
              ? Math.min(endsAtSeconds, deliveryBoundary ?? endsAtSeconds)
              : null;
            this.powerOperations.advanceInterval(satellite, startsAtSeconds, endsAtSeconds, radioEnd);
          }
          processedRuntimeEvents = this.processRuntimeEvents(processedRuntimeEvents);
          if (this.hasNewSchedulingCompletionEvents()) this.refreshAutomaticPlans();
          const powerEvents = this.powerOperations.events;
          if (powerEvents.length > this.observedPowerEventCount) {
            this.observedPowerEventCount = powerEvents.length;
            this.refreshAutomaticPlans();
          }
        },
        (startsAtSeconds, endsAtSeconds, contacts) => this.nextPowerBoundary(startsAtSeconds, endsAtSeconds, contacts),
        (satelliteId) => !this.powerOperations.getSnapshot(
          satelliteId,
          this.fleetById.get(satelliteId)!,
          this.runtime.elapsedSeconds,
        ).depleted,
      );
      this.finance.advanceTo(end, [...this.fleetById.keys()], this.stations
        .filter(station => station.kind === "ground-station").map(station => station.id));
      processedRuntimeEvents = this.processRuntimeEvents(processedRuntimeEvents);
      if (this.runtime.elapsedSeconds === nextRefreshBoundary) this.refreshAutomaticPlans();
    }
    return this.runtime.elapsedSeconds;
  }

  enforceStorageCapacity(satelliteId: string, timeSeconds: number): number {
    const market = this.getMarket();
    return market
      ? this.imageryOperations.enforceStorageCapacity(market, satelliteId, timeSeconds).length
      : 0;
  }

  getLastCommandedPointing(satelliteId: string): PointingDirection | null {
    const pointing = this.lastCommandedPointing.get(satelliteId);
    return pointing ? { ...pointing } : null;
  }

  reset(): void {
    this.finance.reset();
    this.runtime.reset();
    this.groundOperations.reset();
    this.imageryOperations.reset();
    this.powerOperations.reset();
    this.fleetById.clear();
    for (const satellite of this.initialFleet) this.fleetById.set(satellite.id, cloneSatellite(satellite));
    this.captureActions.clear();
    this.lastCommandedPointing.clear();
    this.automaticGrids.clear();
    this.observedGroundEventCount = 0;
    this.lastAutomaticRefreshAtSeconds = null;
    this.observedPowerEventCount = 0;
    this.getMarket()?.resetPreview();
  }

  private processRuntimeEvents(fromIndex: number): number {
    const events: readonly RuntimeEvent[] = this.runtime.events;
    for (const event of events.slice(fromIndex)) {
      if (event.kind === "action-cancelled") {
        this.captureActions.delete(event.actionId);
        this.powerOperations.completeCapture(event.actionId);
        continue;
      }
      if (event.kind !== "action-completed") continue;
      const action = this.captureActions.get(event.actionId);
      if (!action) continue;
      this.captureActions.delete(event.actionId);
      this.executeCapture(action, event);
      this.powerOperations.completeCapture(event.actionId);
    }
    return events.length;
  }

  getPowerSnapshot(satelliteId: string): ReturnType<PowerOperations["getSnapshot"]> {
    const satellite = this.fleetById.get(satelliteId);
    if (!satellite) throw new Error(`Unknown satellite: ${satelliteId}`);
    return this.powerOperations.getSnapshot(satelliteId, satellite, this.runtime.elapsedSeconds);
  }

  projectScheduledEnergy(satelliteId: string, startsAtSeconds: number, endsAtSeconds: number): number {
    const satellite = this.fleetById.get(satelliteId);
    if (!satellite) throw new Error(`Unknown satellite: ${satelliteId}`);
    const configuration = this.powerOperations.getConfiguration(satelliteId);
    const snapshot = this.getPowerSnapshot(satelliteId);
    let energyWh = snapshot.energyWh;
    let cursor = Math.max(this.runtime.elapsedSeconds, startsAtSeconds);
    const end = Math.max(cursor, endsAtSeconds);
    const committed = this.groundOperations.getCommittedPrefixCommands(satelliteId);
    const activeId = this.runtime.getSatelliteState(satelliteId).currentAction?.id;
    const activities: Array<{ startsAtSeconds: number; endsAtSeconds: number; capture: boolean }> = [];
    for (const command of committed) {
      const completion = this.groundOperations.getCommandCompletionSeconds(satelliteId, command.id);
      if (completion === null || completion <= cursor || completion > end) continue;
      const actionId = `tel:${satelliteId}:v${this.groundOperations.getSatelliteState(satelliteId).groundPlanVersion}:${command.id}`;
      const rejected = actionId === activeId && this.powerOperations.hasCaptureDecision(actionId)
        && !this.powerOperations.isCaptureAdmitted(actionId);
      activities.push({
        startsAtSeconds: Math.max(cursor, completion - command.durationSeconds),
        endsAtSeconds: completion,
        capture: Boolean(command.cellCapture && !rejected),
      });
    }
    const transmittingUntil = this.powerOperations.radioIsRunning(satelliteId)
      ? Math.max(cursor, ...this.groundOperations.getActiveContacts(this.stations)
        .filter(contact => contact.satelliteId === satelliteId)
        .map(contact => contact.endsAtSeconds))
      : cursor;
    const boundaries = new Set<number>([cursor, end]);
    for (const activity of activities) {
      boundaries.add(Math.max(cursor, activity.startsAtSeconds));
      boundaries.add(Math.min(end, activity.endsAtSeconds));
    }
    if (transmittingUntil > cursor) boundaries.add(Math.min(end, transmittingUntil));
    const ordered = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index]!;
      const to = ordered[index + 1]!;
      const midpoint = (from + to) / 2;
      const capture = activities.some(activity => activity.capture
        && activity.startsAtSeconds <= midpoint && activity.endsAtSeconds > midpoint);
      const downlink = midpoint < transmittingUntil;
      const loadW = configuration.housekeepingW
        + (capture ? configuration.captureAdditionalW : 0)
        + (downlink ? configuration.downlinkAdditionalW : 0);
      energyWh = projectSatellitePower(satellite, energyWh, from, to, loadW, configuration).energyWh;
    }
    return energyWh;
  }

  private nextPowerBoundary(
    startsAtSeconds: number,
    endsAtSeconds: number,
    contacts: readonly (GroundContactWindow & { station: SurfaceObject })[],
  ): number | null {
    this.admitCurrentCaptureActions(startsAtSeconds);
    const market = this.getMarket();
    const deliveryBoundary = market
      ? this.imageryOperations.nextDeliveryBoundary(market, startsAtSeconds, contacts.filter(contact => this.powerOperations.radioIsRunning(contact.satelliteId)))
      : null;
    let next = deliveryBoundary;
    for (const satellite of this.fleetById.values()) {
      const onboardImage = market?.getImages().some(image => image.satelliteId === satellite.id && image.status === "onboard") ?? false;
      const hasContact = onboardImage && contacts.some(contact => contact.satelliteId === satellite.id
        && contact.station.groundStationDetails?.operationalStatus === "available");
      const guardWh = this.calculatePowerGuard(satellite.id, startsAtSeconds);
      this.powerOperations.updateRadio(
        satellite.id,
        hasContact,
        guardWh,
        !isEclipsedAt(satellite, startsAtSeconds + 1e-6),
      );
      const powerBoundary = this.powerOperations.nextBoundarySeconds(satellite, startsAtSeconds, endsAtSeconds, guardWh);
      if (powerBoundary !== null && (next === null || powerBoundary < next)) next = powerBoundary;
    }
    // Updating the radio can enable it at this boundary; recompute its first image completion.
    const updatedDeliveryBoundary = market
      ? this.imageryOperations.nextDeliveryBoundary(market, startsAtSeconds, contacts.filter(contact => this.powerOperations.radioIsRunning(contact.satelliteId)))
      : null;
    if (updatedDeliveryBoundary !== null && (next === null || updatedDeliveryBoundary < next)) next = updatedDeliveryBoundary;
    return next !== null && next < endsAtSeconds ? next : null;
  }

  private admitCurrentCaptureActions(startsAtSeconds: number): void {
    for (const satellite of this.fleetById.values()) {
      const active = this.runtime.getSatelliteState(satellite.id).currentAction;
      if (!active || active.kind !== "tel-command" || !this.captureActions.has(active.id)
        || this.powerOperations.hasCaptureDecision(active.id)) continue;
      this.powerOperations.beginCapture(
        satellite.id,
        satellite,
        Math.max(startsAtSeconds, active.startsAtSeconds),
        active.durationSeconds,
        active.id,
      );
    }
  }

  private calculatePowerGuard(satelliteId: string, nowSeconds: number): number {
    const satellite = this.fleetById.get(satelliteId)!;
    const configuration = this.powerOperations.getConfiguration(satelliteId);
    const committed = this.groundOperations.getCommittedPrefixCommands(satelliteId);
    const state = this.runtime.getSatelliteState(satelliteId);
    const activeCaptureId = state.currentAction?.kind === "tel-command" && state.currentAction.status === "active"
      && this.captureActions.has(state.currentAction.id) ? state.currentAction.id : null;
    if (committed.length === 0) return configuration.reserveWh;
    const preservesReserve = (initialWh: number): boolean => {
      if (initialWh < configuration.reserveWh) return false;
      let energyWh = initialWh;
      let cursor = nowSeconds;
      for (const command of committed) {
        const completion = this.groundOperations.getCommandCompletionSeconds(satelliteId, command.id);
        if (completion === null || completion <= cursor) continue;
        const commandStart = Math.max(cursor, completion - command.durationSeconds);
        energyWh = projectSatellitePower(satellite, energyWh, cursor, commandStart,
          configuration.housekeepingW, configuration).energyWh;
        if (energyWh < configuration.reserveWh) return false;
        const actionId = `tel:${satelliteId}:v${this.groundOperations.getSatelliteState(satelliteId).groundPlanVersion}:${command.id}`;
        const rejected = actionId === activeCaptureId && this.powerOperations.hasCaptureDecision(actionId)
          && !this.powerOperations.isCaptureAdmitted(actionId);
        const loadW = configuration.housekeepingW
          + (command.cellCapture && !rejected ? configuration.captureAdditionalW : 0);
        const projection = projectSatellitePower(satellite, energyWh, commandStart, completion,
          loadW, configuration);
        if (projection.minimumWh < configuration.reserveWh) return false;
        energyWh = projection.energyWh;
        cursor = completion;
      }
      return true;
    };
    if (!preservesReserve(configuration.capacityWh)) return configuration.capacityWh + 1;
    let low = configuration.reserveWh;
    let high = configuration.capacityWh;
    for (let index = 0; index < 32; index += 1) {
      const middle = (low + high) / 2;
      if (preservesReserve(middle)) high = middle;
      else low = middle;
    }
    return high;
  }

  private refreshAutomaticPlans(force = false): void {
    const now = this.runtime.elapsedSeconds;
    if (!force && this.lastAutomaticRefreshAtSeconds === now) return;
    this.lastAutomaticRefreshAtSeconds = now;
    for (const satelliteId of this.automaticGrids.keys()) this.refreshAutomaticPlan(satelliteId);
  }

  private hasNewSchedulingCompletionEvents(): boolean {
    const events = this.groundOperations.events;
    const newEvents = events.slice(this.observedGroundEventCount);
    this.observedGroundEventCount = events.length;
    return newEvents.some(event => event.kind === "tel-command-completed"
      || event.kind === "cell-capture-completed" || event.kind === "cell-capture-failed");
  }

  private refreshAutomaticPlan(satelliteId: string): string | null {
    const satellite = this.fleetById.get(satelliteId);
    const grid = this.automaticGrids.get(satelliteId);
    const market = this.getMarket();
    if (!satellite || !grid || !market) return "Automatic scheduling is waiting for the cell market.";
    const now = this.runtime.elapsedSeconds;
    const windows = this.predictContacts(satellite, this.stations, now, now + 48 * 60 * 60, {
      sampleStepSeconds: 120,
      maximumWindowsPerStation: 4,
    });
    const episodes: GroundContactWindow[] = [];
    for (const window of [...windows].sort((left, right) => left.startsAtSeconds - right.startsAtSeconds)) {
      const previous = episodes.at(-1);
      if (previous && window.startsAtSeconds <= previous.endsAtSeconds) {
        previous.endsAtSeconds = Math.max(previous.endsAtSeconds, window.endsAtSeconds);
      } else episodes.push({ ...window });
    }
    const distinct = episodes.filter(window => window.startsAtSeconds >= now
      && !window.continuesBeforeWindow && window.endsAtSeconds > now).slice(0, 2);
    // Keep the current ground TEL intact when the forecast has no next contact pair.
    if (distinct.length < 2) return null;
    const [uploadContact, nextContact] = distinct as [GroundContactWindow, GroundContactWindow];
    const committed = this.groundOperations.getCommittedPrefixCommands(satelliteId);
    const committedCompletion = committed.length > 0
      ? this.groundOperations.getCommandCompletionSeconds(satelliteId, committed.at(-1)!.id)
      : null;
    const startsAtSeconds = Math.max(uploadContact.startsAtSeconds, committedCompletion ?? uploadContact.startsAtSeconds);
    if (startsAtSeconds >= nextContact.startsAtSeconds) return null;

    const projectedCollected = new Map<number, number>();
    let initialPointing = this.lastCommandedPointing.get(satelliteId)
      ?? nadirPointingAt(satellite, startsAtSeconds);
    for (const command of committed) {
      if (!command.cellCapture) continue;
      const completesAt = this.groundOperations.getCommandCompletionSeconds(satelliteId, command.id);
      if (completesAt === null) continue;
      projectedCollected.set(grid.ids[command.cellCapture.cellIndex]!, completesAt);
      initialPointing = cellLookDirectionAt(satellite, command.cellCapture.target, completesAt);
    }
    const schedule = generateBoundedCellSchedule({
      satellite,
      grid,
      market,
      startsAtSeconds,
      endsAtSeconds: nextContact.startsAtSeconds,
      scenario: this.scenario,
      initialPointing,
      projectedLastCollectedAtByCell: projectedCollected,
      powerConfiguration: this.powerOperations.getConfiguration(satelliteId),
      initialEnergyWh: this.projectScheduledEnergy(satelliteId, now, startsAtSeconds),
      ...(this.weather ? { weather: this.weather } : {}),
    });
    const nextVersion = this.groundOperations.getSatelliteState(satelliteId).groundPlanVersion + 1;
    const versionedPrefix = committed.map(command => ({ ...command }));
    const versionedSuffix = schedule.commands.map((command, index) => ({
      ...command,
      id: `auto-v${nextVersion}-${index}-${command.id}`,
    }));
    const previousPlan = this.groundOperations.getSatelliteState(satelliteId);
    const previousTargets = previousPlan.groundPlan.slice(previousPlan.groundPlanCommittedPrefixCount)
      .flatMap(command => command.cellCapture ? [command.cellCapture.cellIndex] : []);
    const changedAt = schedule.decisions.findIndex((decision, index) =>
      previousTargets[index] !== undefined && previousTargets[index] !== decision.cellIndex);
    const explanation = changedAt >= 0
      ? `Tentative capture ${changedAt + 1} changed to cell ${schedule.decisions[changedAt]!.cellId} after comparing feasible sequences.`
      : schedule.search?.improvedOverGreedy
        ? "Bounded search found more projected priority than the greedy fallback."
        : undefined;
    this.reviseGroundPlanWithCommittedPrefix(
      satelliteId,
      [...versionedPrefix, ...versionedSuffix],
      now,
      versionedPrefix.length,
      explanation,
    );
    return null;
  }

  private requireSatellite(satelliteId: string): void {
    if (!this.fleetById.has(satelliteId)) throw new Error(`Unknown satellite: ${satelliteId}`);
  }

  private executeCapture(action: CaptureAction, event: RuntimeEvent): void {
    const satellite = this.fleetById.get(action.satelliteId);
    if (!satellite) return;
    const actionStartSeconds = event.timeSeconds - action.durationSeconds;
    const previousPointing = this.lastCommandedPointing.get(action.satelliteId)
      ?? nadirPointingAt(satellite, actionStartSeconds);
    const feasibility = evaluateCellCaptureOpportunity({
      satellite,
      target: action.target,
      previousPointing,
      startsAtSeconds: actionStartSeconds,
      scenario: action.scenario,
    });
    const timingMatches = Math.abs(feasibility.completesAtSeconds - event.timeSeconds) < 1;
    const market = this.getMarket();
    const cloudPercent = this.weather
      ? averageCloudCoverPercent(this.weather, action.cellIndex,
        feasibility.collectionStartsAtSeconds, feasibility.completesAtSeconds)
      : null;
    let success = false;
    let detail: string;
    const powerReason = this.powerOperations.captureRejectionReason(event.actionId);
    if (powerReason) {
      detail = `Cell capture failed: ${powerReason} No image was created and cell recovery did not reset.`;
    } else if (!feasibility.feasible) {
      detail = `Cell capture failed: ${feasibility.reason.replaceAll("-", " ")}. No image was created and cell recovery did not reset.`;
    } else if (!timingMatches) {
      detail = "Cell capture failed: the executed command timing no longer matches the feasible slew and collection window. No image was created and cell recovery did not reset.";
    } else if (!market) {
      detail = "Cell capture failed: market imagery state is not available. No image was created and cell recovery did not reset.";
    } else if (cloudPercent !== null && cloudPercent > (this.weather?.usableThresholdPercent ?? PROTOTYPE_CLOUD_THRESHOLD_PERCENT)) {
      detail = `Cell capture failed: cloud cover averaged ${cloudPercent}% during collection (usable at or below ${this.weather?.usableThresholdPercent ?? PROTOTYPE_CLOUD_THRESHOLD_PERCENT}%). No image was created and cell recovery did not reset.`;
    } else {
      try {
        const image = market.completeCellCapture(
          action.cellIndex,
          action.satelliteId,
          `${event.actionId}:image`,
          event.timeSeconds,
          this.imageSizeBytes,
        );
        const deletions = this.imageryOperations.enforceStorageCapacity(market, action.satelliteId, event.timeSeconds);
        const deletionNote = deletions.length > 0
          ? ` Storage pressure deleted ${deletions.length} lowest-retention image(s); no revenue was realized for them.`
          : "";
        detail = `Cell capture succeeded for C${image.cellId.toString().padStart(7, "0")}; image stored onboard with ${image.valuePotentialUsd.toFixed(2)} USD value potential. No cash credited.${deletionNote}`;
        success = true;
      } catch (error) {
        detail = `Cell capture failed: ${error instanceof Error ? error.message : "image creation failed"}. No image was committed.`;
      }
    }
    if (!powerReason) this.lastCommandedPointing.set(action.satelliteId, cellLookDirectionAt(satellite, action.target, event.timeSeconds));
    this.groundOperations.recordCellCaptureOutcome(action.satelliteId, action.commandId, event.timeSeconds, success, detail);
  }
}
