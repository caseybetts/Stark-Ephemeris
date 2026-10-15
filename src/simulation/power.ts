import { isSatelliteEclipsed, satellitePositionInertial } from "./world.ts";
import type { SatelliteDefinition } from "./model.ts";

export type SatellitePowerConfiguration = {
  capacityWh: number;
  initialEnergyWh: number;
  reserveWh: number;
  restartWh: number;
  downlinkRestartMarginWh: number;
  solarGenerationW: number;
  housekeepingW: number;
  captureAdditionalW: number;
  downlinkAdditionalW: number;
};

export type SatellitePowerSnapshot = {
  satelliteId: string;
  energyWh: number;
  capacityWh: number;
  reserveWh: number;
  chargePercent: number;
  generationW: number;
  loadW: number;
  netW: number;
  generatedWh: number;
  consumedWh: number;
  spilledWh: number;
  depleted: boolean;
  radioPaused: boolean;
  reason: string | null;
};

type MutablePowerState = {
  energyWh: number;
  generatedWh: number;
  consumedWh: number;
  spilledWh: number;
  depleted: boolean;
  radioRunning: boolean;
  radioPaused: boolean;
  lastReason: string | null;
};
type CapturePowerDecision = { satelliteId: string; startsAtSeconds: number; endsAtSeconds: number; admitted: boolean; reason: string | null };

type PowerEvent = { kind: "depleted" | "recovered"; satelliteId: string; timeSeconds: number };

const ECLIPSE_SCAN_SECONDS = 20;
const ECLIPSE_ROOT_TOLERANCE_SECONDS = 1e-6;
const ENERGY_EPSILON_WH = 1e-7;

export function projectSatellitePower(
  satellite: SatelliteDefinition,
  initialWh: number,
  startsAtSeconds: number,
  endsAtSeconds: number,
  loadW: number,
  configuration: SatellitePowerConfiguration,
): { energyWh: number; minimumWh: number } {
  let time = startsAtSeconds;
  let energyWh = initialWh;
  let minimumWh = energyWh;
  while (time < endsAtSeconds) {
    const boundary = nextIlluminationBoundary(satellite, time, endsAtSeconds) ?? endsAtSeconds;
    const midpoint = (time + boundary) / 2;
    const generationW = isEclipsedAt(satellite, midpoint) ? 0 : configuration.solarGenerationW;
    const rawEnergy = energyWh + (generationW - loadW) * ((boundary - time) / 3600);
    energyWh = Math.max(0, Math.min(configuration.capacityWh, rawEnergy));
    minimumWh = Math.min(minimumWh, energyWh, rawEnergy);
    time = boundary;
  }
  return { energyWh, minimumWh };
}

export function isEclipsedAt(satellite: SatelliteDefinition, timeSeconds: number): boolean {
  return isSatelliteEclipsed(
    satellitePositionInertial(satellite.orbit, timeSeconds),
    { x: 1, y: 0, z: 0 },
  );
}

/** Return the next eclipse transition using epoch-anchored brackets. */
export function nextIlluminationBoundary(
  satellite: SatelliteDefinition,
  afterSeconds: number,
  endSeconds: number,
): number | null {
  const firstBucket = Math.floor(afterSeconds / ECLIPSE_SCAN_SECONDS);
  let leftSeconds = firstBucket * ECLIPSE_SCAN_SECONDS;
  let leftState = isEclipsedAt(satellite, leftSeconds);
  for (let bucket = firstBucket + 1; leftSeconds < endSeconds; bucket += 1) {
    const rightSeconds = Math.min(bucket * ECLIPSE_SCAN_SECONDS, endSeconds);
    const rightState = isEclipsedAt(satellite, rightSeconds);
    if (rightState !== leftState) {
      let low = leftSeconds;
      let high = rightSeconds;
      while (high - low > ECLIPSE_ROOT_TOLERANCE_SECONDS) {
        const middle = (low + high) / 2;
        if (isEclipsedAt(satellite, middle) === leftState) low = middle;
        else high = middle;
      }
      const boundary = (low + high) / 2;
      if (boundary > afterSeconds + ECLIPSE_ROOT_TOLERANCE_SECONDS) return boundary;
      leftSeconds = rightSeconds;
      leftState = rightState;
      continue;
    }
    leftSeconds = rightSeconds;
    leftState = rightState;
  }
  return null;
}

export function validatePowerConfiguration(configuration: SatellitePowerConfiguration): void {
  const values = Object.values(configuration);
  if (values.some(value => !Number.isFinite(value))) throw new RangeError("Power configuration values must be finite");
  if (configuration.capacityWh <= 0 || configuration.initialEnergyWh < 0
    || configuration.initialEnergyWh > configuration.capacityWh
    || configuration.reserveWh <= 0 || configuration.reserveWh >= configuration.capacityWh
    || configuration.restartWh <= configuration.reserveWh || configuration.restartWh > configuration.capacityWh
    || configuration.downlinkRestartMarginWh < 0
    || configuration.solarGenerationW < 0 || configuration.housekeepingW < 0
    || configuration.captureAdditionalW < 0 || configuration.downlinkAdditionalW < 0) {
    throw new RangeError("Power configuration is outside its valid range");
  }
}

export class PowerOperations {
  private readonly initialConfigurations = new Map<string, SatellitePowerConfiguration>();
  private configurations = new Map<string, SatellitePowerConfiguration>();
  private readonly states = new Map<string, MutablePowerState>();
  private readonly eventLog: PowerEvent[] = [];

  constructor(configurations: Readonly<Record<string, SatellitePowerConfiguration>>) {
    this.configurations = new Map(Object.entries(configurations).map(([satelliteId, configuration]) => {
      validatePowerConfiguration(configuration);
      return [satelliteId, { ...configuration }];
    }));
    for (const [satelliteId, configuration] of this.configurations) {
      this.initialConfigurations.set(satelliteId, { ...configuration });
    }
    for (const [satelliteId, configuration] of this.configurations) {
      this.states.set(satelliteId, {
        energyWh: configuration.initialEnergyWh,
        generatedWh: 0,
        consumedWh: 0,
        spilledWh: 0,
        depleted: configuration.initialEnergyWh === 0,
        radioRunning: false,
        radioPaused: false,
        lastReason: null,
      });
    }
  }

  get events(): readonly PowerEvent[] {
    return this.eventLog.map(event => ({ ...event }));
  }

  hasSatellite(satelliteId: string): boolean {
    return this.configurations.has(satelliteId);
  }

  registerSatellite(satelliteId: string, configuration: SatellitePowerConfiguration): void {
    if (!satelliteId.trim() || this.hasSatellite(satelliteId)) {
      throw new Error(`Invalid or duplicate satellite ID: ${satelliteId}`);
    }
    validatePowerConfiguration(configuration);
    const frozenConfiguration = { ...configuration };
    this.configurations.set(satelliteId, frozenConfiguration);
    this.states.set(satelliteId, {
      energyWh: configuration.initialEnergyWh,
      generatedWh: 0,
      consumedWh: 0,
      spilledWh: 0,
      depleted: configuration.initialEnergyWh === 0,
      radioRunning: false,
      radioPaused: false,
      lastReason: null,
    });
  }

  getSnapshot(satelliteId: string, satellite: SatelliteDefinition, timeSeconds: number): SatellitePowerSnapshot {
    const configuration = this.requireConfiguration(satelliteId);
    const state = this.requireState(satelliteId);
    const activeCapture = !state.depleted && this.isAdmittedCaptureActive(satelliteId, timeSeconds);
    const generationW = isEclipsedAt(satellite, timeSeconds)
      ? 0
      : configuration.solarGenerationW;
    const loadW = state.depleted ? 0
      : configuration.housekeepingW
        + (activeCapture ? configuration.captureAdditionalW : 0)
        + (state.radioRunning ? configuration.downlinkAdditionalW : 0);
    return {
      satelliteId,
      energyWh: state.energyWh,
      capacityWh: configuration.capacityWh,
      reserveWh: configuration.reserveWh,
      chargePercent: (state.energyWh / configuration.capacityWh) * 100,
      generationW,
      loadW,
      netW: generationW - loadW,
      generatedWh: state.generatedWh,
      consumedWh: state.consumedWh,
      spilledWh: state.spilledWh,
      depleted: state.depleted,
      radioPaused: state.radioPaused,
      reason: state.depleted ? "Power depleted; waiting to recharge." : state.lastReason,
    };
  }

  getConfiguration(satelliteId: string): SatellitePowerConfiguration {
    return { ...this.requireConfiguration(satelliteId) };
  }

  beginCapture(
    satelliteId: string,
    satellite: SatelliteDefinition,
    startsAtSeconds: number,
    durationSeconds: number,
    actionId: string,
  ): { admitted: boolean; reason: string | null } {
    const configuration = this.requireConfiguration(satelliteId);
    const state = this.requireState(satelliteId);
    if (state.depleted) {
      const reason = "Power is depleted.";
      this.captureDecisions.set(actionId, { satelliteId, startsAtSeconds, endsAtSeconds: startsAtSeconds + durationSeconds, admitted: false, reason });
      return { admitted: false, reason };
    }
    const projected = projectSatellitePower(
      satellite, state.energyWh, startsAtSeconds,
      startsAtSeconds + durationSeconds,
      configuration.housekeepingW + configuration.captureAdditionalW,
      configuration,
    );
    if (projected.minimumWh + ENERGY_EPSILON_WH < configuration.reserveWh) {
      const reason = "Projected charge would cross the power reserve.";
      state.lastReason = `Capture held: ${reason}`;
      this.captureDecisions.set(actionId, { satelliteId, startsAtSeconds, endsAtSeconds: startsAtSeconds + durationSeconds, admitted: false, reason });
      return { admitted: false, reason: state.lastReason };
    }
    state.lastReason = null;
    this.captureDecisions.set(actionId, {
      satelliteId, startsAtSeconds, endsAtSeconds: startsAtSeconds + durationSeconds, admitted: true, reason: null,
    });
    return { admitted: true, reason: null };
  }

  hasCaptureDecision(actionId: string): boolean {
    return this.captureDecisions.has(actionId);
  }

  captureRejectionReason(actionId: string): string | null {
    return this.captureDecisions.get(actionId)?.reason ?? null;
  }

  completeCapture(actionId: string): void {
    this.captureDecisions.delete(actionId);
  }

  isCaptureAdmitted(actionId: string): boolean {
    return this.captureDecisions.get(actionId)?.admitted === true;
  }

  /** Start/resume the radio only when it will preserve reserve and commits. */
  updateRadio(satelliteId: string, hasContactAndImage: boolean, guardWh: number, sunlit: boolean): void {
    const configuration = this.requireConfiguration(satelliteId);
    const state = this.requireState(satelliteId);
    if (state.depleted || !hasContactAndImage) {
      state.radioRunning = false;
      state.radioPaused = false;
      return;
    }
    const baselineLoad = configuration.housekeepingW
      + (this.hasAdmittedCaptureActive(satelliteId) ? configuration.captureAdditionalW : 0);
    const generation = state.energyWh <= 0 || !sunlit ? 0 : configuration.solarGenerationW;
    const sustainable = generation >= baselineLoad + configuration.downlinkAdditionalW;
    if (state.radioRunning) {
      if (guardWh > configuration.capacityWh
        || (!sustainable && state.energyWh <= guardWh + ENERGY_EPSILON_WH)) {
        state.radioRunning = false;
        state.radioPaused = true;
        state.lastReason = "Downlink paused to protect reserve and committed work.";
      }
    } else if (state.energyWh >= guardWh + configuration.downlinkRestartMarginWh - ENERGY_EPSILON_WH
      || (state.energyWh >= guardWh - ENERGY_EPSILON_WH && sustainable)) {
      state.radioRunning = true;
      state.radioPaused = false;
      state.lastReason = null;
    } else {
      state.radioPaused = true;
      state.lastReason = "Downlink waiting for energy above the protected reserve.";
    }
  }

  radioIsRunning(satelliteId: string): boolean {
    return this.requireState(satelliteId).radioRunning;
  }

  /** Integrate one interval, split at illumination and radio completion boundaries by the caller. */
  advanceInterval(
    satellite: SatelliteDefinition,
    startsAtSeconds: number,
    endsAtSeconds: number,
    radioActiveUntilSeconds: number | null,
  ): void {
    if (endsAtSeconds <= startsAtSeconds) return;
    const satelliteId = satellite.id;
    const configuration = this.requireConfiguration(satelliteId);
    const state = this.requireState(satelliteId);
    const captureActive = this.isAdmittedCaptureActive(satelliteId, (startsAtSeconds + endsAtSeconds) / 2);
    let cursor = startsAtSeconds;
    const boundaries = [endsAtSeconds];
    const eclipseBoundary = nextIlluminationBoundary(satellite, startsAtSeconds, endsAtSeconds);
    if (eclipseBoundary !== null && eclipseBoundary < endsAtSeconds) boundaries.unshift(eclipseBoundary);
    if (radioActiveUntilSeconds !== null && radioActiveUntilSeconds > startsAtSeconds
      && radioActiveUntilSeconds < endsAtSeconds) boundaries.push(radioActiveUntilSeconds);
    boundaries.sort((left, right) => left - right);
    for (const boundary of boundaries) {
      if (boundary <= cursor) continue;
      const middle = (cursor + boundary) / 2;
      const depletedAtStart = state.depleted;
      const generationW = isEclipsedAt(satellite, middle) ? 0 : configuration.solarGenerationW;
      const hasRadioLoad = radioActiveUntilSeconds !== null && middle < radioActiveUntilSeconds;
      const loadW = depletedAtStart ? 0
        : configuration.housekeepingW
          + (captureActive ? configuration.captureAdditionalW : 0)
          + (hasRadioLoad ? configuration.downlinkAdditionalW : 0);
      const deltaWh = (generationW - loadW) * ((boundary - cursor) / 3600);
      const beforeWh = state.energyWh;
      const generationWh = generationW * ((boundary - cursor) / 3600);
      const requestedLoadWh = loadW * ((boundary - cursor) / 3600);
      const rawEnergy = beforeWh + deltaWh;
      const consumedWh = Math.min(requestedLoadWh, beforeWh + generationWh);
      const spilledWh = Math.max(0, rawEnergy - configuration.capacityWh);
      state.energyWh = Math.max(0, Math.min(configuration.capacityWh, rawEnergy));
      state.generatedWh += generationWh;
      state.consumedWh += consumedWh;
      state.spilledWh += spilledWh;
      if (!state.depleted && state.energyWh <= ENERGY_EPSILON_WH && rawEnergy <= ENERGY_EPSILON_WH) {
        state.energyWh = 0;
        state.depleted = true;
        state.radioRunning = false;
        state.radioPaused = false;
        this.eventLog.push({ kind: "depleted", satelliteId, timeSeconds: boundary });
      } else if (state.depleted && state.energyWh >= configuration.restartWh - ENERGY_EPSILON_WH) {
        state.depleted = false;
        state.lastReason = null;
        this.eventLog.push({ kind: "recovered", satelliteId, timeSeconds: boundary });
      }
      cursor = boundary;
    }
  }

  nextBoundarySeconds(
    satellite: SatelliteDefinition,
    startsAtSeconds: number,
    endsAtSeconds: number,
    guardWh: number,
  ): number | null {
    const configuration = this.requireConfiguration(satellite.id);
    const state = this.requireState(satellite.id);
    let next = nextIlluminationBoundary(satellite, startsAtSeconds, endsAtSeconds);
    const eclipsed = isEclipsedAt(satellite, startsAtSeconds + ECLIPSE_ROOT_TOLERANCE_SECONDS);
    const generationW = eclipsed ? 0 : configuration.solarGenerationW;
    const captureLoad = this.hasAdmittedCaptureActive(satellite.id) ? configuration.captureAdditionalW : 0;
    const loadW = state.depleted ? 0 : configuration.housekeepingW + captureLoad
      + (state.radioRunning ? configuration.downlinkAdditionalW : 0);
    const rateWhPerSecond = (generationW - loadW) / 3600;
    let targetWh: number | null = null;
    if (state.depleted && rateWhPerSecond > 0) targetWh = configuration.restartWh;
    else if (!state.depleted && rateWhPerSecond < 0) {
      targetWh = state.radioRunning ? Math.max(configuration.reserveWh, guardWh) : 0;
    } else if (!state.depleted && !state.radioRunning && rateWhPerSecond > 0
      && state.radioPaused) {
      targetWh = Math.max(configuration.reserveWh, guardWh) + configuration.downlinkRestartMarginWh;
    } else if (!state.depleted && rateWhPerSecond > 0) targetWh = configuration.capacityWh;
    if (targetWh !== null && targetWh > configuration.capacityWh && state.radioPaused) targetWh = null;
    if (targetWh !== null && Math.abs(targetWh - state.energyWh) > ENERGY_EPSILON_WH) {
      const seconds = (targetWh - state.energyWh) / rateWhPerSecond;
      if (seconds > ECLIPSE_ROOT_TOLERANCE_SECONDS) {
        const crossing = startsAtSeconds + seconds;
        if (crossing < endsAtSeconds && (next === null || crossing < next)) next = crossing;
      }
    }
    return next;
  }

  reset(): void {
    this.eventLog.length = 0;
    this.captureDecisions.clear();
    this.configurations = new Map([...this.initialConfigurations].map(([id, configuration]) => [id, { ...configuration }]));
    for (const satelliteId of this.states.keys()) {
      if (!this.initialConfigurations.has(satelliteId)) this.states.delete(satelliteId);
    }
    for (const [satelliteId, configuration] of this.configurations) {
      this.states.set(satelliteId, {
        energyWh: configuration.initialEnergyWh,
        generatedWh: 0,
        consumedWh: 0,
        spilledWh: 0,
        depleted: configuration.initialEnergyWh === 0,
        radioRunning: false,
        radioPaused: false,
        lastReason: null,
      });
    }
  }

  private readonly captureDecisions = new Map<string, CapturePowerDecision>();

  private isAdmittedCaptureActive(satelliteId: string, atSeconds: number): boolean {
    for (const decision of this.captureDecisions.values()) {
      if (decision.satelliteId === satelliteId && decision.admitted
        && decision.startsAtSeconds <= atSeconds && decision.endsAtSeconds > atSeconds) return true;
    }
    return false;
  }

  private hasAdmittedCaptureActive(satelliteId: string): boolean {
    for (const decision of this.captureDecisions.values()) {
      if (decision.satelliteId === satelliteId && decision.admitted) return true;
    }
    return false;
  }

  private requireConfiguration(satelliteId: string): SatellitePowerConfiguration {
    const configuration = this.configurations.get(satelliteId);
    if (!configuration) throw new Error(`No power configuration for spacecraft ${satelliteId}`);
    return configuration;
  }

  private requireState(satelliteId: string): MutablePowerState {
    const state = this.states.get(satelliteId);
    if (!state) throw new Error(`No power state for spacecraft ${satelliteId}`);
    return state;
  }
}

export const PROTOTYPE_POWER_CONFIGURATION: SatellitePowerConfiguration = {
  capacityWh: 500,
  initialEnergyWh: 400,
  reserveWh: 100,
  restartWh: 150,
  downlinkRestartMarginWh: 10,
  solarGenerationW: 300,
  housekeepingW: 50,
  captureAdditionalW: 250,
  downlinkAdditionalW: 150,
};
