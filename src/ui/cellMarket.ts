import type { Viewer } from "cesium";
import { loadCellGrid } from "../data/cells";
import { CELL_LAYERS, UNSOURCED_ATTRIBUTES, cellBounds, cellLabel } from "../simulation/cells";
import type { CellGrid, CellLayer } from "../simulation/cells";
import { createCellLayer } from "../rendering/cellLayer";

const count = (value: number) => value.toLocaleString();
const coordinate = (latitude: number, longitude: number) => `${Math.abs(latitude).toFixed(3)}°${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(3)}°${longitude >= 0 ? "E" : "W"}`;
const PAGE_SIZE = 10;

export async function setupCellMarket(viewer: Viewer): Promise<void> {
  const panel = document.querySelector<HTMLElement>("#panel-orders")!;
  const toggle = document.querySelector<HTMLButtonElement>("#cell-grid-toggle")!;
  panel.innerHTML = '<p class="cell-loading" role="status">Loading geographic cell data…</p>';
  try {
    await mount(viewer, await loadCellGrid(), panel, toggle);
  } catch (error) {
    console.error("Cell market initialization failed", error);
    panel.replaceChildren();
    const message = document.createElement("p");
    message.className = "cell-loading";
    message.setAttribute("role", "alert");
    message.textContent = "The cell data could not be loaded. The rest of the simulation is still available.";
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "cell-button"; retry.textContent = "Retry cell data";
    retry.addEventListener("click", () => void setupCellMarket(viewer));
    panel.append(message, retry);
  }
}

async function mount(viewer: Viewer, grid: CellGrid, panel: HTMLElement, toggle: HTMLButtonElement) {
  panel.innerHTML = `
    <div class="cell-market-heading"><div><p class="eyebrow">GEOGRAPHIC MARKET</p><h2>Coverage & attributes</h2></div><span class="cell-tag">¼° × ¼° CELLS</span></div>
    <div class="cell-summary">
      <div><span>ELIGIBLE CELLS</span><strong id="cell-count"></strong></div>
      <div><span>COASTAL CELLS INCLUDED</span><strong id="cell-coast-count"></strong></div>
      <div><span>SOURCED DATASETS</span><strong id="cell-source-count"></strong></div>
      <div><span>DOLLAR VALUES</span><strong class="cell-unset">Not set</strong></div>
    </div>
    <div class="cell-controls">
      <label>Map layer<select id="cell-layer"></select></label>
      <label class="cell-search-label">Find a cell<input id="cell-search" type="search" placeholder="City, port, cell ID, or latitude, longitude" autocomplete="off" /></label>
      <label>Show<select id="cell-filter"><option value="coverage">All eligible cells</option><option value="cityCount">With cities & towns</option><option value="portCount">With ports</option><option value="urban">With urban footprint</option><option value="border">Land borders</option><option value="coastal">Coastal cells</option><option value="cropland">With cropland</option><option value="pasture">With pasture</option><option value="powerPlants">With power plants</option><option value="oilPipelines">With oil pipelines</option><option value="militarySites">With military installations</option><option value="dataCenters">With data centers</option><option value="researchSites">With NOAA research sites</option><option value="monuments">With World Heritage sites</option></select></label>
      <label>Sort by<select id="cell-sort"><option value="cityPopulation">City population ↓</option><option value="urban">Urban footprint ↓</option><option value="cityCount">City count ↓</option><option value="portCount">Port count ↓</option><option value="cropland">Cropland area ↓</option><option value="pasture">Pasture area ↓</option><option value="powerPlants">Power plant count ↓</option><option value="powerCapacity">Power capacity ↓</option><option value="oilPipelines">Oil pipeline count ↓</option><option value="militarySites">Military installations ↓</option><option value="dataCenters">Data centers ↓</option><option value="researchSites">NOAA research sites ↓</option><option value="monuments">World Heritage sites ↓</option><option value="coverage">Cell ID ↑</option></select></label>
    </div>
    <p class="cell-layer-note" id="cell-layer-note"></p>
    <div class="cell-workspace">
      <section class="cell-results" aria-label="Eligible market cells">
        <div class="table-scroll"><table class="operations-table cell-table"><thead><tr><th scope="col">Cell / mapped place</th><th scope="col">Center</th><th scope="col">Cities</th><th scope="col">Ports</th><th scope="col">Urban km²</th><th scope="col">Cropland km²</th><th scope="col">Power MW</th><th scope="col">Oil routes</th><th scope="col">Mapped attributes</th><th scope="col">Special sites (M · DC · R · WH)</th></tr></thead><tbody id="cell-table-body"></tbody></table></div>
        <div class="cell-pagination"><span id="cell-results-count" role="status"></span><div><button id="cell-prev" type="button" class="cell-button">Previous</button><span id="cell-page"></span><button id="cell-next" type="button" class="cell-button">Next</button></div></div>
      </section>
      <aside class="cell-detail" aria-label="Selected cell"><p class="eyebrow">SELECTED CELL</p><div id="cell-detail-content"><h3>Select a cell</h3><p>Click an eligible cell on the globe or choose a row to inspect its attributes. Zoom in to see the ¼° boundaries.</p></div></aside>
    </div>
    <details class="cell-data-notes"><summary>Data coverage & sources</summary><p>These mapped features are a geographic baseline. Zero means no feature recorded in these datasets; it does not prove none exists. Dollar values and collection rules will be added after the value model is defined.</p><div id="cell-sources"></div><ul id="cell-limitations"></ul></details>
  `;
  const element = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  element("cell-count").textContent = count(grid.ids.length);
  element("cell-coast-count").textContent = count(grid.metadata.statistics.coastalCells);
  element("cell-source-count").textContent = count(grid.metadata.sources.length);
  const selectLayer = element<HTMLSelectElement>("cell-layer");
  for (const [key, layer] of Object.entries(CELL_LAYERS)) selectLayer.add(new Option(layer.label, key));
  const mapKey = document.createElement("aside");
  mapKey.className = "cell-map-key";
  mapKey.setAttribute("aria-label", "Cell map legend");
  mapKey.innerHTML = '<div><span class="eyebrow">¼° CELL GRID</span><button type="button" class="cell-overview">World view ↗</button></div><strong class="cell-map-layer-name"></strong><span class="cell-map-ramp"></span><small class="cell-map-scale"></small><p>Zoom for boundaries · Click to inspect</p>';
  document.querySelector(".globe-stage")!.append(mapKey);
  let selected = -1;
  let visible = true;
  let page = 0;
  let filtered = new Uint32Array();
  const ranks = new Map<string, Uint32Array>();
  const map = await createCellLayer(viewer, grid, (index, route) => {
    selectCell(index, false, route);
    document.querySelector<HTMLButtonElement>("#tab-orders")!.click();
  });
  mapKey.querySelector("button")!.addEventListener("click", () => map.overview());
  toggle.disabled = false;
  toggle.setAttribute("aria-pressed", "true");
  toggle.addEventListener("click", () => setVisible(!visible));

  function setVisible(show: boolean) {
    visible = show; map.setVisible(show); mapKey.hidden = !show;
    toggle.setAttribute("aria-pressed", String(show));
  }

  function setLayer() {
    const layer = selectLayer.value as CellLayer;
    map.setMetric(layer);
    mapKey.dataset.layer = layer;
    mapKey.querySelector(".cell-map-layer-name")!.textContent = CELL_LAYERS[layer].label;
    const binary = ["urban", "border", "coastal"].includes(layer);
    mapKey.querySelector(".cell-map-scale")!.textContent = layer === "coverage" ? "Mapped land & coastal cells" : binary ? "No mapped feature → Mapped feature" : `0 → ${count(grid.maximum(layer))} / cell · log scale`;
    element("cell-layer-note").textContent = CELL_LAYERS[layer].description + (layer === "coverage" ? "" : " Distant map pixels show the strongest cell within them.");
  }
  selectLayer.addEventListener("change", () => { setLayer(); setVisible(true); });
  setLayer();

  function applyFilters() {
    const sort = element<HTMLSelectElement>("cell-sort").value as CellLayer;
    const filter = element<HTMLSelectElement>("cell-filter").value as CellLayer;
    const query = element<HTMLInputElement>("cell-search").value.trim().toLocaleLowerCase();
    let ranked = ranks.get(sort);
    if (!ranked) {
      ranked = Uint32Array.from({ length: grid.ids.length }, (_, i) => i);
      if (sort !== "coverage") ranked.sort((a, b) => grid.value(b, sort) - grid.value(a, sort) || grid.ids[a] - grid.ids[b]);
      ranks.set(sort, ranked);
    }
    const coordinates = query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const coordinateIndex = coordinates ? grid.indexAt(Number(coordinates[1]), Number(coordinates[2])) : null;
    filtered = ranked.filter(i => grid.value(i, filter) > 0 && (!query ||
      (coordinateIndex !== null ? i === coordinateIndex :
        cellLabel(grid.ids[i]).toLowerCase().includes(query) || Boolean(grid.searchNames.get(grid.ids[i])?.includes(query)))));
    page = 0;
    renderRows();
  }

  function renderRows() {
    const body = element<HTMLTableSectionElement>("cell-table-body");
    const rows = [];
    for (const index of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const id = grid.ids[index], bounds = cellBounds(id);
      const row = document.createElement("tr");
      row.classList.toggle("cell-row-selected", selected === index);
      const name = document.createElement("th"); name.scope = "row";
      const button = document.createElement("button"); button.type = "button"; button.className = "cell-select";
      button.textContent = cellLabel(id); button.setAttribute("aria-pressed", String(selected === index));
      button.addEventListener("click", () => selectCell(index, true));
      const place = document.createElement("small");
      const mapped = grid.places[id];
      place.textContent = mapped ? [...new Set(mapped.map(p => p.name))].join(" · ") : "No named place in source";
      name.append(button, place);
      const position = document.createElement("td"); position.textContent = coordinate(bounds.latitudeDeg, bounds.longitudeDeg);
      const cities = document.createElement("td"); cities.textContent = count(grid.cityCounts[index]);
      const ports = document.createElement("td"); ports.textContent = count(grid.portCounts[index]);
      const urban = document.createElement("td"); urban.textContent = (grid.urbanAreaDeciKm2[index] / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
      const crops = document.createElement("td"); crops.textContent = (grid.croplandHa[index] / 100).toLocaleString(undefined, { maximumFractionDigits: 1 });
      const power = document.createElement("td"); power.textContent = count(grid.powerCapacityMw[index]);
      const pipelines = document.createElement("td"); pipelines.textContent = count(grid.oilPipelineCounts[index]);
      const types = document.createElement("td"); types.className = "cell-tags";
      for (const [flag, label] of [[1, "Coast"], [2, "Urban"], [4, "Border"]] as const) if (grid.flags[index] & flag) {
        const tag = document.createElement("span"); tag.textContent = label; types.append(tag);
      }
      if (!types.children.length) types.textContent = "—";
      const sites = document.createElement("td");
      sites.textContent = `M ${count(grid.militarySiteCounts[index])} · DC ${count(grid.dataCenterCounts[index])} · R ${count(grid.researchSiteCounts[index])} · WH ${count(grid.monumentCounts[index])}`;
      sites.title = "Military · data center · NOAA research · World Heritage record counts";
      row.append(name, position, cities, ports, urban, crops, power, pipelines, types, sites); rows.push(row);
    }
    if (!rows.length) {
      const row = document.createElement("tr"), message = document.createElement("td"); message.colSpan = 10;
      message.textContent = "No eligible cells match. Try a mapped city, port, cell ID, or latitude, longitude.";
      row.append(message); rows.push(row);
    }
    body.replaceChildren(...rows);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    element("cell-results-count").textContent = `${count(filtered.length)} ${filtered.length === 1 ? "cell" : "cells"}`;
    element("cell-page").textContent = `${page + 1} / ${count(pages)}`;
    element<HTMLButtonElement>("cell-prev").disabled = page === 0;
    element<HTMLButtonElement>("cell-next").disabled = page + 1 === pages;
  }

  function selectCell(index: number, fly: boolean, route?: { name: string; url?: string; latitudeDeg: number; longitudeDeg: number }) {
    selected = index;
    if (fly) setVisible(true);
    map.select(index, fly);
    const content = element("cell-detail-content"); content.replaceChildren();
    const heading = document.createElement("h3");
    if (index === -1) {
      heading.textContent = "No eligible cell";
      const note = document.createElement("p"); note.textContent = "No land is mapped in this cell. Choose a highlighted cell to inspect it.";
      content.append(heading, note);
      if (route) { const selectedRoute = document.createElement("p"); selectedRoute.className = "cell-route-selection"; selectedRoute.textContent = `Selected mapped pipeline: ${route.name} · ${coordinate(route.latitudeDeg, route.longitudeDeg)}`; content.append(selectedRoute); }
      renderRows(); return;
    }
    const cell = grid.cell(index);
    heading.textContent = cell.label;
    const location = document.createElement("p"); location.className = "cell-detail-coordinate";
    location.textContent = coordinate(cell.bounds.latitudeDeg, cell.bounds.longitudeDeg);
    const zoom = document.createElement("button"); zoom.type = "button"; zoom.className = "cell-button"; zoom.textContent = "Focus on globe ↗";
    zoom.addEventListener("click", () => { setVisible(true); map.select(index, true); });
    const metrics = document.createElement("dl"); metrics.className = "cell-attributes";
    const entries: [string, string][] = [
      ["Cities & towns", count(cell.attributes.cityCount)], ["Mapped city population", count(cell.attributes.cityPopulation)],
      ["Ports & harbors", count(cell.attributes.portCount)], ["Urban footprint area", `${(cell.attributes.urbanAreaDeciKm2 / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })} km²`],
      ["Land border", cell.attributes.border ? "Mapped" : "None mapped"], ["Coastline", cell.attributes.coastal ? "Mapped" : "None mapped"],
      ["Cropland area", `${(cell.attributes.croplandAreaHa / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} km²`],
      ["Pasture area", `${(cell.attributes.pastureAreaHa / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} km²`],
      ["Power plants", count(cell.attributes.powerPlantCount)], ["Power capacity", `${count(cell.attributes.powerCapacityMW)} MW`],
      ["Mapped major oil pipeline routes", count(cell.attributes.oilPipelineCount)],
      ["Military installations", count(cell.attributes.militarySiteCount)], ["Data centers", count(cell.attributes.dataCenterCount)],
      ["NOAA research stations", count(cell.attributes.researchSiteCount)], ["UNESCO World Heritage sites", count(cell.attributes.monumentCount)],
      ["Maximum value", "Not set"], ["Available value", "Not set"], ["Last collection", "Not modeled"], ["Recovery duration", "Not set"],
    ];
    for (const [name, value] of entries) {
      const term = document.createElement("dt"), detail = document.createElement("dd");
      term.textContent = name; detail.textContent = value; metrics.append(term, detail);
    }
    content.append(heading, location, zoom, metrics);
    if (route) {
      const note = document.createElement("p");
      note.className = "cell-route-selection";
      if (route.url) {
        const link = document.createElement("a"); link.href = route.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = route.name; note.append("Selected mapped pipeline: ", link, ` · ${coordinate(route.latitudeDeg, route.longitudeDeg)}`);
      } else note.textContent = `Selected mapped pipeline: ${route.name} · ${coordinate(route.latitudeDeg, route.longitudeDeg)}`;
      content.append(note);
    }
    if (cell.places.length) {
      const list = document.createElement("ul"); list.className = "cell-place-list";
      for (const place of cell.places) {
        const item = document.createElement("li"); item.textContent = `${place.name} · ${place.kind === "city" ? "City / town" : "Port"}${place.region ? ` · ${place.region}` : ""}`; list.append(item);
      }
      content.append(list);
    }
    const unknown = document.createElement("details"); unknown.className = "cell-unsourced";
    const summary = document.createElement("summary"); summary.textContent = "Attributes awaiting a data source";
    const list = document.createElement("ul");
    for (const label of UNSOURCED_ATTRIBUTES) { const li = document.createElement("li"); li.textContent = `${label} — Not sourced`; list.append(li); }
    unknown.append(summary, list); content.append(unknown);
    renderRows();
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  element("cell-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 160); });
  element("cell-search").addEventListener("keydown", event => {
    if (event.key === "Enter") { clearTimeout(searchTimer); applyFilters(); if (filtered.length) selectCell(filtered[0], true); }
  });
  element("cell-filter").addEventListener("change", applyFilters);
  element("cell-sort").addEventListener("change", applyFilters);
  element("cell-prev").addEventListener("click", () => { if (page > 0) { page--; renderRows(); } });
  element("cell-next").addEventListener("click", () => { if ((page + 1) * PAGE_SIZE < filtered.length) { page++; renderRows(); } });
  for (const source of grid.metadata.sources) {
    const line = document.createElement("p"), link = document.createElement("a");
    link.href = source.url; link.textContent = `${source.name} · ${source.version}`;
    link.target = "_blank"; link.rel = "noopener noreferrer";
    line.append(link, ` · ${source.license}${source.attribution ? ` · ${source.attribution}` : ""} · ${source.scale}`); element("cell-sources").append(line);
  }
  for (const limitation of grid.metadata.limitations) {
    const li = document.createElement("li"); li.textContent = limitation; element("cell-limitations").append(li);
  }
  const excluded = document.createElement("li");
  excluded.textContent = `${grid.metadata.statistics.excludedPointFeatures.cities} city, ${grid.metadata.statistics.excludedPointFeatures.ports} port, ${grid.metadata.statistics.excludedPoints.researchSites} NOAA research-site, and ${grid.metadata.statistics.excludedPoints.monuments} World Heritage point records fall outside eligible land cells and are excluded.`;
  element("cell-limitations").append(excluded);
  applyFilters();
}
