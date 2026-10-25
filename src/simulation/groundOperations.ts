import { predictGroundContactWindows, type GroundContactWindow } from "./contacts.ts";
import type { SatelliteDefinition, SurfaceObject } from "./model.ts";
import type { RuntimeEvent } from "./runtime.ts";
import { SimulationRuntime } from "./runtime.ts";

export type TaskEventCommand = {
  id: string;
  label: string;
  durationSeconds: number;
  cellCapture?: {
    cellIndex: number;
    target: { latitudeDeg: number; longitudeDeg: number };
    forecastCloudCoverPercent?: number;
  };
};

export type GroundContactPredictor = typeof predictGroundContactWindows;

export type GroundOperationsEventKind =
  | "ground-contact-started"
  | "ground-contact-ended"
  | "ground-plan-revised"
  | "tel-uploaded"
  | "tel-command-completed"
  | "cell-capture-completed"
  | "cell-capture-failed"
  | "tel-exhausted";

export type GroundOperationsEvent = {
  id: string;
  kind: GroundOperationsEventKind;
  satelliteId: string;
  timeSeconds: number;
  stationId?: string;
  planVersion?: number;
  commandId?: string;
  detail: string;
};

export type SatelliteGroundOperationsState = {
  satelliteId: string;
  groundPlanVersion: number;
  groundPlan: TaskEventCommand[];
  groundPlanCommittedPrefixCount: number;
  onboardTelVersion: number | null;
  onboardCommands: TaskEventCommand[];
  nextCommandIndex: number;
  onboardCoverageEndsAtSeconds: number | null;
  activeStationIds: string[];
  mode: "ready" | "standby";
  standbyCause: "no-uploaded-tel" | "tel-exhausted" | null;
};

export type GroundStationAntennaState = {
  ownerSatelliteId: string | null;
  waitingSatelliteIds: string[];
};

type MutableSatelliteGroundOperationsState = SatelliteGroundOperationsState;

const compareIds = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/** Ground plan and onboard TEL state, separate from the orbit and renderer. */
export class GroundOperations {
  private readonly satelliteState = new Map<string, MutableSatelliteGroundOperationsState>();
  private readonly initialSatelliteIds = new Set<string>();
  private readonly eventLog: GroundOperationsEvent[] = [];
  private readonly runtimeActionCommands = new Map<string, {
    satelliteId: string;
    planVersion: number;
    commandId: string;
  }>();
  /** Geometric access can wait for the station antenna currently serving another spacecraft. */
  private readonly geometricContacts = new Map<string, Map<string, GroundContactWindow>>();
  private readonly activeContacts = new Map<string, Map<string, GroundContactWindow>>();
  private readonly antennaOwners = new Map<string, string>();
  private eventSequence = 0;
  private readonly runtime: SimulationRuntime;
  private readonly predictContacts: GroundContactPredictor;

  constructor(
    satelliteIds: readonly string[],
    runtime: SimulationRuntime,
    predictContacts: GroundContactPredictor = predictGroundContactWindows,
  ) {
    this.runtime = runtime;
    this.predictContacts = predictContacts;
    for (const satelliteId of satelliteIds) {
      if (!satelliteId.trim() || this.satelliteState.has(satelliteId)) {
        throw new Error(`Invalid or duplicate satellite ID: ${satelliteId}`);
      }
      this.satelliteState.set(satelliteId, this.createSatelliteState(satelliteId));
      this.initialSatelliteIds.add(satelliteId);
    }
  }

  hasSatellite(satelliteId: string): boolean {
    return this.satelliteState.has(satelliteId);
  }

  registerSatellite(satelliteId: string): void {
    if (!satelliteId.trim() || this.satelliteState.has(satelliteId)) {
      throw new Error(`Invalid or duplicate satellite ID: ${satelliteId}`);
    }
    this.satelliteState.set(satelliteId, this.createSatelliteState(satelliteId));
  }

  /** Advance time while processing every predicted contact edge in the interval. */
  advanceBy(
    seconds: number,
    fleet: readonly SatelliteDefinition[],
    stations: readonly SurfaceObject[],
    onContactInterval?: (startsAtSeconds: number, endsAtSeconds: number, contacts: readonly (GroundContactWindow & { station: SurfaceObject })[]) => void,
    nextExternalBoundary?: (startsAtSeconds: number, endsAtSeconds: number, contacts: readonly (GroundContactWindow & { station: SurfaceObject })[]) => number | null,
    canUploadAtContact?: (satelliteId: string) => boolean,
  ): number {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Time advance must be finite and non-negative");
    const startSeconds = this.runtime.elapsedSeconds;
    const endSeconds = startSeconds + seconds;
    if (!Number.isFinite(endSeconds)) throw new RangeError("Simulation time must remain finite");
    if (seconds === 0) return endSeconds;

    const edges: Array<{ timeSeconds: number; kind: "start" | "end"; contact: GroundContactWindow }> = [];
    for (const satellite of fleet) {
      const windows = this.predictContacts(satellite, stations, startSeconds, endSeconds, {
        sampleStepSeconds: 120,
      });
      for (const contact of windows) {
        edges.push({ timeSeconds: contact.startsAtSeconds, kind: "start", contact });
        if (!contact.continuesAfterWindow) {
          edges.push({ timeSeconds: contact.endsAtSeconds, kind: "end", contact });
        }
      }
    }
    edges.sort((left, right) =>
      left.timeSeconds - right.timeSeconds
      || (left.kind === right.kind ? 0 : left.kind === "end" ? -1 : 1)
      || left.contact.satelliteId.localeCompare(right.contact.satelliteId)
      || left.contact.stationId.localeCompare(right.contact.stationId),
    );

    let observedEventCount = this.runtime.events.length;
    let intervalStartSeconds = startSeconds;
    let edgeIndex = 0;
    while (true) {
      const now = this.runtime.elapsedSeconds;
      const nextContactEdge = edges[edgeIndex]?.timeSeconds ?? Number.POSITIVE_INFINITY;
      const nextActionBoundary = this.runtime.nextActionBoundaryAtOrBefore(endSeconds) ?? Number.POSITIVE_INFINITY;
      const currentContacts = this.getActiveContacts(stations);
      const externalBoundary = nextExternalBoundary?.(now, endSeconds, currentContacts) ?? Number.POSITIVE_INFINITY;
      if (externalBoundary <= now) throw new Error("External simulation boundary must move forward");
      const nextBoundary = Math.min(nextContactEdge, nextActionBoundary, externalBoundary, endSeconds);

      if (nextBoundary > now) {
        this.runtime.advanceBy(nextBoundary - now);
        this.observeRuntimeEvents(this.runtime.events.slice(observedEventCount));
        observedEventCount = this.runtime.events.length;
        onContactInterval?.(intervalStartSeconds, nextBoundary, this.getActiveContacts(stations));
        intervalStartSeconds = nextBoundary;
      } else if (nextBoundary < now) {
        throw new Error("Ground-operation boundary moved behind simulation time");
      }

      const boundaryEdges: typeof edges = [];
      while (edgeIndex < edges.length && edges[edgeIndex]!.timeSeconds === nextBoundary) {
        boundaryEdges.push(edges[edgeIndex++]!);
      }
      const edgesBySatellite = new Map<string, typeof edges>();
      for (const edge of boundaryEdges) {
        const satelliteEdges = edgesBySatellite.get(edge.contact.satelliteId) ?? [];
        satelliteEdges.push(edge);
        edgesBySatellite.set(edge.contact.satelliteId, satelliteEdges);
      }
      const hadActiveContact = new Map([...this.activeContacts].map(([id, contacts]) => [id, contacts.size > 0]));
      const affectedStations = new Set<string>();
      for (const [satelliteId, satelliteEdges] of edgesBySatellite) {
        for (const edge of satelliteEdges) {
          affectedStations.add(edge.contact.stationId);
          const contacts = this.geometricContacts.get(satelliteId)!;
          if (edge.kind === "end") contacts.delete(edge.contact.stationId);
          else if (!contacts.has(edge.contact.stationId)) contacts.set(edge.contact.stationId, edge.contact);
        }
      }

      const newlyAssigned: Array<{ satelliteId: string; contact: GroundContactWindow }> = [];
      for (const stationId of affectedStations) {
        let ownerId = this.antennaOwners.get(stationId);
        if (ownerId && !this.geometricContacts.get(ownerId)?.has(stationId)) {
          const previous = this.activeContacts.get(ownerId)?.get(stationId);
          if (previous) {
            this.recordContactEnded({ ...previous, endsAtSeconds: nextBoundary });
            this.activeContacts.get(ownerId)?.delete(stationId);
          }
          this.antennaOwners.delete(stationId);
          ownerId = undefined;
        }
        if (ownerId) continue;

        const candidates = [...this.geometricContacts.entries()]
          .map(([, contacts]) => contacts.get(stationId))
          .filter((contact): contact is GroundContactWindow => contact !== undefined)
          .sort((left, right) => left.startsAtSeconds - right.startsAtSeconds
            || compareIds(left.satelliteId, right.satelliteId));
        const selected = candidates[0];
        if (!selected) continue;

        const linkContact: GroundContactWindow = {
          ...selected,
          startsAtSeconds: nextBoundary,
          continuesBeforeWindow: false,
        };
        this.antennaOwners.set(stationId, selected.satelliteId);
        this.recordContactStarted(linkContact);
        newlyAssigned.push({ satelliteId: selected.satelliteId, contact: linkContact });
      }

      for (const { satelliteId, contact } of newlyAssigned) {
        if (hadActiveContact.get(satelliteId)) continue;
        if (canUploadAtContact?.(satelliteId) !== false) {
          this.uploadAtContact(contact, this.runtime.elapsedSeconds);
        }
        this.observeRuntimeEvents(this.runtime.events.slice(observedEventCount));
        observedEventCount = this.runtime.events.length;
      }

      if (this.runtime.elapsedSeconds === endSeconds
        && edgeIndex >= edges.length
        && this.runtime.nextActionBoundaryAtOrBefore(endSeconds) === null) break;
    }
    return this.runtime.elapsedSeconds;
  }

  get events(): readonly GroundOperationsEvent[] {
    return this.eventLog.map((event) => ({ ...event }));
  }

  recordCellCaptureOutcome(
    satelliteId: string,
    commandId: string,
    timeSeconds: number,
    success: boolean,
    detail: string,
  ): void {
    this.requireSatellite(satelliteId);
    this.validateTime(timeSeconds);
    this.recordEvent({
      kind: success ? "cell-capture-completed" : "cell-capture-failed",
      satelliteId,
      commandId,
      timeSeconds,
      detail,
    });
  }

  getSatelliteState(satelliteId: string): SatelliteGroundOperationsState {
    const state = this.requireSatellite(satelliteId);
    return {
      ...state,
      groundPlan: state.groundPlan.map((command) => ({ ...command })),
      onboardCommands: state.onboardCommands.map((command) => ({ ...command })),
      activeStationIds: [...(this.activeContacts.get(satelliteId)?.keys() ?? [])],
    };
  }

  getActiveContacts(stations: readonly SurfaceObject[] = []): Array<GroundContactWindow & { station: SurfaceObject }> {
    return [...this.activeContacts.values()].flatMap(contacts => [...contacts.values()]).flatMap(contact => {
      const station = stations.find(site => site.id === contact.stationId);
      return station ? [{ ...contact, station }] : [];
    });
  }

  getAntennaState(stationId: string): GroundStationAntennaState {
    const ownerSatelliteId = this.antennaOwners.get(stationId) ?? null;
    const waitingSatelliteIds = [...this.geometricContacts.entries()]
      .map(([satelliteId, contacts]) => ({ satelliteId, contact: contacts.get(stationId) }))
      .filter((entry): entry is { satelliteId: string; contact: GroundContactWindow } =>
        entry.contact !== undefined && entry.satelliteId !== ownerSatelliteId,
      )
      .sort((left, right) => left.contact.startsAtSeconds - right.contact.startsAtSeconds
        || compareIds(left.satelliteId, right.satelliteId))
      .map(({ satelliteId }) => satelliteId);
    return { ownerSatelliteId, waitingSatelliteIds };
  }

  getGeometricStationIds(satelliteId: string): string[] {
    this.requireSatellite(satelliteId);
    return [...(this.geometricContacts.get(satelliteId)?.keys() ?? [])];
  }

  hasPendingGroundPlan(satelliteId: string): boolean {
    const state = this.requireSatellite(satelliteId);
    return state.groundPlanVersion > 0 && state.groundPlanVersion !== state.onboardTelVersion;
  }

  /** Commands already committed onboard: active work plus the next not-yet-started capture. */
  getCommittedPrefixCommands(satelliteId: string): TaskEventCommand[] {
    const state = this.requireSatellite(satelliteId);
    const active = this.runtime.getSatelliteState(satelliteId).currentAction;
    if (!active) return [];
    const activeMapping = this.runtimeActionCommands.get(active.id);
    if (!activeMapping) return [];
    const activeIndex = state.onboardCommands.findIndex(command => command.id === activeMapping.commandId);
    if (activeIndex < state.nextCommandIndex) return [];
    const activeIsCapture = state.onboardCommands[activeIndex]?.cellCapture !== undefined;
    const capturesToKeep = activeIsCapture ? 2 : 1;
    let capturesFound = 0;
    let endIndex = activeIndex;
    for (let index = activeIndex; index < state.onboardCommands.length; index += 1) {
      endIndex = index;
      if (state.onboardCommands[index]!.cellCapture) {
        capturesFound += 1;
        if (capturesFound === capturesToKeep) break;
      }
    }
    if (capturesFound < capturesToKeep) endIndex = activeIndex;
    return state.onboardCommands.slice(activeIndex, endIndex + 1).map(command => ({ ...command }));
  }

  getCommandCompletionSeconds(satelliteId: string, commandId: string): number | null {
    const mapping = [...this.runtimeActionCommands.values()].find(command =>
      command.satelliteId === satelliteId && command.commandId === commandId);
    if (!mapping) return null;
    const runtimeState = this.runtime.getSatelliteState(satelliteId);
    const action = [runtimeState.currentAction, ...runtimeState.queuedActions]
      .find(item => item?.id && this.runtimeActionCommands.get(item.id)?.commandId === commandId);
    return action?.completesAtSeconds ?? null;
  }

  /** Revise the ground copy only; the onboard TEL is untouched until contact. */
  reviseGroundPlan(
    satelliteId: string,
    commands: readonly TaskEventCommand[],
    timeSeconds: number,
    committedPrefixCount = 0,
    explanation?: string,
  ): number {
    const state = this.requireSatellite(satelliteId);
    this.validateTime(timeSeconds);
    const copy = commands.map((command) => ({ ...command }));
    if (copy.some((command) =>
      !command.id.trim()
      || !command.label.trim()
      || !Number.isFinite(command.durationSeconds)
      || command.durationSeconds <= 0
    )) {
      throw new Error("TEL commands need an ID, label, and positive finite duration");
    }
    if (new Set(copy.map((command) => command.id)).size !== copy.length) {
      throw new Error("TEL command IDs must be unique within a plan");
    }
    if (!Number.isInteger(committedPrefixCount) || committedPrefixCount < 0 || committedPrefixCount > copy.length) {
      throw new RangeError("Committed TEL prefix count must refer to commands in the revised plan");
    }
    const totalDurationSeconds = copy.reduce((total, command) => total + command.durationSeconds, 0);
    if (!Number.isFinite(totalDurationSeconds)) throw new RangeError("TEL duration must remain finite");

    state.groundPlanVersion += 1;
    state.groundPlan = copy;
    state.groundPlanCommittedPrefixCount = committedPrefixCount;
    this.recordEvent({
      kind: "ground-plan-revised",
      satelliteId,
      timeSeconds,
      planVersion: state.groundPlanVersion,
      detail: `Ground plan revised to version ${state.groundPlanVersion} with ${copy.length} command(s).${explanation ? ` ${explanation}` : ""}`,
    });
    return state.groundPlanVersion;
  }

  recordContactStarted(contact: GroundContactWindow): boolean {
    const active = this.activeContacts.get(contact.satelliteId);
    if (!active) this.requireSatellite(contact.satelliteId);
    if (active!.has(contact.stationId)) return false;
    active!.set(contact.stationId, contact);
    this.recordEvent({
      kind: "ground-contact-started",
      satelliteId: contact.satelliteId,
      stationId: contact.stationId,
      timeSeconds: contact.startsAtSeconds,
      detail: `Contact began at ${contact.stationName}.`,
    });
    return true;
  }

  recordContactEnded(contact: GroundContactWindow): void {
    const active = this.activeContacts.get(contact.satelliteId);
    if (!active || !active.delete(contact.stationId)) return;
    this.recordEvent({
      kind: "ground-contact-ended",
      satelliteId: contact.satelliteId,
      stationId: contact.stationId,
      timeSeconds: contact.endsAtSeconds,
      detail: `Contact ended at ${contact.stationName}.`,
    });
  }

  /** Upload the latest ground plan at the start of a predicted available contact. */
  uploadAtContact(contact: GroundContactWindow, timeSeconds: number): boolean {
    const state = this.requireSatellite(contact.satelliteId);
    this.validateTime(timeSeconds);
    if (
      timeSeconds < contact.startsAtSeconds
      || timeSeconds > contact.endsAtSeconds
      || contact.endsAtSeconds <= contact.startsAtSeconds
      || !this.activeContacts.get(contact.satelliteId)?.has(contact.stationId)
    ) {
      throw new Error("TEL upload requires an active ground-station contact");
    }
    if (!this.hasPendingGroundPlan(contact.satelliteId)) return false;

    const committedPrefix = state.groundPlanCommittedPrefixCount > 0
      ? this.getCommittedPrefixCommands(contact.satelliteId)
      : [];
    const preservedCommandIds = new Set(committedPrefix.map(({ id }) => id));
    const preservedActionIds = new Set<string>();
    if (preservedCommandIds.size > 0) {
      for (const [actionId, mapping] of this.runtimeActionCommands) {
        if (mapping.satelliteId === contact.satelliteId && preservedCommandIds.has(mapping.commandId)) {
          preservedActionIds.add(actionId);
          mapping.planVersion = state.groundPlanVersion;
        } else if (mapping.satelliteId === contact.satelliteId) {
          this.runtimeActionCommands.delete(actionId);
        }
      }
      this.runtime.cancelQueuedActionsExcept(contact.satelliteId, preservedActionIds);
    } else {
      this.runtime.cancelQueuedActions(contact.satelliteId);
      for (const [actionId, command] of this.runtimeActionCommands) {
        if (command.satelliteId === contact.satelliteId) this.runtimeActionCommands.delete(actionId);
      }
    }
    state.onboardTelVersion = state.groundPlanVersion;
    const revisedSuffix = state.groundPlan.slice(state.groundPlanCommittedPrefixCount);
    state.onboardCommands = [...committedPrefix, ...revisedSuffix].map((command) => ({ ...command }));
    state.nextCommandIndex = 0;
    state.mode = state.onboardCommands.length > 0 ? "ready" : "standby";
    state.standbyCause = state.mode === "standby" ? "tel-exhausted" : null;
    this.recordEvent({
      kind: "tel-uploaded",
      satelliteId: contact.satelliteId,
      stationId: contact.stationId,
      timeSeconds,
      planVersion: state.onboardTelVersion,
      detail: `TEL version ${state.onboardTelVersion} uploaded at ${contact.stationName}.`,
    });
    for (const command of revisedSuffix) {
      const actionId = `tel:${contact.satelliteId}:v${state.onboardTelVersion}:${command.id}`;
      this.runtimeActionCommands.set(actionId, {
        satelliteId: contact.satelliteId,
        planVersion: state.onboardTelVersion,
        commandId: command.id,
      });
      this.runtime.queueAction(
        contact.satelliteId,
        actionId,
        "tel-command",
        command.durationSeconds,
      );
    }
    const runtimeState = this.runtime.getSatelliteState(contact.satelliteId);
    state.onboardCoverageEndsAtSeconds = runtimeState.queuedActions.at(-1)?.completesAtSeconds
      ?? runtimeState.currentAction?.completesAtSeconds
      ?? null;
    if (state.mode === "standby") this.recordExhaustion(state, timeSeconds);
    return true;
  }

  /** Apply action completions from the shared runtime to the current onboard TEL. */
  observeRuntimeEvents(events: readonly RuntimeEvent[]): void {
    for (const event of events) {
      if (event.kind === "action-cancelled") {
        this.runtimeActionCommands.delete(event.actionId);
        continue;
      }
      if (event.kind !== "action-completed") continue;
      const command = this.runtimeActionCommands.get(event.actionId);
      if (!command) continue;
      const state = this.requireSatellite(command.satelliteId);
      if (state.onboardTelVersion !== command.planVersion) continue;
      const nextCommand = state.onboardCommands[state.nextCommandIndex];
      if (nextCommand?.id !== command.commandId) continue;
      this.completeNextCommand(command.satelliteId, event.timeSeconds);
      this.runtimeActionCommands.delete(event.actionId);
    }
  }

  /** Called by the action executor when the current onboard command completes. */
  completeNextCommand(satelliteId: string, timeSeconds: number): TaskEventCommand {
    const state = this.requireSatellite(satelliteId);
    this.validateTime(timeSeconds);
    const command = state.onboardCommands[state.nextCommandIndex];
    if (!command || state.mode === "standby") {
      throw new Error(state.standbyCause === "no-uploaded-tel"
        ? "No TEL is uploaded"
        : "The onboard TEL is exhausted");
    }

    state.nextCommandIndex += 1;
    this.recordEvent({
      kind: "tel-command-completed",
      satelliteId,
      timeSeconds,
      planVersion: state.onboardTelVersion ?? undefined,
      commandId: command.id,
      detail: `Onboard command completed: ${command.label}.`,
    });
    if (state.nextCommandIndex >= state.onboardCommands.length) {
      state.mode = "standby";
      state.standbyCause = "tel-exhausted";
      this.recordExhaustion(state, timeSeconds);
    }
    return { ...command };
  }

  reset(): void {
    this.eventLog.length = 0;
    this.eventSequence = 0;
    this.runtimeActionCommands.clear();
    for (const satelliteId of this.satelliteState.keys()) {
      if (!this.initialSatelliteIds.has(satelliteId)) {
        this.satelliteState.delete(satelliteId);
        this.geometricContacts.delete(satelliteId);
        this.activeContacts.delete(satelliteId);
      }
    }
    for (const state of this.satelliteState.values()) {
      state.groundPlanVersion = 0;
      state.groundPlan = [];
      state.groundPlanCommittedPrefixCount = 0;
      state.onboardTelVersion = null;
      state.onboardCommands = [];
      state.nextCommandIndex = 0;
      state.onboardCoverageEndsAtSeconds = null;
      this.activeContacts.get(state.satelliteId)?.clear();
      this.geometricContacts.get(state.satelliteId)?.clear();
      state.mode = "standby";
      state.standbyCause = "no-uploaded-tel";
    }
    this.antennaOwners.clear();
  }

  private requireSatellite(satelliteId: string): MutableSatelliteGroundOperationsState {
    const state = this.satelliteState.get(satelliteId);
    if (!state) throw new Error(`Unknown satellite: ${satelliteId}`);
    return state;
  }

  private createSatelliteState(satelliteId: string): MutableSatelliteGroundOperationsState {
    this.geometricContacts.set(satelliteId, new Map());
    this.activeContacts.set(satelliteId, new Map());
    return {
      satelliteId,
      groundPlanVersion: 0,
      groundPlan: [],
      groundPlanCommittedPrefixCount: 0,
      onboardTelVersion: null,
      onboardCommands: [],
      nextCommandIndex: 0,
      onboardCoverageEndsAtSeconds: null,
      activeStationIds: [],
      mode: "standby",
      standbyCause: "no-uploaded-tel",
    };
  }

  private validateTime(timeSeconds: number): void {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      throw new RangeError("Ground operations time must be finite and non-negative");
    }
  }

  private recordExhaustion(state: MutableSatelliteGroundOperationsState, timeSeconds: number): void {
    this.recordEvent({
      kind: "tel-exhausted",
      satelliteId: state.satelliteId,
      timeSeconds,
      planVersion: state.onboardTelVersion ?? undefined,
      detail: state.onboardTelVersion === null
        ? "Satellite is in Standby because no TEL has been uploaded."
        : `TEL version ${state.onboardTelVersion} is exhausted; satellite entered Standby.`,
    });
  }

  private recordEvent(
    event: Omit<GroundOperationsEvent, "id">,
  ): void {
    this.eventLog.push({
      ...event,
      id: `ground-ops-${this.eventSequence}`,
    });
    this.eventSequence += 1;
  }
}
