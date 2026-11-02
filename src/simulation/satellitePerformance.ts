import type { CellImageRecord } from "./cellMarketState.ts";

export type CaptureFailureKind = "weather" | "power" | "geometry" | "timing" | "market" | "image-creation";

export type CaptureAttemptRecord = {
  id: string;
  satelliteId: string;
  commandId: string;
  startedAtSeconds: number;
  collectionStartedAtSeconds: number;
  collectionEndedAtSeconds: number;
  completedAtSeconds: number;
  observedCloudCoverPercent: number | null;
  acceptedThresholdPercent: number;
  imageId: string | null;
  failureKind: CaptureFailureKind | null;
};

export type SatelliteYieldSnapshot = {
  attemptCount: number;
  paidClearCount: number;
  paidClearPercent: number | null;
  pendingCount: number;
  deletedCount: number;
  cloudRejectedCount: number;
  otherFailureCount: number;
  otherDeliveredCount: number;
  deliveredRevenueCents: number;
};

export type SatelliteOperationalTimeSnapshot = {
  elapsedSeconds: number;
  nominalSeconds: number;
  powerLimitedSeconds: number;
  anomalySeconds: null;
  scheduledDowntimeSeconds: null;
};

type SatelliteTime = {
  registeredAtSeconds: number;
  recordedThroughSeconds: number;
  powerLimitedSeconds: number;
};

/** Renderer-independent, run-scoped collection outcomes and measured constraint time. */
export class SatellitePerformance {
  private readonly attemptsById = new Map<string, CaptureAttemptRecord>();
  private readonly timeBySatelliteId = new Map<string, SatelliteTime>();
  private readonly yieldCache = new Map<string, {
    attemptRevision: number;
    imageryRevision: number;
    snapshot: SatelliteYieldSnapshot;
  }>();
  private attemptRevision = 0;

  constructor(satelliteIds: readonly string[], startSeconds = 0) {
    for (const satelliteId of satelliteIds) this.registerSatellite(satelliteId, startSeconds);
  }

  registerSatellite(satelliteId: string, atSeconds: number): void {
    this.validateIdentityAndTime(satelliteId, atSeconds);
    if (this.timeBySatelliteId.has(satelliteId)) throw new Error(`Performance history already exists for satellite: ${satelliteId}`);
    this.timeBySatelliteId.set(satelliteId, {
      registeredAtSeconds: atSeconds,
      recordedThroughSeconds: atSeconds,
      powerLimitedSeconds: 0,
    });
  }

  recordCaptureAttempt(attempt: CaptureAttemptRecord): void {
    this.validateIdentityAndTime(attempt.satelliteId, attempt.startedAtSeconds);
    if (!attempt.id.trim() || !attempt.commandId.trim()) throw new Error("Capture attempt and command IDs are required");
    if (this.attemptsById.has(attempt.id)) throw new Error(`Capture attempt already recorded: ${attempt.id}`);
    if (!Number.isFinite(attempt.collectionStartedAtSeconds)
      || !Number.isFinite(attempt.collectionEndedAtSeconds)
      || attempt.collectionStartedAtSeconds < attempt.startedAtSeconds
      || attempt.collectionEndedAtSeconds < attempt.collectionStartedAtSeconds
      || !Number.isFinite(attempt.completedAtSeconds) || attempt.completedAtSeconds < attempt.startedAtSeconds
      || !Number.isInteger(attempt.acceptedThresholdPercent)
      || attempt.acceptedThresholdPercent < 0 || attempt.acceptedThresholdPercent > 100
      || (attempt.observedCloudCoverPercent !== null
        && (!Number.isInteger(attempt.observedCloudCoverPercent)
          || attempt.observedCloudCoverPercent < 0 || attempt.observedCloudCoverPercent > 100))) {
      throw new RangeError("Capture performance evidence is invalid");
    }
    this.attemptsById.set(attempt.id, { ...attempt });
    this.attemptRevision += 1;
    this.yieldCache.clear();
  }

  recordOperationalInterval(
    satelliteId: string,
    startsAtSeconds: number,
    endsAtSeconds: number,
    powerLimited: boolean,
  ): void {
    const time = this.requireTime(satelliteId);
    if (!Number.isFinite(startsAtSeconds) || !Number.isFinite(endsAtSeconds)
      || startsAtSeconds < time.registeredAtSeconds || endsAtSeconds < startsAtSeconds) {
      throw new RangeError("Operational interval is invalid");
    }
    if (startsAtSeconds !== time.recordedThroughSeconds) {
      throw new Error(`Operational interval for ${satelliteId} is not contiguous`);
    }
    if (powerLimited) time.powerLimitedSeconds += endsAtSeconds - startsAtSeconds;
    time.recordedThroughSeconds = endsAtSeconds;
  }

  getCaptureAttempts(satelliteId: string): readonly CaptureAttemptRecord[] {
    this.requireTime(satelliteId);
    return [...this.attemptsById.values()]
      .filter(attempt => attempt.satelliteId === satelliteId)
      .map(attempt => ({ ...attempt }));
  }

  getYieldSnapshot(satelliteId: string, images: readonly CellImageRecord[], imageryRevision?: number): SatelliteYieldSnapshot {
    this.requireTime(satelliteId);
    const cached = this.yieldCache.get(satelliteId);
    if (imageryRevision !== undefined && cached
      && cached.attemptRevision === this.attemptRevision && cached.imageryRevision === imageryRevision) {
      return { ...cached.snapshot };
    }
    const attempts = this.getCaptureAttempts(satelliteId);
    const imagesById = new Map(images.map(image => [image.imageId, image]));
    const snapshot: SatelliteYieldSnapshot = {
      attemptCount: attempts.length,
      paidClearCount: 0,
      paidClearPercent: null,
      pendingCount: 0,
      deletedCount: 0,
      cloudRejectedCount: 0,
      otherFailureCount: 0,
      otherDeliveredCount: 0,
      deliveredRevenueCents: 0,
    };

    for (const attempt of attempts) {
      if (attempt.failureKind === "weather") {
        snapshot.cloudRejectedCount += 1;
        continue;
      }
      if (attempt.failureKind !== null) {
        snapshot.otherFailureCount += 1;
        continue;
      }
      const image = attempt.imageId ? imagesById.get(attempt.imageId) : undefined;
      if (!image) {
        snapshot.otherFailureCount += 1;
      } else if (image.status === "onboard") {
        snapshot.pendingCount += 1;
      } else if (image.status === "deleted") {
        snapshot.deletedCount += 1;
      } else {
        const revenueCents = Math.round((image.settledRevenueUsd ?? 0) * 100);
        snapshot.deliveredRevenueCents += revenueCents;
        if (revenueCents > 0
          && attempt.observedCloudCoverPercent !== null
          && attempt.observedCloudCoverPercent <= attempt.acceptedThresholdPercent) {
          snapshot.paidClearCount += 1;
        } else {
          snapshot.otherDeliveredCount += 1;
        }
      }
    }
    if (snapshot.attemptCount > 0) {
      snapshot.paidClearPercent = snapshot.paidClearCount / snapshot.attemptCount * 100;
    }
    if (imageryRevision !== undefined) {
      this.yieldCache.set(satelliteId, {
        attemptRevision: this.attemptRevision,
        imageryRevision,
        snapshot,
      });
    }
    return { ...snapshot };
  }

  getFleetYieldSnapshot(images: readonly CellImageRecord[], imageryRevision?: number): SatelliteYieldSnapshot {
    const aggregate: SatelliteYieldSnapshot = {
      attemptCount: 0,
      paidClearCount: 0,
      paidClearPercent: null,
      pendingCount: 0,
      deletedCount: 0,
      cloudRejectedCount: 0,
      otherFailureCount: 0,
      otherDeliveredCount: 0,
      deliveredRevenueCents: 0,
    };
    for (const satelliteId of this.timeBySatelliteId.keys()) {
      const snapshot = this.getYieldSnapshot(satelliteId, images, imageryRevision);
      aggregate.attemptCount += snapshot.attemptCount;
      aggregate.paidClearCount += snapshot.paidClearCount;
      aggregate.pendingCount += snapshot.pendingCount;
      aggregate.deletedCount += snapshot.deletedCount;
      aggregate.cloudRejectedCount += snapshot.cloudRejectedCount;
      aggregate.otherFailureCount += snapshot.otherFailureCount;
      aggregate.otherDeliveredCount += snapshot.otherDeliveredCount;
      aggregate.deliveredRevenueCents += snapshot.deliveredRevenueCents;
    }
    if (aggregate.attemptCount > 0) {
      aggregate.paidClearPercent = aggregate.paidClearCount / aggregate.attemptCount * 100;
    }
    return aggregate;
  }

  getOperationalTimeSnapshot(satelliteId: string, nowSeconds: number): SatelliteOperationalTimeSnapshot {
    const time = this.requireTime(satelliteId);
    if (!Number.isFinite(nowSeconds) || nowSeconds < time.recordedThroughSeconds) {
      throw new RangeError("Performance time cannot precede recorded simulation time");
    }
    const elapsedSeconds = nowSeconds - time.registeredAtSeconds;
    const powerLimitedSeconds = time.powerLimitedSeconds;
    return {
      elapsedSeconds,
      powerLimitedSeconds,
      nominalSeconds: Math.max(0, elapsedSeconds - powerLimitedSeconds),
      anomalySeconds: null,
      scheduledDowntimeSeconds: null,
    };
  }

  reset(satelliteIds: readonly string[], startSeconds = 0): void {
    this.attemptsById.clear();
    this.timeBySatelliteId.clear();
    this.yieldCache.clear();
    this.attemptRevision += 1;
    for (const satelliteId of satelliteIds) this.registerSatellite(satelliteId, startSeconds);
  }

  private requireTime(satelliteId: string): SatelliteTime {
    const time = this.timeBySatelliteId.get(satelliteId);
    if (!time) throw new Error(`Unknown satellite performance history: ${satelliteId}`);
    return time;
  }

  private validateIdentityAndTime(satelliteId: string, timeSeconds: number): void {
    if (!satelliteId.trim()) throw new Error("Satellite ID is required");
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Performance time must be finite and non-negative");
  }
}
