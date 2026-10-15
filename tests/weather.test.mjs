import test from "node:test";
import assert from "node:assert/strict";
import {
  averageCloudCoverPercent,
  cloudCoverAtPercent,
  cloudForecastAt,
  cloudForecastForInterval,
  forecastWeight,
} from "../src/simulation/weather.ts";

const WEATHER = { seed: 17, baselinePercent: 50, usableThresholdPercent: 60 };

test("actual weather is keyed, bounded, and independent of lookup order", () => {
  const first = cloudCoverAtPercent(WEATHER, 800_123, 22_001);
  cloudCoverAtPercent(WEATHER, 100, 3_600);
  assert.equal(cloudCoverAtPercent(WEATHER, 800_123, 22_001), first);
  assert.ok(first >= 0 && first <= 100);
  assert.notEqual(cloudCoverAtPercent({ ...WEATHER, seed: 18 }, 800_123, 22_001), first);
});

test("monthly baseline lookup uses the UTC calendar month and one-degree weather cell", () => {
  const table = new Uint8Array(12 * 180 * 360);
  table.fill(50);
  table.fill(70, 180 * 360, 2 * 180 * 360);
  const atJanuary = cloudCoverAtPercent({ ...WEATHER, baselineTable: table }, 0, 0);
  const atFebruary = cloudCoverAtPercent({ ...WEATHER, baselineTable: table }, 0, 31 * 24 * 3600);
  const flatTable = new Uint8Array(12 * 180 * 360);
  flatTable.fill(50);
  const flatJanuary = cloudCoverAtPercent({ ...WEATHER, baselineTable: flatTable }, 0, 0);
  const flatFebruary = cloudCoverAtPercent({ ...WEATHER, baselineTable: flatTable }, 0, 31 * 24 * 3600);
  assert.equal(atJanuary, flatJanuary);
  assert.equal(atFebruary - flatFebruary, 20);
});

test("collection exposure is time weighted and stops at the exact hour boundary", () => {
  const cellIndex = 412_777;
  const firstHour = cloudCoverAtPercent(WEATHER, cellIndex, 3_590);
  const secondHour = cloudCoverAtPercent(WEATHER, cellIndex, 3_600);
  assert.equal(averageCloudCoverPercent(WEATHER, cellIndex, 3_590, 3_600), firstHour);
  assert.equal(averageCloudCoverPercent(WEATHER, cellIndex, 3_590, 3_610), Math.round((firstHour + secondHour) / 2));
});

test("hourly forecast is stable within its issue hour and uses coarse monotone weights", () => {
  const first = cloudForecastAt(WEATHER, 31_440, 120, 6 * 3600);
  const repeated = cloudForecastAt(WEATHER, 31_440, 300, 6 * 3600);
  assert.equal(first.forecastPercent, repeated.forecastPercent);
  assert.equal(first.weight, repeated.weight);
  assert.equal(forecastWeight(20).weight, 4);
  assert.equal(forecastWeight(50).weight, 3);
  assert.equal(forecastWeight(70).weight, 2);
  assert.equal(forecastWeight(90).weight, 1);
});

test("forecast exposure averages hourly outlooks across a collection boundary", () => {
  const first = cloudForecastAt(WEATHER, 31_440, 0, 3_590).forecastPercent;
  const second = cloudForecastAt(WEATHER, 31_440, 0, 3_600).forecastPercent;
  const interval = cloudForecastForInterval(WEATHER, 31_440, 0, 3_590, 3_610);
  assert.equal(interval.forecastPercent, Math.round((first + second) / 2));
});

