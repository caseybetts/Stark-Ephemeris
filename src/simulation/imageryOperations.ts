import type { GroundContactWindow } from "./contacts.ts";
import type { CellMarketState, ImageLifecycleEvent } from "./cellMarketState.ts";
import type { SurfaceObject } from "./model.ts";

export type ImageryOperationsConfiguration = {
  storageCapacityBytesBySatellite: Readonly<Record<string, number>>;
};

/**
 * Prototype storage and transfer rules, independent of UI and rendering.
 * Capacity eviction uses the captured cell-priority score; ties evict the
 * oldest image first, then image ID. Downlink is FIFO and a single station
 * link is used per spacecraft at a time (the fastest active link wins).
 */
export class ImageryOperations {
  private eventSequence = 0;
  private readonly configuration: ImageryOperationsConfiguration;
  private readonly fractionalBytesByImage = new Map<string, number>();

  constructor(configuration: ImageryOperationsConfiguration) {
    this.configuration = configuration;
    for (const [satelliteId, capacityBytes] of Object.entries(configuration.storageCapacityBytesBySatellite)) {
      if (!satelliteId.trim() || !Number.isSafeInteger(capacityBytes) || capacityBytes <= 0) {
        throw new RangeError("Each spacecraft needs a positive whole-byte storage capacity");
      }
    }
  }

  enforceStorageCapacity(market: CellMarketState, satelliteId: string, timeSeconds: number): ImageLifecycleEvent[] {
    const capacityBytes = this.configuration.storageCapacityBytesBySatellite[satelliteId];
    if (capacityBytes === undefined) throw new Error(`No storage capacity is configured for spacecraft ${satelliteId}`);
    const events: ImageLifecycleEvent[] = [];
    let onboard = market.getImages().filter(image => image.satelliteId === satelliteId && image.status === "onboard");
    let usedBytes = onboard.reduce((total, image) => total + image.sizeBytes, 0);
    while (usedBytes > capacityBytes) {
      const lowestPriority = onboard.sort((left, right) =>
        left.initialRetentionPriorityPoints - right.initialRetentionPriorityPoints
        || left.capturedAtSeconds - right.capturedAtSeconds
        || left.imageId.localeCompare(right.imageId),
      )[0];
      if (!lowestPriority) break;
      events.push(market.deleteUndeliveredImage(
        lowestPriority.imageId,
        this.nextEventId("storage-delete"),
        timeSeconds,
      ));
      this.fractionalBytesByImage.delete(lowestPriority.imageId);
      usedBytes -= lowestPriority.sizeBytes;
      onboard = onboard.filter(image => image.imageId !== lowestPriority.imageId);
    }
    return events;
  }

  advanceDownlink(
    market: CellMarketState,
    startsAtSeconds: number,
    endsAtSeconds: number,
    activeContacts: readonly (GroundContactWindow & { station: SurfaceObject })[],
  ): ImageLifecycleEvent[] {
    if (!Number.isFinite(startsAtSeconds) || !Number.isFinite(endsAtSeconds) || startsAtSeconds < 0 || endsAtSeconds < startsAtSeconds) {
      throw new RangeError("Downlink interval must be finite, non-negative, and ordered");
    }
    const contactsBySatellite = new Map<string, Array<GroundContactWindow & { station: SurfaceObject }>>();
    for (const contact of activeContacts) {
      const rate = contact.station.groundStationDetails?.downlinkRateMbps ?? 0;
      if (rate <= 0 || contact.station.groundStationDetails?.operationalStatus !== "available") continue;
      const group = contactsBySatellite.get(contact.satelliteId) ?? [];
      group.push(contact);
      contactsBySatellite.set(contact.satelliteId, group);
    }

    const events: ImageLifecycleEvent[] = [];
    for (const [satelliteId, contacts] of contactsBySatellite) {
      // Overlapping station passes are not combined; use the fastest active link.
      const station = contacts.sort((left, right) =>
        (right.station.groundStationDetails?.downlinkRateMbps ?? 0)
        - (left.station.groundStationDetails?.downlinkRateMbps ?? 0)
        || left.stationId.localeCompare(right.stationId),
      )[0]!.station;
      const bytesPerSecond = (station.groundStationDetails!.downlinkRateMbps * 1_000_000) / 8;
      let cursorSeconds = startsAtSeconds;
      const onboard = market.getImages()
        .filter(image => image.satelliteId === satelliteId && image.status === "onboard")
        .sort((left, right) =>
          left.capturedAtSeconds - right.capturedAtSeconds || left.imageId.localeCompare(right.imageId),
        );

      for (const image of onboard) {
        cursorSeconds = Math.max(cursorSeconds, image.capturedAtSeconds);
        if (cursorSeconds >= endsAtSeconds) break;
        const remainingBytes = image.sizeBytes - image.transferredBytes;
        const fractionalCredit = this.fractionalBytesByImage.get(image.imageId) ?? 0;
        const exactAvailableBytes = (endsAtSeconds - cursorSeconds) * bytesPerSecond + fractionalCredit;
        if (exactAvailableBytes <= 0) continue;
        if (exactAvailableBytes >= remainingBytes) {
          const completedAtSeconds = cursorSeconds + (remainingBytes - fractionalCredit) / bytesPerSecond;
          events.push(market.downlinkImage(
            image.imageId,
            this.nextEventId("downlink"),
            completedAtSeconds,
            image.valuePotentialUsdAtCapture,
          ));
          this.fractionalBytesByImage.delete(image.imageId);
          cursorSeconds = completedAtSeconds;
        } else {
          const availableBytes = Math.floor(exactAvailableBytes);
          this.fractionalBytesByImage.set(image.imageId, exactAvailableBytes - availableBytes);
          if (availableBytes > 0) {
            const transferredBytes = image.transferredBytes + availableBytes;
            events.push(market.updateImageTransferProgress(
              image.imageId,
              this.nextEventId("transfer-progress"),
              endsAtSeconds,
              transferredBytes,
            ));
          }
          break;
        }
      }
    }
    return events;
  }

  getCapacityBytes(satelliteId: string): number {
    const capacityBytes = this.configuration.storageCapacityBytesBySatellite[satelliteId];
    if (capacityBytes === undefined) throw new Error(`No storage capacity is configured for spacecraft ${satelliteId}`);
    return capacityBytes;
  }

  reset(): void {
    this.eventSequence = 0;
    this.fractionalBytesByImage.clear();
  }

  private nextEventId(kind: string): string {
    return `imagery-${kind}-${this.eventSequence++}`;
  }
}
