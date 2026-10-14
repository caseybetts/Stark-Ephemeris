import { cellLookDirectionAt, evaluateCellCaptureOpportunity, nadirPointingAt, type CellCaptureScenario } from "./cellCapture.ts";
import type { CellMarketState } from "./cellMarketState.ts";
import { GroundOperations, type GroundContactPredictor, type TaskEventCommand } from "./groundOperations.ts";
import { PROTOTYPE_CELL_IMAGE_SIZE_BYTES } from "./cellMarketState.ts";
import { ImageryOperations } from "./imageryOperations.ts";
import type { GeographicLocation, SatelliteDefinition, SurfaceObject } from "./model.ts";
import { SimulationRuntime, type RuntimeEvent } from "./runtime.ts";
import type { PointingDirection } from "./slew.ts";

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
};

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
  private readonly captureActions = new Map<string, CaptureAction>();
  private readonly lastCommandedPointing = new Map<string, PointingDirection>();
  private readonly fleetById: ReadonlyMap<string, SatelliteDefinition>;
  private readonly stations: readonly SurfaceObject[];
  private readonly scenario: CellCaptureScenario;
  private readonly getMarket: () => CellMarketState | null;
  private readonly imageSizeBytes: number;

  constructor(configuration: OperationalLoopConfiguration) {
    this.fleetById = new Map(configuration.fleet.map(satellite => [satellite.id, satellite]));
    this.stations = configuration.stations;
    this.scenario = { ...configuration.scenario };
    this.getMarket = configuration.getMarket;
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
  }

  reviseGroundPlan(satelliteId: string, commands: readonly TaskEventCommand[], timeSeconds: number): number {
    const version = this.groundOperations.reviseGroundPlan(satelliteId, commands, timeSeconds);
    for (const command of commands) {
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
    const runtimeEvents = this.runtime.events;
    let processedRuntimeEvents = runtimeEvents.length;
    this.groundOperations.advanceBy(seconds, [...this.fleetById.values()], this.stations,
      (startsAtSeconds, endsAtSeconds, contacts) => {
        const market = this.getMarket();
        if (market) this.imageryOperations.advanceDownlink(market, startsAtSeconds, endsAtSeconds, contacts);
        processedRuntimeEvents = this.processRuntimeEvents(processedRuntimeEvents);
      });
    this.processRuntimeEvents(processedRuntimeEvents);
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
    this.runtime.reset();
    this.groundOperations.reset();
    this.imageryOperations.reset();
    this.captureActions.clear();
    this.lastCommandedPointing.clear();
    this.getMarket()?.resetPreview();
  }

  private processRuntimeEvents(fromIndex: number): number {
    const events: readonly RuntimeEvent[] = this.runtime.events;
    for (const event of events.slice(fromIndex)) {
      if (event.kind === "action-cancelled") {
        this.captureActions.delete(event.actionId);
        continue;
      }
      if (event.kind !== "action-completed") continue;
      const action = this.captureActions.get(event.actionId);
      if (!action) continue;
      this.captureActions.delete(event.actionId);
      this.executeCapture(action, event);
    }
    return events.length;
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
    let success = false;
    let detail: string;
    if (!feasibility.feasible) {
      detail = `Cell capture failed: ${feasibility.reason.replaceAll("-", " ")}. No image was created and cell recovery did not reset.`;
    } else if (!timingMatches) {
      detail = "Cell capture failed: the executed command timing no longer matches the feasible slew and collection window. No image was created and cell recovery did not reset.";
    } else if (!market) {
      detail = "Cell capture failed: market imagery state is not available. No image was created and cell recovery did not reset.";
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
    this.lastCommandedPointing.set(action.satelliteId, cellLookDirectionAt(satellite, action.target, event.timeSeconds));
    this.groundOperations.recordCellCaptureOutcome(action.satelliteId, action.commandId, event.timeSeconds, success, detail);
  }
}
