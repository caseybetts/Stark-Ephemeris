import type { CompanyFinance } from "../simulation/companyFinance.ts";

const money = (cents: number): string => (cents / 100).toLocaleString(undefined, {
  style: "currency",
  currency: "USD",
});

const simulationTime = (seconds: number): string => {
  const wholeSeconds = Math.floor(seconds);
  const day = Math.floor(wholeSeconds / 86_400);
  const withinDay = wholeSeconds % 86_400;
  const hours = Math.floor(withinDay / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((withinDay % 3_600) / 60).toString().padStart(2, "0");
  return `Day ${day.toString().padStart(3, "0")} · ${hours}:${minutes} UTC`;
};

const entryLabel = (kind: string): string => {
  switch (kind) {
    case "downlink-revenue": return "Downlink revenue";
    case "spacecraft-operating-cost": return "Spacecraft operations";
    case "ground-station-operating-cost": return "Ground station operations";
    case "ground-station-contact-cost": return "Ground station contact time";
    case "spacecraft-procurement": return "Spacecraft purchase & launch";
    default: return kind;
  }
};

export function setupFinanceView(finance: CompanyFinance, getElapsedSeconds: () => number): () => void {
  const cash = document.querySelector<HTMLElement>("#finance-cash")!;
  const revenue = document.querySelector<HTMLElement>("#finance-revenue")!;
  const costs = document.querySelector<HTMLElement>("#finance-costs")!;
  const capitalSpending = document.querySelector<HTMLElement>("#finance-capital-spending")!;
  const cashMovement = document.querySelector<HTMLElement>("#finance-cash-movement")!;
  const net = document.querySelector<HTMLElement>("#finance-net")!;
  const warning = document.querySelector<HTMLElement>("#finance-warning")!;
  const summaryCash = document.querySelector<HTMLElement>("#summary-company-cash")!;
  const summaryAverageDailyRevenue = document.querySelector<HTMLElement>("#summary-average-daily-revenue")!;
  const summaryWarning = document.querySelector<HTMLElement>("#summary-company-warning")!;
  const spacecraftRate = document.querySelector<HTMLElement>("#finance-spacecraft-rate")!;
  const stationRate = document.querySelector<HTMLElement>("#finance-station-rate")!;
  const ledgerBody = document.querySelector<HTMLTableSectionElement>("#finance-ledger-body")!;
  let renderedRevision = -1;
  let renderedDay = -1;

  return () => {
    const elapsedSeconds = getElapsedSeconds();
    const currentDay = Math.floor(elapsedSeconds / 86_400);
    if (finance.revision === renderedRevision && currentDay === renderedDay) return;
    const snapshot = finance.getSnapshot();
    cash.textContent = money(snapshot.cashCents);
    revenue.textContent = money(snapshot.realizedRevenueCents);
    costs.textContent = money(snapshot.operatingCostsCents);
    capitalSpending.textContent = money(snapshot.capitalSpendingCents);
    cashMovement.textContent = `${snapshot.netCashMovementCents > 0 ? "+" : ""}${money(snapshot.netCashMovementCents)}`;
    net.textContent = money(snapshot.netOperatingResultCents);
    warning.hidden = !snapshot.isNegative;
    summaryCash.textContent = money(snapshot.cashCents);
    summaryAverageDailyRevenue.textContent = money(finance.getAverageDailyRevenueCents(elapsedSeconds));
    summaryWarning.hidden = !snapshot.isNegative;
    spacecraftRate.textContent = money(Math.round(finance.spacecraftCostUsdPerDay * 100));
    stationRate.textContent = money(Math.round(finance.groundStationCostUsdPerDay * 100));
    warning.textContent = snapshot.isNegative
      ? "Cash is below zero. Routine operations continue; review costs and income."
      : "";

    const rows = [...snapshot.entries].reverse().map(entry => {
      const row = document.createElement("tr");
      const time = document.createElement("td"); time.textContent = simulationTime(entry.timeSeconds);
      const category = document.createElement("td"); category.textContent = entryLabel(entry.kind);
      const source = document.createElement("td");
      source.textContent = entry.kind === "spacecraft-procurement"
        ? `${entry.sourceId} · spacecraft ${money(entry.spacecraftCostCents ?? 0)} + ${entry.equipmentOptionId ?? "standard"} upgrade ${money(entry.upgradeCostCents ?? 0)} + launch ${money(entry.launchCostCents ?? 0)}`
        : entry.sourceId;
      const amount = document.createElement("td"); amount.className = "finance-amount";
      amount.textContent = `${entry.amountCents > 0 ? "+" : ""}${money(entry.amountCents)}`;
      row.append(time, category, source, amount);
      return row;
    });
    ledgerBody.replaceChildren(...rows);
    renderedRevision = snapshot.revision;
    renderedDay = currentDay;
  };
}
