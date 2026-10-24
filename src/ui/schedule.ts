import type { GroundOperations } from "../simulation/groundOperations.ts";
import type { SatelliteDefinition } from "../simulation/model.ts";
import type { CellMarketState } from "../simulation/cellMarketState.ts";
import { cellLabel } from "../simulation/cells.ts";

const currency = (value: number): string => value.toLocaleString(undefined, {
  style: "currency",
  currency: "USD",
});

const points = (value: number): string => value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type ScheduleRowView = {
  cellIndex: number;
  overallPriority: HTMLElement;
  overallValue: HTMLElement;
  categoryPriorities: Map<string, HTMLElement>;
};

export type ScheduleViewOptions = {
  root: HTMLElement;
  getFleet: () => readonly SatelliteDefinition[];
  groundOperations: GroundOperations;
  getMarket: () => CellMarketState | null;
  getElapsedSeconds: () => number;
  focusCell: (cellIndex: number) => void;
};

/** Renders the read-only onboard TELs, with live cell values at simulation time. */
export function setupScheduleView(options: ScheduleViewOptions): () => void {
  let lastStructureSignature = "";
  let lastValueSignature = "";
  let lastMarket: CellMarketState | null | undefined;
  let hasRendered = false;
  const rowsBySpacecraft = new Map<string, ScheduleRowView[]>();
  const statusBySpacecraft = new Map<string, HTMLElement>();

  const updateValues = (fleet: readonly SatelliteDefinition[], market: CellMarketState, nowSeconds: number): void => {
    for (const satellite of fleet) {
      const state = options.groundOperations.getSatelliteState(satellite.id);
      const remainingCount = Math.max(0, state.onboardCommands.length - state.nextCommandIndex);
      const status = statusBySpacecraft.get(satellite.id);
      if (status) {
        status.textContent = state.onboardTelVersion === null
          ? "NO TEL ONBOARD"
          : `ONBOARD TEL V${state.onboardTelVersion} · ${remainingCount} COMMAND${remainingCount === 1 ? "" : "S"} REMAINING`;
      }

      const rows = rowsBySpacecraft.get(satellite.id) ?? [];
      for (const row of rows) {
        const economy = market.calculateCell(row.cellIndex, nowSeconds);
        row.overallPriority.textContent = points(economy.availablePriorityPoints);
        row.overallValue.textContent = currency(economy.availablePayoutUsd);
        for (const category of economy.categories) {
          const categoryCell = row.categoryPriorities.get(category.categoryId);
          if (categoryCell) categoryCell.textContent = points(category.availablePriorityPoints);
        }
      }
    }
  };

  const rebuild = (fleet: readonly SatelliteDefinition[], market: CellMarketState | null): void => {
    const previouslyOpen = new Set(
      [...options.root.querySelectorAll<HTMLDetailsElement>("details[data-spacecraft-id]")]
        .filter(details => details.open)
        .map(details => details.dataset.spacecraftId!),
    );
    const hadSpacecraftPanels = options.root.querySelector("details[data-spacecraft-id]") !== null;
    const scrollPositions = new Map<string, { left: number; top: number }>(
      [...options.root.querySelectorAll<HTMLElement>(".schedule-table-scroll")]
        .map(element => [element.closest<HTMLDetailsElement>("details[data-spacecraft-id]")?.dataset.spacecraftId ?? "", {
          left: element.scrollLeft,
          top: element.scrollTop,
        }] as const),
    );
    const scrollParent = options.root.parentElement;
    const parentScrollTop = scrollParent?.scrollTop ?? 0;
    const content: HTMLElement[] = [];
    rowsBySpacecraft.clear();
    statusBySpacecraft.clear();

    if (!market) {
      const loading = document.createElement("p");
      loading.className = "schedule-empty";
      loading.textContent = "Loading geographic cell data…";
      content.push(loading);
    } else {
      const categoryDefinitions = market.exposures.definitions;
      fleet.forEach((satellite, satelliteIndex) => {
        const state = options.groundOperations.getSatelliteState(satellite.id);
        const cellCommands = state.onboardCommands.filter(command => command.cellCapture !== undefined);
        const details = document.createElement("details");
        details.className = "schedule-spacecraft";
        details.dataset.spacecraftId = satellite.id;
        details.open = previouslyOpen.has(satellite.id) || (!hadSpacecraftPanels && satelliteIndex === 0);

        const summary = document.createElement("summary");
        summary.className = "schedule-spacecraft-summary";
        const name = document.createElement("strong");
        name.textContent = satellite.name;
        const status = document.createElement("span");
        status.className = "schedule-spacecraft-status";
        statusBySpacecraft.set(satellite.id, status);
        const captureCount = document.createElement("span");
        captureCount.className = "schedule-capture-count";
        captureCount.textContent = `${cellCommands.length} CELL${cellCommands.length === 1 ? "" : "S"}`;
        summary.append(name, status, captureCount);
        details.append(summary);

        if (state.onboardTelVersion === null) {
          const empty = document.createElement("p");
          empty.className = "schedule-empty";
          empty.textContent = "This spacecraft has no uploaded TEL. Ground plans appear here after they are uploaded during an available contact.";
          details.append(empty);
          content.push(details);
          return;
        }

        if (cellCommands.length === 0) {
          const empty = document.createElement("p");
          empty.className = "schedule-empty";
          empty.textContent = "The onboard TEL has no scheduled cell captures.";
          details.append(empty);
          content.push(details);
          return;
        }

        const tableScroll = document.createElement("div");
        tableScroll.className = "table-scroll schedule-table-scroll";
        tableScroll.setAttribute("role", "region");
        tableScroll.setAttribute("aria-label", `${satellite.name} scheduled cells`);
        tableScroll.tabIndex = 0;
        const table = document.createElement("table");
        table.className = "operations-table schedule-table";
        const caption = document.createElement("caption");
        caption.className = "visually-hidden";
        caption.textContent = `${satellite.name} current onboard TEL scheduled cell priorities and values`;
        table.append(caption);

        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        for (const label of ["Scheduled cell", "Overall priority", "Overall available value ($)"]) {
          const header = document.createElement("th");
          header.scope = "col";
          header.textContent = label;
          headerRow.append(header);
        }
        for (const category of categoryDefinitions) {
          const header = document.createElement("th");
          header.scope = "col";
          header.textContent = category.label;
          headerRow.append(header);
        }
        head.append(headerRow);
        table.append(head);

        const body = document.createElement("tbody");
        const rowViews: ScheduleRowView[] = [];
        for (const command of cellCommands) {
          const capture = command.cellCapture!;
          const row = document.createElement("tr");
          const cellHeader = document.createElement("th");
          cellHeader.scope = "row";
          const cellButton = document.createElement("button");
          cellButton.type = "button";
          cellButton.className = "schedule-cell-link";
          cellButton.textContent = cellLabel(capture.cellIndex);
          cellButton.setAttribute("aria-label", `Center ${cellLabel(capture.cellIndex)} on the map`);
          cellButton.addEventListener("click", () => options.focusCell(capture.cellIndex));
          const commandLabel = document.createElement("small");
          commandLabel.className = "schedule-command-label";
          commandLabel.textContent = command.label;
          cellHeader.append(cellButton, commandLabel);
          row.append(cellHeader);

          const overallPriority = document.createElement("td");
          overallPriority.className = "schedule-number-cell";
          row.append(overallPriority);
          const overallValue = document.createElement("td");
          overallValue.className = "schedule-number-cell";
          row.append(overallValue);
          const categoryPriorities = new Map<string, HTMLElement>();
          for (const category of categoryDefinitions) {
            const value = document.createElement("td");
            value.className = "schedule-number-cell";
            categoryPriorities.set(category.id, value);
            row.append(value);
          }
          rowViews.push({
            cellIndex: capture.cellIndex,
            overallPriority,
            overallValue,
            categoryPriorities,
          });
          body.append(row);
        }
        rowsBySpacecraft.set(satellite.id, rowViews);
        table.append(body);
        tableScroll.append(table);
        details.append(tableScroll);
        content.push(details);
      });
    }

    options.root.replaceChildren(...content);
    for (const element of options.root.querySelectorAll<HTMLElement>(".schedule-table-scroll")) {
      const satelliteId = element.closest<HTMLDetailsElement>("details[data-spacecraft-id]")?.dataset.spacecraftId ?? "";
      const position = scrollPositions.get(satelliteId);
      if (position) {
        element.scrollLeft = position.left;
        element.scrollTop = position.top;
      }
    }
    if (scrollParent) scrollParent.scrollTop = parentScrollTop;
  };

  return () => {
    if (options.root.hidden) return;

    const fleet = options.getFleet();
    const market = options.getMarket();
    const nowSeconds = options.getElapsedSeconds();
    const structureSignature = JSON.stringify({
      fleet: fleet.map(satellite => {
        const state = options.groundOperations.getSatelliteState(satellite.id);
        return [
          satellite.id,
          satellite.name,
          state.onboardTelVersion,
          state.onboardCommands.map(command => [command.id, command.label, command.cellCapture?.cellIndex ?? null]),
        ];
      }),
      categories: market?.exposures.definitions.map(category => [category.id, category.label]) ?? null,
    });
    const valueSignature = JSON.stringify({
      timeBucket: Math.floor(nowSeconds / 300),
      progress: fleet.map(satellite => options.groundOperations.getSatelliteState(satellite.id).nextCommandIndex),
      market: market ? [market.getMarketReadout(), market.getPlayerPriorityRates()] : null,
    });

    if (!hasRendered || market !== lastMarket || structureSignature !== lastStructureSignature) {
      rebuild(fleet, market);
      if (market) updateValues(fleet, market, nowSeconds);
    } else if (valueSignature !== lastValueSignature && market) {
      updateValues(fleet, market, nowSeconds);
    } else {
      return;
    }

    lastMarket = market;
    lastStructureSignature = structureSignature;
    lastValueSignature = valueSignature;
    hasRendered = true;
  };
}
