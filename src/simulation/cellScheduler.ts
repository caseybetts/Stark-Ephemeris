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
import { projectSatellitePower, PROTOTYPE_POWER_CONFIGURATION, type SatellitePowerConfiguration } from "./power.ts";
import { cloudForecastForInterval, type WeatherConfiguration } from "./weather.ts";

export const PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS = 2 * 60;
const OPPORTUNITY_SAMPLE_SECONDS = 60;
export const PROTOTYPE_BEAM_WIDTH = 6;
export const PROTOTYPE_BEAM_CANDIDATES = 8;
export const PROTOTYPE_BEAM_EXTENSION_BUDGET = 48;
export const PROTOTYPE_BEAM_POOL_SIZE = 16;

type ScheduleInput = {
  satellite: SatelliteDefinition;
  grid: CellGrid;
  market: CellMarketState;
  startsAtSeconds: number;
  endsAtSeconds: number;
  scenario: CellCaptureScenario;
  initialPointing?: PointingDirection;
  projectedLastCollectedAtByCell?: ReadonlyMap<number, number>;
  segmentSeconds?: number;
  opportunitySampleSeconds?: number;
  powerConfiguration?: SatellitePowerConfiguration;
  initialEnergyWh?: number;
  weather?: WeatherConfiguration;
};

type Candidate = {
  cellIndex: number;
  cellId: number;
  target: GeographicLocation;
  startsAtSeconds: number;
  completesAtSeconds: number;
  durationSeconds: number;
  priorityPoints: number;
  weightedPriorityPoints: number;
  weatherWeight?: 1 | 2 | 3 | 4;
  forecastBand?: "clear" | "mixed" | "cloudy" | "overcast";
  forecastCloudCoverPercent?: number;
  energyAfterWh: number;
  endPointing: PointingDirection;
};

export type GreedyScheduleCommand = {
  id: string;
  label: string;
  durationSeconds: number;
  cellCapture?: {
    cellIndex: number;
    target: GeographicLocation;
    forecastCloudCoverPercent?: number;
  };
};

export type GreedyScheduleDecision = {
  cellIndex: number;
  cellId: number;
  target: GeographicLocation;
  startsAtSeconds: number;
  completesAtSeconds: number;
  availablePriorityPoints: number;
  weatherWeight?: 1 | 2 | 3 | 4;
  forecastBand?: "clear" | "mixed" | "cloudy" | "overcast";
  alternatives: Array<{ cellId: number; availablePriorityPoints: number }>;
};

export type GreedyCellSchedule = {
  commands: GreedyScheduleCommand[];
  decisions: GreedyScheduleDecision[];
  optimizationSegments: number;
  projectedPriorityPoints: number;
  startAtSeconds: number;
  endsAtSeconds: number;
  search?: { extensions: number; maximumSegmentExtensions: number; improvedOverGreedy: boolean };
};

export function generateGreedyCellSchedule(input: ScheduleInput): GreedyCellSchedule {
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
  const projectedLastCollectedAt = new Map(input.projectedLastCollectedAtByCell ?? []);
  const accessRadiusKm = maximumAccessSurfaceRadiusKm(
    input.satellite,
    input.scenario.maximumOffNadirAngleDeg,
  ) + 25; // Include cells whose center is just outside the access arc but whose bounds may overlap it.
  let cursorSeconds = input.startsAtSeconds;
  const power = input.powerConfiguration ?? PROTOTYPE_POWER_CONFIGURATION;
  let energyWh = input.initialEnergyWh ?? power.initialEnergyWh;
  let previousPointing = input.initialPointing ?? nadirPointingAt(input.satellite, cursorSeconds);
  let commandSequence = 0;
  let optimizationSegments = 0;
  let projectedPriorityPoints = 0;

  while (cursorSeconds < input.endsAtSeconds) {
    optimizationSegments += 1;
    const segmentEndSeconds = Math.min(cursorSeconds + segmentSeconds, input.endsAtSeconds);
    const ranked = findRankedOptions(input, cursorSeconds, segmentEndSeconds,
      previousPointing, energyWh, projectedLastCollectedAt, accessRadiusKm, power, sampleSeconds);
    const selected = ranked[0];
    if (!selected) {
      energyWh = projectSatellitePower(input.satellite, energyWh, cursorSeconds, segmentEndSeconds,
        power.housekeepingW, power).energyWh;
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
      cellCapture: {
        cellIndex: selected.cellIndex,
        target: { ...selected.target },
        ...(selected.forecastCloudCoverPercent !== undefined
          ? { forecastCloudCoverPercent: selected.forecastCloudCoverPercent } : {}),
      },
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
      ...(selected.weatherWeight ? { weatherWeight: selected.weatherWeight, forecastBand: selected.forecastBand } : {}),
      alternatives,
    });
    projectedPriorityPoints += selected.priorityPoints;
    projectedLastCollectedAt.set(selected.cellId, selected.completesAtSeconds);
    previousPointing = selected.endPointing;
    cursorSeconds = selected.completesAtSeconds;
    energyWh = selected.energyAfterWh;
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

type BeamNode = {
  cursorSeconds: number;
  pointing: PointingDirection;
  energyWh: number;
  projectedLast: Map<number, number>;
  choices: Array<{ selected: Candidate; alternatives: GreedyScheduleDecision["alternatives"] }>;
  score: number;
  timeCostSeconds: number;
};

/** Bounded local search, with the complete greedy schedule kept as fallback. */
export function generateBoundedCellSchedule(input: ScheduleInput): GreedyCellSchedule {
  const greedy = generateGreedyCellSchedule(input);
  const segmentSeconds = input.segmentSeconds ?? PROTOTYPE_OPTIMIZATION_SEGMENT_SECONDS;
  const sampleSeconds = input.opportunitySampleSeconds ?? OPPORTUNITY_SAMPLE_SECONDS;
  const power = input.powerConfiguration ?? PROTOTYPE_POWER_CONFIGURATION;
  const accessRadiusKm = maximumAccessSurfaceRadiusKm(
    input.satellite, input.scenario.maximumOffNadirAngleDeg,
  ) + 25;
  const commands: GreedyScheduleCommand[] = [];
  const decisions: GreedyScheduleDecision[] = [];
  let cursorSeconds = input.startsAtSeconds;
  let energyWh = input.initialEnergyWh ?? power.initialEnergyWh;
  let pointing = input.initialPointing ?? nadirPointingAt(input.satellite, cursorSeconds);
  let projectedLast = new Map(input.projectedLastCollectedAtByCell ?? []);
  let score = 0;
  let projectedPriorityPoints = 0;
  let extensions = 0;
  let maximumSegmentExtensions = 0;
  let optimizationSegments = 0;
  let sequence = 0;

  while (cursorSeconds < input.endsAtSeconds) {
    optimizationSegments += 1;
    const segmentEnd = Math.min(cursorSeconds + segmentSeconds, input.endsAtSeconds);
    const root: BeamNode = {
      cursorSeconds, pointing, energyWh, projectedLast, choices: [], score: 0, timeCostSeconds: 0,
    };
    const initialCandidates = findRankedOptions(input, cursorSeconds, segmentEnd,
      pointing, energyWh, projectedLast, accessRadiusKm, power, sampleSeconds);
    const candidatePool = initialCandidates.slice(0, PROTOTYPE_BEAM_POOL_SIZE)
      .map(candidate => candidate.cellIndex);
    let beam = [root];
    let best = root;
    let segmentExtensions = 0;
    while (beam.length > 0 && segmentExtensions < PROTOTYPE_BEAM_EXTENSION_BUDGET) {
      const next: BeamNode[] = [];
      for (const node of beam) {
        if (node.cursorSeconds >= segmentEnd) continue;
        const ranked = (node === root ? initialCandidates : findRankedOptions(input,
          node.cursorSeconds, segmentEnd, node.pointing, node.energyWh,
          node.projectedLast, accessRadiusKm, power, sampleSeconds, candidatePool))
          .filter(option => !node.choices.some(choice => choice.selected.cellId === option.cellId))
          .slice(0, PROTOTYPE_BEAM_CANDIDATES);
        for (const selected of ranked) {
          if (segmentExtensions >= PROTOTYPE_BEAM_EXTENSION_BUDGET) break;
          segmentExtensions += 1;
          const nextLast = new Map(node.projectedLast);
          nextLast.set(selected.cellId, selected.completesAtSeconds);
          const child: BeamNode = {
            cursorSeconds: selected.completesAtSeconds,
            pointing: selected.endPointing,
            energyWh: selected.energyAfterWh,
            projectedLast: nextLast,
            choices: [...node.choices, {
              selected,
              alternatives: ranked.filter(option => option.cellId !== selected.cellId)
                .slice(0, 3).map(option => ({
                  cellId: option.cellId, availablePriorityPoints: option.priorityPoints,
                })),
            }],
            score: node.score + selected.weightedPriorityPoints,
            timeCostSeconds: node.timeCostSeconds + selected.startsAtSeconds - node.cursorSeconds
              + selected.durationSeconds - input.scenario.collectionDurationSeconds,
          };
          next.push(child);
          if (compareBeamNodes(child, best) < 0) best = child;
        }
      }
      beam = next.sort(compareBeamNodes).slice(0, PROTOTYPE_BEAM_WIDTH);
    }
    extensions += segmentExtensions;
    maximumSegmentExtensions = Math.max(maximumSegmentExtensions, segmentExtensions);
    if (best.choices.length === 0) {
      energyWh = projectSatellitePower(input.satellite, energyWh, cursorSeconds, segmentEnd,
        power.housekeepingW, power).energyWh;
      appendIdle(commands, sequence++, segmentEnd - cursorSeconds,
        "Idle: no feasible positive-priority cell in this two-minute segment.");
      cursorSeconds = segmentEnd;
      continue;
    }
    for (const { selected, alternatives } of best.choices) {
      appendIdle(commands, sequence++, selected.startsAtSeconds - cursorSeconds,
        "Idle: waiting for the selected cell's feasible opportunity.");
      commands.push({
        id: `beam-capture-${sequence++}`,
        label: `Capture cell ${selected.cellId}`,
        durationSeconds: selected.durationSeconds,
        cellCapture: {
          cellIndex: selected.cellIndex,
          target: { ...selected.target },
          ...(selected.forecastCloudCoverPercent !== undefined
            ? { forecastCloudCoverPercent: selected.forecastCloudCoverPercent } : {}),
        },
      });
      decisions.push({
        cellIndex: selected.cellIndex, cellId: selected.cellId,
        target: { ...selected.target },
        startsAtSeconds: selected.startsAtSeconds,
        completesAtSeconds: selected.completesAtSeconds,
        availablePriorityPoints: selected.priorityPoints,
        ...(selected.weatherWeight ? {
          weatherWeight: selected.weatherWeight, forecastBand: selected.forecastBand,
        } : {}),
        alternatives,
      });
      projectedPriorityPoints += selected.priorityPoints;
      cursorSeconds = selected.completesAtSeconds;
    }
    pointing = best.pointing;
    energyWh = best.energyWh;
    projectedLast = best.projectedLast;
    score += best.score;
  }
  const greedyScore = greedy.decisions.reduce((total, decision) =>
    total + decision.availablePriorityPoints * (decision.weatherWeight ?? 4) / 4, 0);
  const search = {
    extensions, maximumSegmentExtensions, improvedOverGreedy: score > greedyScore,
  };
  return score > greedyScore
    ? { commands, decisions, optimizationSegments, projectedPriorityPoints,
      startAtSeconds: input.startsAtSeconds, endsAtSeconds: input.endsAtSeconds, search }
    : { ...greedy, search };
}

function compareBeamNodes(left: BeamNode, right: BeamNode): number {
  return right.score - left.score
    || left.timeCostSeconds - right.timeCostSeconds
    || left.choices.map(choice => choice.selected.cellId).join(",")
      .localeCompare(right.choices.map(choice => choice.selected.cellId).join(","));
}

function findRankedOptions(
  input: ScheduleInput,
  cursorSeconds: number,
  segmentEndSeconds: number,
  previousPointing: PointingDirection,
  energyWh: number,
  projectedLastCollectedAt: ReadonlyMap<number, number>,
  accessRadiusKm: number,
  power: SatellitePowerConfiguration,
  sampleSeconds: number,
  candidatePool?: readonly number[],
): Candidate[] {
  const options = new Map<number, Candidate>();
  for (let sampleAtSeconds = cursorSeconds;
    sampleAtSeconds <= segmentEndSeconds;
    sampleAtSeconds = Math.min(sampleAtSeconds + sampleSeconds, segmentEndSeconds)) {
    const cellIndices = candidatePool ?? nearbyCellIndices(input.grid, subSatellitePoint(
      rotateInertialToEarthFixed(
        satellitePositionInertial(input.satellite.orbit, sampleAtSeconds),
        sampleAtSeconds,
      ),
    ), accessRadiusKm);
    for (const cellIndex of cellIndices) {
      const cellId = input.grid.ids[cellIndex]!;
      const target = cellBounds(cellId);
      const feasibility = evaluateCellCaptureOpportunity({
        satellite: input.satellite, target, previousPointing,
        startsAtSeconds: sampleAtSeconds, scenario: input.scenario,
      });
      if (!feasibility.feasible || feasibility.completesAtSeconds > input.endsAtSeconds) continue;
      const atOpportunity = projectSatellitePower(input.satellite, energyWh, cursorSeconds,
        sampleAtSeconds, power.housekeepingW, power);
      const capturePower = projectSatellitePower(input.satellite, atOpportunity.energyWh,
        sampleAtSeconds, feasibility.completesAtSeconds,
        power.housekeepingW + power.captureAdditionalW, power);
      if (capturePower.minimumWh < power.reserveWh) continue;
      const projectedLast = projectedLastCollectedAt.get(cellId)
        ?? input.market.lastCollectedAtSeconds(cellIndex);
      const priorityPoints = input.market.calculateCell(
        cellIndex, feasibility.completesAtSeconds, projectedLast,
      ).availablePriorityPoints;
      if (!(priorityPoints > 0)) continue;
      const forecast = input.weather
        ? cloudForecastForInterval(input.weather, cellId, input.startsAtSeconds,
          feasibility.collectionStartsAtSeconds, feasibility.completesAtSeconds)
        : null;
      const weightedPriorityPoints = priorityPoints * (forecast?.weight ?? 4) / 4;
      const current = options.get(cellId);
      if (!current || weightedPriorityPoints > current.weightedPriorityPoints
        || (weightedPriorityPoints === current.weightedPriorityPoints
          && feasibility.completesAtSeconds < current.completesAtSeconds)) {
        options.set(cellId, {
          cellIndex, cellId, target, startsAtSeconds: sampleAtSeconds,
          completesAtSeconds: feasibility.completesAtSeconds,
          durationSeconds: feasibility.completesAtSeconds - sampleAtSeconds,
          priorityPoints, weightedPriorityPoints,
          ...(forecast ? {
            weatherWeight: forecast.weight,
            forecastBand: forecast.band,
            forecastCloudCoverPercent: forecast.forecastPercent,
          } : {}),
          energyAfterWh: capturePower.energyWh,
          endPointing: feasibility.endPointingDirection,
        });
      }
    }
    if (sampleAtSeconds === segmentEndSeconds) break;
  }
  return [...options.values()].sort((left, right) =>
    right.weightedPriorityPoints - left.weightedPriorityPoints
    || left.startsAtSeconds - right.startsAtSeconds
    || left.cellId - right.cellId,
  );
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
