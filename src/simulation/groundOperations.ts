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
  onboardTelVersion: number | null;
  onboardCommands: TaskEventCommand[];
  nextCommandIndex: number;
  onboardCoverageEndsAtSeconds: number | null;
  activeStationIds: string[];
  mode: "ready" | "standby";
  standbyCause: "no-uploaded-tel" | "tel-exhausted" | null;
};

type MutableSatelliteGroundOperationsState = SatelliteGroundOperationsState;

/** Ground plan and onboard TEL state, separate from the orbit and renderer. */
export class GroundOperations {
  private readonly satelliteState = new Map<string, MutableSatelliteGroundOperationsState>();
  private readonly eventLog: GroundOperationsEvent[] = [];
  private readonly runtimeActionCommands = new Map<string, {
    satelliteId: string;
    planVersion: number;
    commandId: string;
  }>();
  private readonly activeContacts = new Map<string, Map<string, GroundContactWindow>>();
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
      this.satelliteState.set(satelliteId, {
        satelliteId,
        groundPlanVersion: 0,
        groundPlan: [],
        onboardTelVersion: null,
        onboardCommands: [],
        nextCommandIndex: 0,
        onboardCoverageEndsAtSeconds: null,
        activeStationIds: [],
        mode: "standby",
        standbyCause: "no-uploaded-tel",
      });
      this.activeContacts.set(satelliteId, new Map());
    }
  }

  /** Advance time while processing every predicted contact edge in the interval. */
  advanceBy(
    seconds: number,
    fleet: readonly SatelliteDefinition[],
    stations: readonly SurfaceObject[],
    onContactInterval?: (startsAtSeconds: number, endsAtSeconds: number, contacts: readonly (GroundContactWindow & { station: SurfaceObject })[]) => void,
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
      const nextBoundary = Math.min(nextContactEdge, nextActionBoundary, endSeconds);

      if (nextBoundary > now) {
        this.runtime.advanceBy(nextBoundary - now);
        this.observeRuntimeEvents(this.runtime.events.slice(observedEventCount));
        observedEventCount = this.runtime.events.length;
        onContactInterval?.(intervalStartSeconds, nextBoundary, this.getActiveContacts(stations));
        intervalStartSeconds = nextBoundary;
      } else if (nextBoundary < now) {
        throw new Error("Ground-operation boundary moved behind simulation time");
      }

      while (edgeIndex < edges.length && edges[edgeIndex]!.timeSeconds === nextBoundary) {
        const edge = edges[edgeIndex++]!;
        if (edge.kind === "start") {
          // A window that began before this advance is not a new upload opportunity.
          // The first call can still initialize an already-active contact.
          if (this.recordContactStarted(edge.contact)) {
            this.uploadAtContact(edge.contact, this.runtime.elapsedSeconds);
            this.observeRuntimeEvents(this.runtime.events.slice(observedEventCount));
            observedEventCount = this.runtime.events.length;
          }
        } else {
          this.recordContactEnded(edge.contact);
        }
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

  hasPendingGroundPlan(satelliteId: string): boolean {
    const state = this.requireSatellite(satelliteId);
    return state.groundPlanVersion > 0 && state.groundPlanVersion !== state.onboardTelVersion;
  }

  /** Revise the ground copy only; the onboard TEL is untouched until contact. */
  reviseGroundPlan(
    satelliteId: string,
    commands: readonly TaskEventCommand[],
    timeSeconds: number,
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
    const totalDurationSeconds = copy.reduce((total, command) => total + command.durationSeconds, 0);
    if (!Number.isFinite(totalDurationSeconds)) throw new RangeError("TEL duration must remain finite");

    state.groundPlanVersion += 1;
    state.groundPlan = copy;
    this.recordEvent({
      kind: "ground-plan-revised",
      satelliteId,
      timeSeconds,
      planVersion: state.groundPlanVersion,
      detail: `Ground plan revised to version ${state.groundPlanVersion} with ${copy.length} command(s).`,
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

    this.runtime.cancelQueuedActions(contact.satelliteId);
    for (const [actionId, command] of this.runtimeActionCommands) {
      if (command.satelliteId === contact.satelliteId) this.runtimeActionCommands.delete(actionId);
    }
    state.onboardTelVersion = state.groundPlanVersion;
    state.onboardCommands = state.groundPlan.map((command) => ({ ...command }));
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
    let firstActionStartSeconds: number | null = null;
    for (const command of state.onboardCommands) {
      const actionId = `tel:${contact.satelliteId}:v${state.onboardTelVersion}:${command.id}`;
      this.runtimeActionCommands.set(actionId, {
        satelliteId: contact.satelliteId,
        planVersion: state.onboardTelVersion,
        commandId: command.id,
      });
      const action = this.runtime.queueAction(
        contact.satelliteId,
        actionId,
        "tel-command",
        command.durationSeconds,
      );
      if (firstActionStartSeconds === null) firstActionStartSeconds = action.startsAtSeconds;
    }
    state.onboardCoverageEndsAtSeconds = firstActionStartSeconds === null
      ? null
      : firstActionStartSeconds + state.onboardCommands.reduce(
        (duration, command) => duration + command.durationSeconds,
        0,
      );
    if (state.mode === "standby") this.recordExhaustion(state, timeSeconds);
    return true;
  }

  /** Apply action completions from the shared runtime to the current onboard TEL. */
  observeRuntimeEvents(events: readonly RuntimeEvent[]): void {
    for (const event of events) {
      if (event.kind !== "action-completed") continue;
      const command = this.runtimeActionCommands.get(event.actionId);
      if (!command) continue;
      const state = this.requireSatellite(command.satelliteId);
      if (state.onboardTelVersion !== command.planVersion) continue;
      const nextCommand = state.onboardCommands[state.nextCommandIndex];
      if (nextCommand?.id !== command.commandId) continue;
      this.completeNextCommand(command.satelliteId, event.timeSeconds);
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
    for (const state of this.satelliteState.values()) {
      state.groundPlanVersion = 0;
      state.groundPlan = [];
      state.onboardTelVersion = null;
      state.onboardCommands = [];
      state.nextCommandIndex = 0;
      state.onboardCoverageEndsAtSeconds = null;
      this.activeContacts.get(state.satelliteId)?.clear();
      state.mode = "standby";
      state.standbyCause = "no-uploaded-tel";
    }
  }

  private requireSatellite(satelliteId: string): MutableSatelliteGroundOperationsState {
    const state = this.satelliteState.get(satelliteId);
    if (!state) throw new Error(`Unknown satellite: ${satelliteId}`);
    return state;
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
