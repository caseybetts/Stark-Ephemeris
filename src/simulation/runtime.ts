export type RuntimeActionStatus = "queued" | "active" | "completed" | "cancelled";

export type RuntimeAction = {
  id: string;
  satelliteId: string;
  kind: string;
  durationSeconds: number;
  scheduledAtSeconds: number;
  startsAtSeconds: number;
  completesAtSeconds: number;
  status: RuntimeActionStatus;
  order: number;
};

export type RuntimeEventKind =
  | "action-scheduled"
  | "action-started"
  | "action-completed"
  | "action-cancelled";

export type RuntimeEvent = {
  id: string;
  kind: RuntimeEventKind;
  actionId: string;
  actionKind: string;
  satelliteId: string;
  timeSeconds: number;
  sequence: number;
};

export type SatelliteRuntimeState = {
  satelliteId: string;
  currentAction: RuntimeAction | null;
  queuedActions: RuntimeAction[];
};

/**
 * Cesium-independent owner of simulation time and generic timed action state.
 * Gameplay systems can attach their own effects to action-completed events.
 */
export class SimulationRuntime {
  private elapsed = 0;
  private actionOrder = 0;
  private eventSequence = 0;
  private readonly satelliteIds = new Set<string>();
  private readonly initialSatelliteIds: Set<string>;
  private readonly actionsBySatellite = new Map<string, RuntimeAction[]>();
  private readonly actionIds = new Set<string>();
  private readonly eventLog: RuntimeEvent[] = [];

  constructor(satelliteIds: readonly string[]) {
    for (const satelliteId of satelliteIds) {
      if (!satelliteId.trim() || this.satelliteIds.has(satelliteId)) {
        throw new Error(`Invalid or duplicate satellite ID: ${satelliteId}`);
      }
      this.satelliteIds.add(satelliteId);
      this.actionsBySatellite.set(satelliteId, []);
    }
    this.initialSatelliteIds = new Set(this.satelliteIds);
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  hasSatellite(satelliteId: string): boolean {
    return this.satelliteIds.has(satelliteId);
  }

  registerSatellite(satelliteId: string): void {
    if (!satelliteId.trim() || this.satelliteIds.has(satelliteId)) {
      throw new Error(`Invalid or duplicate satellite ID: ${satelliteId}`);
    }
    this.satelliteIds.add(satelliteId);
    this.actionsBySatellite.set(satelliteId, []);
  }

  get events(): readonly RuntimeEvent[] {
    return this.eventLog.map((event) => ({ ...event }));
  }

  /** Earliest queued start or active completion at/before a requested horizon. */
  nextActionBoundaryAtOrBefore(endSeconds: number): number | null {
    if (!Number.isFinite(endSeconds) || endSeconds < this.elapsed) {
      throw new RangeError("Action boundary horizon must be finite and no earlier than simulation time");
    }
    let next: number | null = null;
    for (const actions of this.actionsBySatellite.values()) {
      for (const action of actions) {
        const boundary = action.status === "queued"
          ? action.startsAtSeconds
          : action.status === "active"
            ? action.completesAtSeconds
            : null;
        if (boundary !== null && boundary >= this.elapsed && boundary <= endSeconds
          && (next === null || boundary < next)) next = boundary;
      }
    }
    return next;
  }

  getSatelliteState(satelliteId: string): SatelliteRuntimeState {
    const actions = this.requireSatellite(satelliteId);
    const currentAction = actions.find((action) => action.status === "active") ?? null;
    return {
      satelliteId,
      currentAction: currentAction ? { ...currentAction } : null,
      queuedActions: actions
        .filter((action) => action.status === "queued")
        .map((action) => ({ ...action })),
    };
  }

  /** Queue a generic action after that satellite's existing work. */
  queueAction(satelliteId: string, id: string, kind: string, durationSeconds: number): RuntimeAction {
    const actions = this.requireSatellite(satelliteId);
    if (!id.trim() || this.actionIds.has(id)) throw new Error(`Invalid or duplicate action ID: ${id}`);
    if (!kind.trim()) throw new Error("Action kind is required");
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new RangeError("Action duration must be finite and positive");
    }

    const blockingAction = [...actions].reverse().find(
      (action) => action.status !== "completed" && action.status !== "cancelled",
    );
    const startsAtSeconds = Math.max(this.elapsed, blockingAction?.completesAtSeconds ?? this.elapsed);
    const completesAtSeconds = startsAtSeconds + durationSeconds;
    if (!Number.isFinite(completesAtSeconds)) throw new RangeError("Action completion time must remain finite");

    const action: RuntimeAction = {
      id,
      satelliteId,
      kind,
      durationSeconds,
      scheduledAtSeconds: this.elapsed,
      startsAtSeconds,
      completesAtSeconds,
      status: startsAtSeconds === this.elapsed && !blockingAction
        ? "active"
        : "queued",
      order: this.actionOrder++,
    };
    actions.push(action);
    this.actionIds.add(id);
    this.recordEvent(action, "action-scheduled", this.elapsed);
    if (action.status === "active") this.recordEvent(action, "action-started", this.elapsed);
    return { ...action };
  }

  /** Cancel queued commands when an uploaded TEL replaces the onboard plan. */
  cancelQueuedActions(satelliteId: string): void {
    const actions = this.requireSatellite(satelliteId);
    for (const action of actions) {
      if (action.status !== "queued") continue;
      action.status = "cancelled";
      this.recordEvent(action, "action-cancelled", this.elapsed);
    }
  }

  /** Cancel queued actions except the committed TEL actions that must survive an upload. */
  cancelQueuedActionsExcept(satelliteId: string, preservedActionIds: ReadonlySet<string>): void {
    const actions = this.requireSatellite(satelliteId);
    for (const action of actions) {
      if (action.status !== "queued" || preservedActionIds.has(action.id)) continue;
      action.status = "cancelled";
      this.recordEvent(action, "action-cancelled", this.elapsed);
    }
  }

  /** Advance the domain clock and process every action boundary in the interval. */
  advanceBy(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError("Time advance must be finite and non-negative");
    }
    const targetSeconds = this.elapsed + seconds;
    if (!Number.isFinite(targetSeconds)) throw new RangeError("Simulation time must remain finite");

    while (true) {
      const transitions: Array<{
        action: RuntimeAction;
        timeSeconds: number;
        kind: "action-started" | "action-completed";
      }> = [];
      for (const actions of this.actionsBySatellite.values()) {
        for (const action of actions) {
          if (action.status === "queued" && action.startsAtSeconds <= targetSeconds) {
            transitions.push({ action, timeSeconds: action.startsAtSeconds, kind: "action-started" });
          }
          if (action.status === "active" && action.completesAtSeconds <= targetSeconds) {
            transitions.push({ action, timeSeconds: action.completesAtSeconds, kind: "action-completed" });
          }
        }
      }
      transitions.sort((left, right) =>
        left.timeSeconds - right.timeSeconds
        || this.transitionOrder(left.kind) - this.transitionOrder(right.kind)
        || left.action.order - right.action.order,
      );
      const transition = transitions[0];
      if (!transition) break;

      if (transition.kind === "action-started") {
        if (transition.action.status !== "queued") continue;
        transition.action.status = "active";
      } else {
        if (transition.action.status !== "active") continue;
        transition.action.status = "completed";
      }
      this.recordEvent(transition.action, transition.kind, transition.timeSeconds);
    }

    this.elapsed = targetSeconds;
    return this.elapsed;
  }

  /** Reset in-memory runtime state for a fresh prototype scenario. */
  reset(): void {
    this.elapsed = 0;
    this.actionOrder = 0;
    this.eventSequence = 0;
    this.actionIds.clear();
    this.eventLog.length = 0;
    for (const satelliteId of this.satelliteIds) {
      if (!this.initialSatelliteIds.has(satelliteId)) {
        this.satelliteIds.delete(satelliteId);
        this.actionsBySatellite.delete(satelliteId);
      }
    }
    for (const satelliteId of this.initialSatelliteIds) this.actionsBySatellite.set(satelliteId, []);
  }

  private requireSatellite(satelliteId: string): RuntimeAction[] {
    const actions = this.actionsBySatellite.get(satelliteId);
    if (!actions) throw new Error(`Unknown satellite: ${satelliteId}`);
    return actions;
  }

  private transitionOrder(kind: "action-started" | "action-completed"): number {
    return kind === "action-completed" ? 0 : 1;
  }

  private recordEvent(action: RuntimeAction, kind: RuntimeEventKind, timeSeconds: number): void {
    this.eventLog.push({
      id: `${action.id}:${kind}`,
      kind,
      actionId: action.id,
      actionKind: action.kind,
      satelliteId: action.satelliteId,
      timeSeconds,
      sequence: this.eventSequence++,
    });
  }
}
