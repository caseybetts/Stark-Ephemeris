/** Lightweight deterministic cloud conditions for the prototype. */
export const WEATHER_EPOCH_UTC_MS = Date.parse("2026-01-01T00:00:00Z");
export const PROTOTYPE_CLOUD_THRESHOLD_PERCENT = 60;
export const PROTOTYPE_CLOUD_BASELINE_PERCENT = 50;

export type WeatherConfiguration = {
  seed: number;
  epochUtcMs?: number;
  baselinePercent?: number;
  /** Month-major Uint8 table: 12 × 180 × 360 whole-percentage values. */
  baselineTable?: Uint8Array;
  baselineVersion?: number;
  usableThresholdPercent?: number;
};

export type CloudForecast = {
  weight: 1 | 2 | 3 | 4;
  band: "clear" | "mixed" | "cloudy" | "overcast";
  forecastPercent: number;
  issuedHour: number;
  validAtSeconds: number;
};

const FINE_NOISE_SCALE = 148;

export function cloudCoverAtPercent(
  configuration: WeatherConfiguration,
  cellIndex: number,
  timeSeconds: number,
): number {
  validateRequest(configuration, cellIndex, timeSeconds);
  const hour = absoluteHourAt(configuration, timeSeconds);
  const parentCellIndex = Math.floor(cellIndex / 1440 / 4) * 360 + Math.floor((cellIndex % 1440) / 4);
  const region = cellIndexToRegion(cellIndex);
  const seed = configuration.seed ^ (configuration.baselineVersion ?? 0);
  const macro = keyedNoise(seed, region, Math.floor(hour / 6), 1, 12);
  const hourly = keyedNoise(seed, parentCellIndex, hour, 2, 8);
  const child = keyedNoise(seed, cellIndex, hour, 3, 12);
  return clampPercent(baselineAtPercent(configuration, cellIndex, timeSeconds) + macro + hourly + child);
}

/** Time-weighted mean over the collection interval; excludes any slew time. */
export function averageCloudCoverPercent(
  configuration: WeatherConfiguration,
  cellIndex: number,
  startsAtSeconds: number,
  endsAtSeconds: number,
): number {
  if (!Number.isFinite(startsAtSeconds) || !Number.isFinite(endsAtSeconds) || endsAtSeconds <= startsAtSeconds) {
    throw new RangeError("Cloud exposure interval must have positive finite duration");
  }
  let cursor = startsAtSeconds;
  let weightedPercentSeconds = 0;
  while (cursor < endsAtSeconds) {
    const epochUtcMs = configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS;
    const nextHour = ((absoluteHourAt(configuration, cursor) + 1) * 3_600_000 - epochUtcMs) / 1000;
    const segmentEnd = Math.min(endsAtSeconds, nextHour);
    weightedPercentSeconds += cloudCoverAtPercent(configuration, cellIndex, cursor) * (segmentEnd - cursor);
    cursor = segmentEnd;
  }
  return Math.round(weightedPercentSeconds / (endsAtSeconds - startsAtSeconds));
}

/** A stable hourly forecast. Only its coarse band and weight need reach the planner. */
export function cloudForecastAt(
  configuration: WeatherConfiguration,
  cellIndex: number,
  issuedAtSeconds: number,
  targetAtSeconds: number,
): CloudForecast {
  validateRequest(configuration, cellIndex, issuedAtSeconds);
  if (!Number.isFinite(targetAtSeconds) || targetAtSeconds < issuedAtSeconds) {
    throw new RangeError("Forecast target must be finite and no earlier than issue time");
  }
  const epochUtcMs = configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS;
  const issuedHour = absoluteHourAt(configuration, issuedAtSeconds);
  const targetHour = absoluteHourAt(configuration, targetAtSeconds);
  const leadHours = targetHour - issuedHour;
  const leadSpread = leadHours <= 6 ? 12 : leadHours <= 24 ? 20 : 28;
  const region = cellIndexToRegion(cellIndex);
  const seed = configuration.seed ^ (configuration.baselineVersion ?? 0);
  const macro = keyedNoise(seed, region, Math.floor(targetHour / 6), 1, 12);
  const error = keyedNoise(seed, cellIndex, targetHour, 4, leadSpread);
  const forecastPercent = clampPercent(baselineAtPercent(configuration, cellIndex, targetAtSeconds) + macro + error);
  const { weight, band } = forecastWeight(forecastPercent);
  return {
    weight,
    band,
    forecastPercent,
    issuedHour,
    validAtSeconds: ((issuedHour + 1) * 3_600_000 - epochUtcMs) / 1000,
  };
}

export function cloudForecastForInterval(
  configuration: WeatherConfiguration,
  cellIndex: number,
  issuedAtSeconds: number,
  startsAtSeconds: number,
  endsAtSeconds: number,
): CloudForecast {
  if (!Number.isFinite(startsAtSeconds) || !Number.isFinite(endsAtSeconds) || endsAtSeconds <= startsAtSeconds) {
    throw new RangeError("Forecast interval must have positive finite duration");
  }
  let cursor = startsAtSeconds;
  let weightedCover = 0;
  while (cursor < endsAtSeconds) {
    const epochUtcMs = configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS;
    const nextHour = ((absoluteHourAt(configuration, cursor) + 1) * 3_600_000 - epochUtcMs) / 1000;
    const segmentEnd = Math.min(endsAtSeconds, nextHour);
    const forecast = cloudForecastAt(configuration, cellIndex, issuedAtSeconds, cursor);
    weightedCover += forecast.forecastPercent * (segmentEnd - cursor);
    cursor = segmentEnd;
  }
  const forecastPercent = Math.round(weightedCover / (endsAtSeconds - startsAtSeconds));
  const { weight, band } = forecastWeight(forecastPercent);
  const issuedHour = absoluteHourAt(configuration, issuedAtSeconds);
  const epochUtcMs = configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS;
  return {
    weight,
    band,
    forecastPercent,
    issuedHour,
    validAtSeconds: ((issuedHour + 1) * 3_600_000 - epochUtcMs) / 1000,
  };
}

export function forecastWeight(cloudPercent: number): Pick<CloudForecast, "weight" | "band"> {
  if (cloudPercent <= 40) return { weight: 4, band: "clear" };
  if (cloudPercent <= 60) return { weight: 3, band: "mixed" };
  if (cloudPercent <= 80) return { weight: 2, band: "cloudy" };
  return { weight: 1, band: "overcast" };
}

function keyedNoise(seed: number, locationKey: number, timeKey: number, layer: number, spread: number): number {
  let hash = mix32(seed ^ Math.imul(locationKey + 1, 0x9e3779b1));
  hash = mix32(hash ^ Math.imul(timeKey + 1, 0x85ebca6b));
  hash = mix32(hash ^ Math.imul(layer + 1, 0xc2b2ae35));
  const sum = (hash & 255) + ((hash >>> 8) & 255) + ((hash >>> 16) & 255) + (hash >>> 24);
  return Math.round(((sum - 510) * spread) / FINE_NOISE_SCALE);
}

function mix32(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

function cellIndexToRegion(cellIndex: number): number {
  const columns = 1440;
  const row = Math.floor(cellIndex / columns);
  const column = cellIndex % columns;
  return Math.floor(row / 20) * 72 + Math.floor(column / 20);
}

function validateRequest(configuration: WeatherConfiguration, cellIndex: number, timeSeconds: number): void {
  if (!Number.isInteger(configuration.seed) || !Number.isInteger(cellIndex) || cellIndex < 0
    || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new RangeError("Weather lookup needs an integer seed and cell index and nonnegative finite time");
  }
  if (configuration.epochUtcMs !== undefined && !Number.isFinite(configuration.epochUtcMs)) {
    throw new RangeError("Weather scenario epoch must be a finite UTC timestamp");
  }
  const baseline = configuration.baselinePercent ?? PROTOTYPE_CLOUD_BASELINE_PERCENT;
  const threshold = configuration.usableThresholdPercent ?? PROTOTYPE_CLOUD_THRESHOLD_PERCENT;
  if (!Number.isInteger(baseline) || baseline < 0 || baseline > 100
    || !Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new RangeError("Weather baseline and usable threshold must be integer percentages");
  }
  if (configuration.baselineTable && configuration.baselineTable.length !== 12 * 180 * 360) {
    throw new RangeError("Weather baseline table must contain 12 × 180 × 360 percentage values");
  }
  if (configuration.baselineVersion !== undefined && !Number.isInteger(configuration.baselineVersion)) {
    throw new RangeError("Weather baseline version must be an integer");
  }
}

function absoluteHourAt(configuration: WeatherConfiguration, timeSeconds: number): number {
  return Math.floor(((configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS) + timeSeconds * 1000) / 3_600_000);
}

function baselineAtPercent(configuration: WeatherConfiguration, cellIndex: number, timeSeconds: number): number {
  const table = configuration.baselineTable;
  if (!table) return configuration.baselinePercent ?? PROTOTYPE_CLOUD_BASELINE_PERCENT;
  const timestamp = (configuration.epochUtcMs ?? WEATHER_EPOCH_UTC_MS) + timeSeconds * 1000;
  const month = new Date(timestamp).getUTCMonth();
  const row = Math.floor(cellIndex / 1440 / 4);
  const column = Math.floor((cellIndex % 1440) / 4);
  return table[(month * 180 + row) * 360 + column]!;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
