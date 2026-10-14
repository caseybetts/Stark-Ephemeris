import { CELL_COLUMNS, CELL_DEGREES, CELL_ROWS, cellBounds, type CellGrid } from "./cells.ts";
import type { CellMarketState } from "./cellMarketState.ts";
import type { CellCaptureScenario } from "./cellCapture.ts";
import {
  evaluateCellCaptureOpportunity,
  maximumAccessSurfaceRadiusKm,
  nadirPointingAt,
} from "./cellCapture.ts";
import type { GeographicLocation, SatelliteDefinition } from "./model.ts";
import { rotateInertialToEarthFixed, satellitePositionInertial, subSatellitePoint } from "./world.ts";
import type { PointingDirection } from "./slew.ts";

export const PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS = 2 * 60;
const OPPORTUNITY_SAMPLE_SECONDS = 60;

export type GreedyScheduleCommand = {
  id: string;
  label: string;
  durationSeconds: number;
  cellCapture?: { cellIndex: number; target: GeographicLocation };
};

export type GreedyScheduleDecision = {
  cellIndex: number;
  cellId: number;
  target: GeographicLocation;
  startsAtSeconds: number;
  completesAtSeconds: number;
  availablePriorityPoints: number;
  alternatives: Array<{ cellId: number; availablePriorityPoints: number }>;
};

export type GreedyCellSchedule = {
  commands: GreedyScheduleCommand[];
  decisions: GreedyScheduleDecision[];
  optimizationSegments: number;
  projectedPriorityPoints: number;
  startAtSeconds: number;
  endsAtSeconds: number;
};

export function generateGreedyCellSchedule(input: {
  satellite: SatelliteDefinition;
  grid: CellGrid;
  market: CellMarketState;
  startsAtSeconds: number;
  endsAtSeconds: number;
  scenario: CellCaptureScenario;
  initialPointing?: PointingDirection;
  segmentSeconds?: number;
  opportunitySampleSeconds?: number;
}): GreedyCellSchedule {
  const segmentSeconds = input.segmentSeconds ?? PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS;
  const sampleSeconds = input.opportunitySampleSeconds ?? OPPORTUNITY_SAMPLE_SECONDS;
  if (!Number.isFinite(input.startsAtSeconds) || input.startsAtSeconds < 0
    || !Number.isFinite(input.endsAtSeconds) || input.endsAtSeconds <= input.startsAtSeconds
    || !Number.isFinite(segmentSeconds) || segmentSeconds <= 0
    || !Number.isFinite(sampleSeconds) || sampleSeconds <= 0) {
    throw new RangeError("Scheduler interval and segment durations must be finite and positive");
  }

  const commands: GreedyScheduleCommand[] = [];
  const decisions: GreedyScheduleDecision[] = [];
  const projectedLastCollectedAt = new Map<number, number>();
  const accessRadiusKm = maximumAccessSurfaceRadiusKm(
    input.satellite,
    input.scenario.maximumOffNadirAngleDeg,
  ) + 25; // Include cells whose center is just outside the access arc but whose bounds may overlap it.
  let cursorSeconds = input.startsAtSeconds;
  let previousPointing = input.initialPointing ?? nadirPointingAt(input.satellite, cursorSeconds);
  let commandSequence = 0;
  let optimizationSegments = 0;
  let projectedPriorityPoints = 0;

  while (cursorSeconds < input.endsAtSeconds) {
    optimizationSegments += 1;
    const segmentEndSeconds = Math.min(cursorSeconds + segmentSeconds, input.endsAtSeconds);
    const options = new Map<string, {
      cellIndex: number;
      cellId: number;
      target: GeographicLocation;
      startsAtSeconds: number;
      completesAtSeconds: number;
      durationSeconds: number;
      priorityPoints: number;
    }>();

    for (let sampleAtSeconds = cursorSeconds;
      sampleAtSeconds <= segmentEndSeconds;
      sampleAtSeconds = Math.min(sampleAtSeconds + sampleSeconds, segmentEndSeconds)) {
      const subpoint = subSatellitePoint(rotateInertialToEarthFixed(
        satellitePositionInertial(input.satellite.orbit, sampleAtSeconds),
        sampleAtSeconds,
      ));
      for (const cellIndex of nearbyCellIndices(input.grid, subpoint, accessRadiusKm)) {
        const target = cellBounds(input.grid.ids[cellIndex]!);
        const feasibility = evaluateCellCaptureOpportunity({
          satellite: input.satellite,
          target,
          previousPointing,
          startsAtSeconds: sampleAtSeconds,
          scenario: input.scenario,
        });
        if (!feasibility.feasible || feasibility.completesAtSeconds > input.endsAtSeconds) continue;
        const cellId = input.grid.ids[cellIndex]!;
        const projectedLast = projectedLastCollectedAt.get(cellId)
          ?? input.market.lastCollectedAtSeconds(cellIndex);
        const priorityPoints = input.market.calculateCell(
          cellIndex,
          feasibility.completesAtSeconds,
          projectedLast,
        ).availablePriorityPoints;
        if (!(priorityPoints > 0)) continue;
        const key = `${cellId}`;
        const current = options.get(key);
        if (!current || priorityPoints > current.priorityPoints
          || (priorityPoints === current.priorityPoints && feasibility.completesAtSeconds < current.completesAtSeconds)) {
          options.set(key, {
            cellIndex,
            cellId,
            target,
            startsAtSeconds: sampleAtSeconds,
            completesAtSeconds: feasibility.completesAtSeconds,
            durationSeconds: feasibility.completesAtSeconds - sampleAtSeconds,
            priorityPoints,
          });
        }
        if (sampleAtSeconds === segmentEndSeconds) break;
      }
      if (sampleAtSeconds === segmentEndSeconds) break;
    }

    const ranked = [...options.values()].sort((left, right) =>
      right.priorityPoints - left.priorityPoints
      || left.startsAtSeconds - right.startsAtSeconds
      || left.cellId - right.cellId,
    );
    const selected = ranked[0];
    if (!selected) {
      appendIdle(commands, commandSequence++, segmentEndSeconds - cursorSeconds,
        "Idle: no feasible positive-priority cell in this two-minute segment.");
      cursorSeconds = segmentEndSeconds;
      continue;
    }

    if (selected.startsAtSeconds > cursorSeconds) {
      appendIdle(commands, commandSequence++, selected.startsAtSeconds - cursorSeconds,
        "Idle: waiting for the selected cell's feasible opportunity.");
    }
    commands.push({
      id: `greedy-capture-${commandSequence++}`,
      label: `Capture cell ${selected.cellId}`,
      durationSeconds: selected.durationSeconds,
      cellCapture: { cellIndex: selected.cellIndex, target: { ...selected.target } },
    });
    const alternatives = ranked.slice(1, 4).map(candidate => ({
      cellId: candidate.cellId,
      availablePriorityPoints: candidate.priorityPoints,
    }));
    decisions.push({
      cellIndex: selected.cellIndex,
      cellId: selected.cellId,
      target: { ...selected.target },
      startsAtSeconds: selected.startsAtSeconds,
      completesAtSeconds: selected.completesAtSeconds,
      availablePriorityPoints: selected.priorityPoints,
      alternatives,
    });
    projectedPriorityPoints += selected.priorityPoints;
    projectedLastCollectedAt.set(selected.cellId, selected.completesAtSeconds);
    previousPointing = evaluateCellCaptureOpportunity({
      satellite: input.satellite,
      target: selected.target,
      previousPointing,
      startsAtSeconds: selected.startsAtSeconds,
      scenario: input.scenario,
    }).endPointingDirection;
    cursorSeconds = selected.completesAtSeconds;
  }

  return {
    commands,
    decisions,
    optimizationSegments,
    projectedPriorityPoints,
    startAtSeconds: input.startsAtSeconds,
    endsAtSeconds: input.endsAtSeconds,
  };
}

function appendIdle(
  commands: GreedyScheduleCommand[],
  sequence: number,
  durationSeconds: number,
  label: string,
): void {
  if (durationSeconds <= 0) return;
  const previous = commands.at(-1);
  if (previous && !previous.cellCapture && previous.label === label) {
    previous.durationSeconds += durationSeconds;
    return;
  }
  commands.push({ id: `greedy-idle-${sequence}`, label, durationSeconds });
}

function nearbyCellIndices(
  grid: CellGrid,
  center: GeographicLocation,
  radiusKm: number,
): number[] {
  const latitudePadDeg = radiusKm / 6371 * 180 / Math.PI + CELL_DEGREES;
  const minLatitude = Math.max(-90, center.latitudeDeg - latitudePadDeg);
  const maxLatitude = Math.min(90, center.latitudeDeg + latitudePadDeg);
  const minRow = Math.max(0, Math.floor((90 - maxLatitude) / CELL_DEGREES));
  const maxRow = Math.min(CELL_ROWS - 1, Math.floor((90 - minLatitude) / CELL_DEGREES));
  const seen = new Set<number>();
  for (let row = minRow; row <= maxRow; row += 1) {
    const latitude = 90 - (row + 0.5) * CELL_DEGREES;
    const cosine = Math.max(0.0001, Math.cos(latitude * Math.PI / 180));
    const longitudePadDeg = radiusKm / (6371 * cosine) * 180 / Math.PI + CELL_DEGREES;
    const centerColumn = Math.floor((((center.longitudeDeg + 180) % 360 + 360) % 360) / CELL_DEGREES);
    const columnsEachSide = Math.min(CELL_COLUMNS, Math.ceil(longitudePadDeg / CELL_DEGREES));
    if (columnsEachSide * 2 + 1 >= CELL_COLUMNS) {
      for (let column = 0; column < CELL_COLUMNS; column += 1) {
        const index = grid.indexAt(latitude, -180 + (column + 0.5) * CELL_DEGREES);
        if (index >= 0) seen.add(index);
      }
      continue;
    }
    for (let offset = -columnsEachSide; offset <= columnsEachSide; offset += 1) {
      const column = (centerColumn + offset + CELL_COLUMNS) % CELL_COLUMNS;
      const longitude = -180 + (column + 0.5) * CELL_DEGREES;
      const index = grid.indexAt(latitude, longitude);
      if (index >= 0) seen.add(index);
    }
  }
  return [...seen];
}
