# Technical strategy

This document records implementation constraints and architecture direction. The first world-model prototype now provisionally uses TypeScript, Vite, and CesiumJS; these are prototype choices, not final product commitments.

## Current constraints

- **Target:** A browser-based, single-player game.
- **Hosting target:** GitHub Pages, which serves static site output and does not run the game’s server-side application logic.
- **Initial emphasis:** Simulation mechanics and status views. The orbital display can be a simple visual layer.
- **Initial persistence assumption:** Local browser save data is sufficient for a prototype; no account or shared cloud save is currently required.
- **Provisional prototype stack:** TypeScript for application code, Vite for the static client build, and CesiumJS for the 3D globe.
- **Provisional Earth display:** Cesium's bundled Natural Earth II imagery is used without a Cesium ion token; the renderer falls back to a plain globe color if the texture fails to load.

## Architecture direction

- Keep simulation state and rules separate from UI rendering. The simulation should be advanceable and inspectable without depending on a screen component.
- Advance the simulation in explicit time steps. Make pause and speed controls a presentation of those steps, not separate simulation rules.
- Represent satellites, data, customer work, finances, and anomalies as explicit domain state rather than values embedded in UI components.
- Keep the first orbital display a view of simulation state. It may use simplified orbit positions; it does not need to implement high-precision astrodynamics.
- Build the app as a static client-side bundle suitable for GitHub Pages. Avoid adding a backend unless a future requirement needs hosted persistence, user accounts, or shared state.
- If local saves are added, version the save format so later builds can detect or migrate older data.

## Management interface

### Agreed direction

- Preserve the macro layout with the globe/visualization at the top and the active data view below it.
- The data view uses tabs for **Summary**, **Spacecraft**, **Orders**, **Ground Stations**, and **Finance & Growth**. Summary is the default and replaces the current single readout as the overview.
- Summary combines fleet-wide state, company information, operational exceptions, and key indicators that need attention.
- Prefer tables for lists and comparisons, especially spacecraft, orders, and ground stations. Selecting a row should connect that record to its object or location on the globe.
- The Orders view includes a searchable, filterable, sortable cell-market list and cell details. Its map controls can show category exposure, calculated cell value, or repeat-purchase state once defined.
- The Spacecraft view presents one row per configured satellite, current modeled position and state, and a detail view for the selected spacecraft. Selection highlights that spacecraft's globe marker and orbit.

### Open interface decisions

- Exact columns, summary metrics, sorting defaults, and detail-panel contents for each tab. The Spacecraft prototype uses orbit altitude, subsatellite point, sunlight/eclipse, and approximate station access; its detail view also shows inclination. The Ground Stations prototype uses facility status, site location/coordinates, and uplink/downlink rates, without satellite-specific contact data.
- How selected table rows focus or highlight objects in the globe, and how that interaction works on narrow screens.
- Whether tables should support bulk actions as fleet and order volumes grow.

### Fleet prototype data

- Keep spacecraft as a collection keyed by stable satellite IDs. The current initial fleet contains only Asteria-1, preserving the intended one-spacecraft start; no additional satellite or launch cost is invented for the prototype.
- Calculate a separate world snapshot per spacecraft from the shared simulation clock and surface-object set. Drive each table row, selected detail view, marker, and orbit from that spacecraft's definition and snapshot.
- The selected spacecraft is highlighted with a larger marker, visible label, and brighter orbit path. Health, onboard storage, battery state, camera capability, and cell-market revenue remain absent until their gameplay systems are implemented.

### Ground-station prototype data

- Keep facility operational status separate from a satellite's contact window. A station may be marked available or down independently of any spacecraft.
- Store uplink and downlink bit rates in Mbps on each station definition. Both sample stations currently use configurable placeholder defaults of 10 Mbps uplink and 100 Mbps downlink; these are not real-site specifications and do not yet affect simulated transfer capacity or timing.
- The sample station statuses are static configuration. Outages, maintenance, and status changes over time have not been modeled.
- Location, facility availability, uplink rate, and downlink rate are the initial site fields shown in the table. Antenna count, simultaneous-link capacity, supported bands, and maintenance state remain future design options.

## Earth coordinates and orbit display

### Agreed direction

- Designers and game content should describe surface locations in familiar latitude/longitude terms, with altitude/height where needed. Coordinate conversion should be an implementation detail.
- The displayed globe stays fixed while satellite markers and their paths move relative to the surface as game time advances.
- Keep satellite altitude to scale in the visualization. Make the satellite marker visible with a glowing dot; an orbit path can be shown optionally. Marker size is a visual choice and does not change simulated position or altitude.
- Assume one common altitude for the initial satellites, while keeping the model open to different altitudes later.
- Approximate ground-station contact with a constant distance threshold for the initial common-altitude fleet. Treat this as a gameplay approximation of visibility; it can later become altitude-dependent or use a more exact line-of-sight/elevation rule.

### Proposed implementation shape

- Keep geography in named latitude, longitude, and height fields at authoring boundaries. Use geographic points for locations such as cities and ground stations; use geographic boundaries/polygons for areas such as countries when area targets are needed.
- Keep the simulation independent of the renderer's coordinate conventions. A small geography/visualization adapter converts named geographic inputs and satellite positions to the renderer's Earth-centered coordinates.
- Model satellite motion from a simple orbit description and game time in an Earth-centered inertial-like frame, then transform the current position into the Earth-fixed frame used to draw it on a stationary globe. A simplified Earth-rotation angle is sufficient initially; high-precision astrodynamics is not a goal for the first build.
- Keep orbit configuration and propagation per spacecraft. The initial fleet may use a shared provisional orbit profile, but simulation and visualization APIs must accept each spacecraft's own orbit parameters and calculate its state independently. Put propagation behind a model boundary so additional orbit classes or fidelity levels can be added without changing fleet/UI logic; the supported future orbit types and their accuracy remain open.
- Keep the concepts of a 3D orbital path and a surface ground track distinct. The initial optional line is the 3D orbit path; a projected ground track can be added separately if it helps explain coverage.
- Use the same game-time/world model as the basis for later sunlight and eclipse calculations.
- If using CesiumJS, wrap its coordinate helpers so game code uses named fields and explicit units rather than positional arguments or library-specific types.

## Cell market and imaging opportunities

### Agreed direction

- Use a regular **¼° latitude/longitude grid** as the market and collection unit. A cell is the smallest collection unit, and the simulation treats collection as imaging the entire cell. Swath width is abstracted away; collection time, resource use, and access limits remain to be defined at the cell level.
- Include every grid cell that intersects land, including mixed land-and-sea coastal cells; exclude cells with no land. Do not calculate land-area fraction as an eligibility or value requirement. This avoids creating market cells across remote open ocean while retaining coastal areas where ports, harbors, ships, and other activity can be valuable.
- Each eligible cell has category-specific exposures, such as eligible area or feature count. For each category, maximum payout is its applicable unit price multiplied by the cell's exposure; available payout is maximum payout multiplied by the current VAM. Sum available category payouts and credit that amount to company money when a successful whole-cell capture completes. The initial market has no archive sale; storage/downlink simulation is a separate operating constraint or cost.
- The candidate category/exposure mapping is implemented in `src/simulation/categoryExposures.ts` and described in [Cell grid data](CELL_DATA.md). It converts urban, cropland, and pasture area into km²; other candidates retain mapped record/polygon counts or MW. This mapping is **Proposed** pending review, and its data measures are not approved market categories or verified real-world prices.
- Geographic attributes such as sensitive ecological areas, borders, and additional energy infrastructure may be considered later; they are not in the current candidate market mapping.
- The Orders tab presents the cell market and offers globe layers for category exposure, calculated gross value, and repeat-purchase/freshness state once that state is defined. Individual customer orders, point targets, and project contracts are not required for this initial economic loop; they may be added later as a separate layer.
- Each satellite has a slew-speed capability. A paid upgrade applies to satellites launched afterward; slew-speed units, upgrade cost, and capability increase remain to be specified.

### Proposed implementation shape

- Keep the grid, geographic attribute layers, per-cell category exposures, market state, repeat-purchase state, and collection updates in simulation/domain data, separate from Cesium and UI components.
- The complete ¼° grid contains 1,036,800 cells before the land mask. Compact typed arrays or equivalent packed data are expected to keep static attributes and dynamic value state inexpensive. Do not create one globe entity per cell; render a tiled/grid layer and aggregate at display resolution when useful.
- Preprocess sourced geographic datasets into the cell grid or load suitable static datasets; do not query external data services during simulation steps. Record source, version/date, resolution, attribution, and license for each distributed data layer.
- Use one last-collection simulation timestamp per cell. Every category in that cell derives VAM from the shared elapsed time and its own cadence. A never-collected cell starts fully available (VAM 1). A successful whole-cell capture computes/records payout, credits company money once, and resets the timestamp as one domain operation; a failed capture does neither.
- Store geographic attributes and derived category exposures separately from time-varying market rates and dynamic repeat-purchase state. Keep collection events traceable for revenue accounting.
- Keep the category exposure mapping data-driven and independently inspectable without Cesium. Orders now shows the proposed exposure quantities, sample market rates, derived payout, and priority separately.
- `src/simulation/cellMarketState.ts` accepts explicit market readout values, player priority rates, and starting cash; it supplies no balance defaults. It stores one `Float64Array` timestamp per eligible cell (`NaN` means never collected), calculates snapshots on demand so elapsed time and changed inputs apply immediately, and commits successful capture events/cash/recovery once per unique event ID. A future app integration must supply scenario inputs and call capture completion only after the capture lifecycle succeeds.
- **Agreed market and priority model:** Keep time-varying, read-only category prices and average customer refresh durations in market state and show them in a player-visible readout. The player sets a priority rate in points per matching unit for each category; these rates are the scheduling controls. Convert area exposures to square kilometres as needed (for example, stored hectares ÷ 100), and retain genuine feature counts for count-based categories. Do not invent area footprints for point or route records just to force a common unit. For each category use the same VAM to scale maximum payout and maximum priority. VAM is 0 through 10% of cadence, rises linearly to 1 at cadence, then stays at 1: `clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. A never-collected cell starts at VAM 1. Recalculate derived payout and priority immediately when elapsed time or market/priority inputs change. Store one last-collection timestamp per cell, shared by its categories. Whole-cell capture resets that timestamp for every category, including slower-refresh categories in mixed cells. An optional cell-level `atMaximum` cache means every contributing category has VAM 1 and must be invalidated when relevant market data changes. A successful capture completion credits company money once and resets the timestamp as one domain operation; failed capture does neither. See [Gameplay](GAMEPLAY.md#market-information-cell-revenue-and-scheduling).
- Cell aggregation uses a regular lat/lon index. Its geographic cell area varies with latitude; value layers must have an explicit interpretation (for example per-cell market value) and must not accidentally treat raw feature counts as comparable dollar prices.
- Represent collection as a whole-cell operation. Swath width, scan-strip sequencing, and partial-cell coverage are outside the current model. Whole-cell completion does not imply instantaneous or cost-free collection; timing and resource rules remain open.
- Draw the market as a toggleable cell layer. Cell resolution is agreed at ¼°; color normalization, zoom-level aggregation, and exact rendering representation remain open tuning choices.
- When a satellite collects a cell, a temporary line or compact footprint cue may connect the satellite to the collection area. Do not render image pixels in the initial implementation.

### Immediate integration milestone

CELL-03A in [Pending Changes](PENDING_CHANGES.md) is implemented. `src/simulation/prototypeCellMarket.ts` provides explicit sample scenario inputs; the app owns one market model and supplies its simulation time. Orders reads cell snapshots and submits player priority changes, while sample market rates remain read-only. Only the selected cell and visible table rows refresh when time or inputs change; the entire grid is not recalculated on render frames. Tab switches preserve the model instance.

The readout uses the proposed mapping and explicitly labeled sample rates. All cells initially have VAM 1. CELL-03B adds selected-cell preview controls that call the same successful settlement operation and advance the app-owned simulation clock; failed-attempt preview does not change model state, and reset restores only in-memory sample scenario state. Cash and recovery are visible in Orders. This does not implement automatic capture or settle gameplay access/duration rules. Final game starting budget, market trends, scheduler, heat maps, and finance remain separate work.

Future Orders work should add sorting/filtering against calculated dollar value, maximum priority, and current/available priority, and selectable globe cell-color modes for those same metrics. Calculate map values from the shared market snapshot and render through tiled/aggregated layers, not per-cell Cesium entities. Color ramps, normalization, legends, and range/threshold filter controls remain open UI choices; see [Pending Changes](PENDING_CHANGES.md#cell-03--show-the-cell-market-in-orders).

### Open implementation and gameplay decisions

- Which additional attribute layers to include and their source, version, resolution, license, and attribution requirements.
- Whether to approve/revise the proposed geographic-to-category mapping and how its overlapping area/count/presence measures combine into category-level maximum in-game values; no adjustment solely for land fraction is planned.
- How market category prices and refresh cadences change over time; changes immediately recalculate derived payout and priority using the existing per-cell timestamp.
- Approval of the proposed category-to-source mapping and exact count semantics for mixed record/polygon layers; starting market prices/player priority rates/cadences and how market information changes over time.
- How the scheduler ranks available priority points against payout, access, and satellite constraints to select the next cell.
- How cloud cover, Sun elevation, off-nadir access, slew time, satellite capability, and collection duration affect successful cell collection and/or payout.
- What post-sale storage, downlink, processing, or delivery constraints and costs to model; these do not defer the agreed immediate cell-sale revenue.
- Whether individual customer contracts, deadlines, or named monitoring sites are useful as an optional layer beyond the cell market.
- How polar and dateline cells are represented for collection geometry, and how the heat-map layer aggregates and normalizes at different zoom levels.
### Implemented geographic foundation (2026-10-05)

- The initial dataset contains 363,779 cells intersecting Natural Earth land polygons at ¼° resolution, including mixed coastal cells. Eligibility uses all touched cells and does not calculate land fraction.
- Fourteen geographic datasets are currently sourced: six Natural Earth layers for land, coastline, populated places/population, ports, urban areas, and boundaries; two circa-2015 agricultural rasters; WRI power plants; generalized Global Energy Monitor oil routes; NTAD military installation polygons; a Gigawatt Map data-center snapshot; NOAA GML research-monitoring stations; and UNESCO World Heritage points. Natural gas pipelines, grid lines/substations, sensitive ecological areas, and ships remain unsourced/null. See [Cell grid data](CELL_DATA.md) for provenance and caveats.
- Sample dollar rates and priority rates are configured for inspection in Orders. Final economy rates remain open.
- The Orders view supports search, attribute filters, sorting, pagination, numeric payout columns, a category breakdown, and player-editable priority rates. An on-demand geographic tile overlay shows eligibility and sourced attributes; cell selection links the globe and table. Value/freshness map layers and collection recovery controls remain future work.
- Provenance, source limitations, packed data format, indexing rules, and rebuild steps are maintained in [Cell grid data](CELL_DATA.md).

### Provisional prototype conventions

- Authoring data uses named decimal-degree fields `latitudeDeg` and `longitudeDeg`. Domain altitudes and Cartesian positions use kilometers; the Cesium adapter converts kilometers to meters and passes longitude before latitude to Cesium.
- Cesium uses the WGS84 ellipsoid for display conversion. The initial orbital/contact model uses a spherical Earth with a mean radius of 6,371 km; this mismatch is a deliberate simplification to revisit if it affects gameplay.
- The globe remains fixed. Satellite orbit coordinates are calculated in a simple Earth-centered inertial-like frame, then rotated into an Earth-fixed frame using a 24-hour prototype day.
- The first satellite uses a circular 550 km orbit at 53° inclination, with configurable starting node and phase. Orbital period is calculated from the selected altitude and Earth's gravitational parameter.
- The prototype Sun is fixed along the inertial +X direction. Surface illumination uses the dot product of the surface normal and the Earth-fixed Sun direction. Satellite eclipse uses a cylindrical Earth-shadow approximation.
- Initial station contact uses a fixed 1,800 km great-circle surface-distance threshold from the sub-satellite point. It does not model antenna angles, link budget, bandwidth, or true line of sight.
- The prototype simulation offers 1×, 60×, and 300× time speed, with 60× as the starting value. These speeds and all geometry constants are configurable scenario defaults, not balance decisions.

Keep the simulation/domain model independent of Cesium so another renderer can replace it if needed.

## Suggested code boundaries

Names and folder layout are proposals until the project scaffold is chosen.

- **Simulation/domain:** State types, time-step processing, operating policies, and business rules.
- **Presentation:** Dashboard panels, satellite details, charts, event/alert feed, and time controls.
- **Visualization:** Planet, orbit paths, and satellite markers, driven by domain state.
- **Persistence:** Browser save/load and save-format versioning.

UI components should request domain actions and render resulting state; they should not independently implement business or satellite simulation rules.

## Deployment direction

Use Vite's static output and publish the generated site with GitHub Pages through GitHub Actions. The Vite base path is configured for the `Stark-Ephemeris` project page when `GITHUB_ACTIONS` is enabled. The workflow and repository Pages settings remain to be set up.

## Open technical decisions

- Whether to retain TypeScript, Vite, and CesiumJS beyond the prototype.
- Whether to replace the spherical gameplay Earth with WGS84 ellipsoid calculations.
- Which additional orbit classes (for example, different circular altitudes/inclinations or non-circular orbits) and propagation fidelity to support after the starter circular orbit. Preserve per-spacecraft orbit inputs and a replaceable propagator boundary in the meantime.
- Whether to add axial tilt, date/season effects, twilight, and a more precise Sun ephemeris.
- Whether to replace the cylindrical eclipse rule and fixed station radius with exact geometry and link constraints.
- How simulation time should map to calendar time and how time state should be saved.
- The first save schema and when save/load enters the prototype.
- What browser sizes and accessibility requirements are in the first release target.
- The GitHub Pages workflow, repository settings, and public asset/data licensing requirements.
