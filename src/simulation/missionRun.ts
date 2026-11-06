import { quoteSpacecraftPurchase } from "./spacecraftCatalog.ts";
import { circularOrbitPeriodSeconds } from "./world.ts";

export type MissionRunPhase = "setup" | "running" | "paused" | "completed";

export type MissionRunSnapshot = {
  phase: MissionRunPhase;
  elapsedSeconds: number;
  deadlineSeconds: number;
  remainingSeconds: number;
};

export type MissionOutcome = {
  missionId: string;
  success: boolean;
  deliveredRevenueCents: number;
  targetRevenueCents: number;
  completedAtSeconds: number;
};

export type MissionDefinition = {
  id: string;
  title: string;
  summary: string;
  constraint: string;
  startingBudgetUsd: number;
  targetRevenueCents: number;
  durationSeconds: number;
  stationCount: number;
  setupFeeCentsPerStation: number;
  weatherSeed: number;
  usableCloudThresholdPercent: number;
  downlinkRateMultiplier: number;
};

/** Prototype mission values are deliberately shared except for one operating constraint. */
const MISSION_BASE = {
  startingBudgetUsd: 55_120_000,
  targetRevenueCents: 200_000,
  durationSeconds: 24 * 60 * 60,
  stationCount: 4,
  setupFeeCentsPerStation: 500_000,
  weatherSeed: 20261014,
};

export const MISSION_CATALOG: readonly MissionDefinition[] = Object.freeze([
  {
  id: "M01",
  title: "First Delivery",
    summary: "Establish the baseline with the current operating conditions.",
    constraint: "Standard weather · standard downlink",
    ...MISSION_BASE,
    usableCloudThresholdPercent: 30,
    downlinkRateMultiplier: 1,
  },
  {
    id: "M02",
    title: "Narrow Link Margin",
    summary: "Deliver the same objective while ground-station links run slower.",
    constraint: "Downlink speed reduced to 20%",
    ...MISSION_BASE,
    usableCloudThresholdPercent: 30,
    downlinkRateMultiplier: 0.2,
  },
  {
    id: "M03",
    title: "Clear-Sky Window",
    summary: "Plan carefully around a strict cloud limit for successful collections.",
    constraint: "Cloud tolerance reduced to 10%",
    ...MISSION_BASE,
    usableCloudThresholdPercent: 10,
    downlinkRateMultiplier: 1,
  },
]);

export const M01_MISSION = MISSION_CATALOG[0]!;

export type MissionSetupDraft = {
  equipmentOptionId: string;
  altitudeKm: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  phaseAtLaunchDeg: number;
};

export type MissionSetupValidation = {
  valid: boolean;
  reason: string | null;
  stationSetupCostCents: number;
  remainingBudgetCents: number;
  equipmentOptionId: string | null;
};

/** Validate M01's selected package/orbit and quote the complete setup before ledger mutation. */
export function validateM01Setup(draft: MissionSetupDraft, startingCashCents: number): MissionSetupValidation {
  const stationSetupCostCents = M01_MISSION.stationCount * M01_MISSION.setupFeeCentsPerStation;
  const invalid = (reason: string): MissionSetupValidation => ({
    valid: false,
    reason,
    stationSetupCostCents,
    remainingBudgetCents: startingCashCents,
    equipmentOptionId: null,
  });
  if (!Number.isSafeInteger(startingCashCents) || startingCashCents < 0) return invalid("Mission allowance must be whole non-negative cents.");
  if (![draft.altitudeKm, draft.inclinationDeg, draft.ascendingNodeDeg, draft.phaseAtLaunchDeg].every(Number.isFinite)) {
    return invalid("Enter finite orbit values.");
  }
  if (draft.altitudeKm < 10) return invalid("Orbit altitude must be at least 10 km.");
  if (!Number.isFinite(circularOrbitPeriodSeconds(draft.altitudeKm))) {
    return invalid("Orbit altitude is outside the simulation's numeric range.");
  }
  if (draft.inclinationDeg < 0 || draft.inclinationDeg > 180) return invalid("Inclination must be between 0° and 180°.");
  if (draft.ascendingNodeDeg < 0 || draft.ascendingNodeDeg > 359) return invalid("Ascending node must be between 0° and 359°.");
  if (draft.phaseAtLaunchDeg < 0 || draft.phaseAtLaunchDeg > 359) return invalid("Launch phase must be between 0° and 359°.");
  try {
    const quote = quoteSpacecraftPurchase(draft.equipmentOptionId, startingCashCents - stationSetupCostCents);
    if (!quote.affordable) return invalid("Selected spacecraft package and station setup exceed the mission allowance.");
    return {
      valid: true,
      reason: null,
      stationSetupCostCents,
      remainingBudgetCents: quote.cashAfterPurchaseCents,
      equipmentOptionId: quote.option.id,
    };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Select a valid spacecraft package.");
  }
}

/** Owns the mission lifecycle and caps every requested advance at its deadline. */
export class MissionRunController {
  private phaseValue: MissionRunPhase = "setup";
  private outcomeValue: MissionOutcome | null = null;
  readonly deadlineSeconds: number;

  constructor(deadlineSeconds: number, private readonly mission: MissionDefinition = M01_MISSION) {
    if (!Number.isFinite(deadlineSeconds) || deadlineSeconds <= 0) {
      throw new RangeError("Mission deadline must be finite and positive");
    }
    this.deadlineSeconds = deadlineSeconds;
  }

  get phase(): MissionRunPhase { return this.phaseValue; }
  get outcome(): MissionOutcome | null {
    return this.outcomeValue ? { ...this.outcomeValue } : null;
  }

  begin(elapsedSeconds: number, setup: MissionSetupValidation): void {
    if (this.phaseValue !== "setup" || elapsedSeconds !== 0) {
      throw new Error("A mission can only begin from clean setup at time zero");
    }
    if (!setup.valid || !setup.equipmentOptionId) {
      throw new Error(setup.reason ?? "A valid M01 setup is required to start the mission");
    }
    this.phaseValue = "running";
  }

  pause(): void {
    if (this.phaseValue === "running") this.phaseValue = "paused";
  }

  resume(): void {
    if (this.phaseValue !== "paused") throw new Error("Only a paused mission can resume");
    this.phaseValue = "running";
  }

  advanceBy(requestedSeconds: number, elapsedSeconds: number, advance: (seconds: number) => number): number {
    if (!Number.isFinite(requestedSeconds) || requestedSeconds < 0) {
      throw new RangeError("Mission time advance must be finite and non-negative");
    }
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > this.deadlineSeconds) {
      throw new RangeError("Mission elapsed time must be within its deadline");
    }
    if (this.phaseValue !== "running" || requestedSeconds === 0) return elapsedSeconds;
    const remainingSeconds = Math.max(0, this.deadlineSeconds - elapsedSeconds);
    const boundedAdvanceSeconds = Math.min(requestedSeconds, remainingSeconds);
    if (boundedAdvanceSeconds === 0) {
      this.phaseValue = "completed";
      return elapsedSeconds;
    }
    const advancedTo = advance(boundedAdvanceSeconds);
    const expectedElapsedSeconds = elapsedSeconds + boundedAdvanceSeconds;
    if (!Number.isFinite(advancedTo) || advancedTo !== expectedElapsedSeconds) {
      throw new Error("Simulation advance did not stop at the requested mission boundary");
    }
    if (advancedTo >= this.deadlineSeconds) this.phaseValue = "completed";
    return advancedTo;
  }

  /** Evaluate the delivered-revenue objective once the run reaches its deadline. */
  evaluate(deliveredRevenueCents: number): MissionOutcome {
    if (this.phaseValue !== "completed") throw new Error("A mission can only be evaluated after its deadline");
    if (!Number.isSafeInteger(deliveredRevenueCents) || deliveredRevenueCents < 0) {
      throw new RangeError("Delivered revenue must be whole non-negative cents");
    }
    if (this.outcomeValue) return { ...this.outcomeValue };
    this.outcomeValue = {
      missionId: this.mission.id,
      success: deliveredRevenueCents >= this.mission.targetRevenueCents,
      deliveredRevenueCents,
      targetRevenueCents: this.mission.targetRevenueCents,
      completedAtSeconds: this.deadlineSeconds,
    };
    return { ...this.outcomeValue };
  }

  retry(): void {
    if (this.phaseValue === "running" || this.phaseValue === "paused") {
      throw new Error("An active mission must finish before it can be retried");
    }
    this.phaseValue = "setup";
    this.outcomeValue = null;
  }

  getSnapshot(elapsedSeconds: number): MissionRunSnapshot {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > this.deadlineSeconds) {
      throw new RangeError("Mission elapsed time must be finite and within its deadline");
    }
    return {
      phase: this.phaseValue,
      elapsedSeconds,
      deadlineSeconds: this.deadlineSeconds,
      remainingSeconds: Math.max(0, this.deadlineSeconds - elapsedSeconds),
    };
  }
}

