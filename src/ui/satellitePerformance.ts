import type { SatelliteOperationalTimeSnapshot, SatelliteYieldSnapshot } from "../simulation/satellitePerformance.ts";
import { formatPercent } from "../format.ts";

type ChartEntry = { label: string; value: number; color: string; detail?: string };

const money = (cents: number): string => (cents / 100).toLocaleString(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const hours = (seconds: number): string => `${(seconds / 3_600).toFixed(1)} h`;

function setDonut(donut: HTMLElement, entries: readonly ChartEntry[], total: number): void {
  if (total <= 0) {
    donut.style.background = "conic-gradient(#23363b 0% 100%)";
    return;
  }
  let cursor = 0;
  const stops = entries.filter(entry => entry.value > 0).map(entry => {
    const next = cursor + entry.value / total * 100;
    const stop = `${entry.color} ${cursor.toFixed(3)}% ${next.toFixed(3)}%`;
    cursor = next;
    return stop;
  });
  donut.style.background = `conic-gradient(${stops.join(", ")})`;
}

function renderLegend(list: HTMLElement, entries: readonly ChartEntry[], total: number, unit: string): void {
  list.replaceChildren(...entries.map(entry => {
    const item = document.createElement("li");
    const marker = document.createElement("span");
    marker.className = "performance-legend-marker";
    marker.style.backgroundColor = entry.color;
    const label = document.createElement("span");
    label.className = "performance-legend-label";
    label.textContent = entry.label;
    const value = document.createElement("strong");
    value.textContent = entry.detail ?? `${entry.value}${total > 0 ? ` · ${formatPercent(entry.value / total * 100)}%` : ` ${unit}`}`;
    item.append(marker, label, value);
    return item;
  }));
}

function chart(title: string, ariaLabel: string): {
  section: HTMLElement;
  donut: HTMLElement;
  centerValue: HTMLElement;
  centerLabel: HTMLElement;
  legend: HTMLUListElement;
} {
  const section = document.createElement("section");
  section.className = "performance-chart";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const row = document.createElement("div");
  row.className = "performance-chart-row";
  const donut = document.createElement("div");
  donut.className = "performance-donut";
  donut.setAttribute("role", "img");
  donut.setAttribute("aria-label", ariaLabel);
  const center = document.createElement("div");
  center.className = "performance-donut-center";
  const centerValue = document.createElement("strong");
  const centerLabel = document.createElement("span");
  center.append(centerValue, centerLabel);
  donut.append(center);
  const legend = document.createElement("ul");
  legend.className = "performance-legend";
  row.append(donut, legend);
  section.append(heading, row);
  return { section, donut, centerValue, centerLabel, legend };
}

export function mountSatellitePerformanceView(container: HTMLElement): (
  yieldSnapshot: SatelliteYieldSnapshot,
  timeSnapshot: SatelliteOperationalTimeSnapshot,
) => void {
  const panel = document.createElement("section");
  panel.className = "satellite-performance";
  panel.setAttribute("aria-label", "Satellite collection yield and operational time");
  const heading = document.createElement("div");
  heading.className = "satellite-performance-heading";
  const title = document.createElement("h3");
  title.textContent = "PERFORMANCE";
  const period = document.createElement("span");
  period.textContent = "THIS RUN · SINCE LAUNCH";
  heading.append(title, period);

  const metrics = document.createElement("div");
  metrics.className = "satellite-yield-metrics";
  const metric = (label: string): HTMLElement => {
    const item = document.createElement("div");
    item.className = "satellite-yield-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const value = document.createElement("strong");
    item.append(caption, value);
    metrics.append(item);
    return value;
  };
  const paidClear = metric("PAID CLEAR YIELD · ≤30% CLOUD");
  const attempts = metric("COLLECTION ATTEMPTS");
  const revenue = metric("DELIVERED REVENUE");
  const deleted = metric("IMAGES DELETED");

  const charts = document.createElement("div");
  charts.className = "satellite-performance-charts";
  const collectionsChart = chart("Collection outcomes", "Collection outcomes by current delivery status");
  const timeChart = chart("Operational time", "Measured nominal and power-limited time");
  charts.append(collectionsChart.section, timeChart.section);
  panel.append(heading, metrics, charts);
  container.append(panel);

  return (yieldSnapshot, timeSnapshot) => {
    paidClear.textContent = yieldSnapshot.paidClearPercent === null
      ? "—"
      : `${formatPercent(yieldSnapshot.paidClearPercent)}%`;
    paidClear.title = yieldSnapshot.paidClearPercent === null
      ? "No collection attempts have completed."
      : `${yieldSnapshot.paidClearCount} qualifying collections out of ${yieldSnapshot.attemptCount} resolved attempts.`;
    attempts.textContent = yieldSnapshot.attemptCount.toLocaleString();
    revenue.textContent = money(yieldSnapshot.deliveredRevenueCents);
    deleted.textContent = yieldSnapshot.deletedCount.toLocaleString();

    const outcomeEntries: ChartEntry[] = [
      { label: "Paid clear", value: yieldSnapshot.paidClearCount, color: "#72d9bd" },
      { label: "Awaiting downlink", value: yieldSnapshot.pendingCount, color: "#6eb9e8" },
      { label: "Deleted", value: yieldSnapshot.deletedCount, color: "#c98472" },
      { label: "Cloud rejected", value: yieldSnapshot.cloudRejectedCount, color: "#bba2e6" },
      { label: "Other failure", value: yieldSnapshot.otherFailureCount, color: "#d89c51" },
      { label: "Other delivered", value: yieldSnapshot.otherDeliveredCount, color: "#8b9da0" },
    ];
    setDonut(collectionsChart.donut, outcomeEntries, yieldSnapshot.attemptCount);
    collectionsChart.centerValue.textContent = yieldSnapshot.attemptCount.toLocaleString();
    collectionsChart.centerLabel.textContent = "attempts";
    collectionsChart.donut.setAttribute("aria-label", `Collection outcomes: ${yieldSnapshot.attemptCount} attempts`);
    renderLegend(collectionsChart.legend, outcomeEntries, yieldSnapshot.attemptCount, "attempts");

    const timeEntries: ChartEntry[] = [
      { label: "Nominal", value: timeSnapshot.nominalSeconds, color: "#72d9bd", detail: hours(timeSnapshot.nominalSeconds) },
      { label: "Power limited", value: timeSnapshot.powerLimitedSeconds, color: "#d89c51", detail: hours(timeSnapshot.powerLimitedSeconds) },
      { label: "Anomaly", value: 0, color: "#c98472", detail: "Not modeled" },
      { label: "Scheduled downtime", value: 0, color: "#bba2e6", detail: "Not modeled" },
    ];
    setDonut(timeChart.donut, timeEntries.slice(0, 2), timeSnapshot.elapsedSeconds);
    timeChart.centerValue.textContent = hours(timeSnapshot.elapsedSeconds);
    timeChart.centerLabel.textContent = "elapsed";
    timeChart.donut.setAttribute("aria-label", `Operational time: ${hours(timeSnapshot.elapsedSeconds)} elapsed`);
    renderLegend(timeChart.legend, timeEntries, timeSnapshot.elapsedSeconds, "seconds");
  };
}
