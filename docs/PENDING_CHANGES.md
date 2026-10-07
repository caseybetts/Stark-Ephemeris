# Pending Changes

This is the project's on-deck menu of implementation work. It turns discussed features into bounded work items an agent can pick up after the user selects them.

## How to use this list

- The user selects work by ID, for example: **Work on UI-01**.
- Agents must not start an item solely because it appears here. Work only on the item the user selects, and check its dependencies and source documents first.
- Keep each change within its listed scope. If implementation requires an open gameplay or technical decision, surface that decision instead of silently turning a proposal into a requirement.
- Update an item's status here when the user selects it or when the work is completed. Mark completed items with a short note and date; keep this menu focused on work that remains.
- Read [`README.md`](README.md), [`GAMEPLAY.md`](GAMEPLAY.md), and [`TECHNICAL_STRATEGY.md`](TECHNICAL_STRATEGY.md) before implementation. Read [`IMPLEMENTATION_OUTLINE.md`](IMPLEMENTATION_OUTLINE.md) for the current world model and code boundaries.

## Status key

- **Ready:** The first implementation slice is sufficiently described.
- **Needs design:** The direction is agreed, but important rules or data sources need user decisions before the full feature can be implemented.
- **Partial:** A usable slice is implemented; the item lists remaining work and decisions.

## Already implemented

Do not select these as pending work unless a new defect is reported:

- Browser app scaffold using TypeScript, Vite, and CesiumJS.
- Static Earth globe with Natural Earth II imagery and sample ground locations.
- One circular satellite orbit, moving satellite marker, optional orbit track, pause, and simulation speed controls.
- Prototype sunlight, satellite eclipse, sub-satellite coordinates, and approximate ground-station range calculations with status readouts.
- Orbit-track flicker fix and Earth occlusion for satellite and surface markers.
- UI-01 management tabs and Summary view completed 2026-10-02: the globe sits above Summary, Spacecraft, Orders, Ground Stations, and Finance & Growth; switching tabs leaves the running simulation intact.
- UI-02 Ground Stations table completed 2026-10-02: configured stations show site availability, location coordinates, and configurable uplink/downlink prototype rates, independent of spacecraft contact.
- FLEET-01 Spacecraft table and selection view completed 2026-10-02: the starting fleet remains one spacecraft, while the collection, per-spacecraft world snapshots, table/detail views, and globe marker/orbit selection support additional configured spacecraft.
- CELL-01/CELL-03 geographic foundation completed 2026-10-05: 363,779 eligible ¼° land/coastal cells and fourteen sourced datasets, including military installations, data centers, NOAA research stations, and UNESCO World Heritage points. Orders has search, filters, sorting, pagination, cell details, and sixteen cell map modes. Category exposure normalization, dollar rates, collection revenue, cadence behavior, and the market dashboard remain unfinished; see the partial CELL-01/02/03 items below.

## Ready for implementation

### UI-03 — Use station location as the table identifier

**Status:** Ready  
**Agreed:** The Ground Stations table does not need a separate station-name column when its location already identifies the site. If more than one station is in a city, distinguish those sites with numbers.

**Work:** Remove the standalone station-name column and use city/location as the primary identifier. If a city has multiple stations, append stable, deterministic numbering to distinguish them. Preserve internal station IDs and the other site-specific columns.

**Done when:** The table identifies each station by its location; duplicate-city locations receive unambiguous numbering; station identity in simulation data is unchanged.

## Cell market and imaging system

### CELL-01 — Prepare the land-intersecting cell market

**Status:** Partial — geographic foundation implemented 2026-10-05; valuation remains open.
**Implemented:** 363,779 eligible cells with fourteen sourced datasets: six Natural Earth layers; cropland and pasture area; power plant counts/capacity; mapped major oil pipeline routes; military installation polygons; data-center records; NOAA research-monitoring stations; and UNESCO World Heritage entries. A reproducible build pipeline records provenance and keeps remaining unsourced attributes null. The user requested that dollar values remain unset. See [Cell grid data](CELL_DATA.md).

**Agreed:** Use a regular ¼° latitude/longitude grid. Cells that intersect any land are eligible, including mixed land-and-sea coastal cells; cells with no land are excluded. Do not require a land-fraction calculation. Geographic feature layers may contribute to each eligible cell's maximum in-game collection value.

**Work:** Map the sourced attributes into market categories and define how area-based versus per-site/count attributes contribute to each cell. Keep static geographic exposures reproducible and separate from time-varying market rates, repeat-purchase state, and runtime simulation/UI logic.

**Done when:** Every eligible cell's category exposures can be inspected and normalized independently of Cesium, ready for the dynamic market and value rules in CELL-02.

**Open choices:** Whether to add more geographic layers; which attributes belong to each market category; and how area-based and per-site attributes are normalized. Sources and licenses for all fourteen datasets are recorded.

### CELL-02 — Calculate whole-cell revenue and repeat-purchase behavior

**Status:** Needs design  
**Agreed:** The ¼° cell is the smallest collection unit, and collection is treated as imaging the entire cell. Swath width is abstracted away; timing, resource use, and access rules are defined at the cell level. Successful capture pays the sum of currently available per-category payouts and credits company money immediately on completion.

**Agreed:** The market sets each category's current imagery price and average customer refresh cadence. These values change over time, are visible in a read-only market dashboard, and are not player-editable. Rates use category-appropriate units, such as dollars per square kilometre or dollars per counted feature. The player sets an editable priority rate in points per matching unit for each category. These category priority rates determine per-cell priority from that cell's area/count exposure; there is no separate category or cell emphasis control. Priority rates do not change market prices, cadence, or payout.

**Agreed recovery curve and state:** A never-collected cell starts at VAM 1. Store one last-collection timestamp per cell; all categories in that cell share elapsed time but apply their own cadence. The minimum refresh period is 10% of cadence. VAM is 0 through that time, rises linearly to 1 at the full cadence, and stays there: `VAM = clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. For example, with a 100-day cadence, VAM stays 0 through day 10 and reaches 1 at day 100. Durations use explicit simulation units (internally seconds); calendar months are not a simulation unit. Recalculate VAM and derived payout/priority immediately when time, cadence, market price, or player priority rates change. Values are calculated scores, not balances. A whole-cell collection resets the shared timestamp for all categories in the cell, including slower-refresh categories; this is accepted. An optional per-cell `atMaximum` cache is true only when all contributing categories are at VAM 1 and is invalidated when relevant market data changes.

For each cell-category, maximum payout is applicable market unit price × eligible area/count and available payout is maximum payout × VAM. Maximum priority is player-set category priority rate × eligible area/count and available priority is maximum priority × VAM. Sum payouts and priority points separately. Successful capture completion calculates and records payout, credits company money exactly once, and resets the cell timestamp as one operation. Failed capture does not pay or reset.

**Work:** Add Cesium-independent market state for time-varying category prices and refresh cadences, player-set category priority rates, per-cell category area/count exposures, and one last-collection timestamp per cell. Implement deterministic VAM, payout, priority-point calculation, and an atomic whole-cell collection event recording satellite/time/cell and immediate company revenue.

**Done when:** Per-category payout is market unit price × eligible exposure × VAM; per-category priority is player-set priority rate × eligible exposure × VAM; the two totals are inspectable separately; never-collected cells start at VAM 1; time/input changes update calculated values immediately; capture credits the sum of payouts once and resets the timestamp; market data is not player-editable; and changing priority rates affects scheduling without changing payout.

**Open choices:** Category mapping and exposure normalization; treatment of overlapping categories/features; starting prices, priority rates, and cadences and their trends; how the scheduler ranks available priority against payout, access, and satellite constraints; starting company cash; collection timing/cost; and the role of clouds/Sun/off-nadir/slew capability.

### CELL-03 — Show the cell market in Orders

**Status:** Partial — geographic visualization implemented 2026-10-05; market/revenue modes await CELL-02.
**Implemented:** Toggleable imagery tiles for eligibility and fourteen sourced geographic datasets, plus a mapped oil pipeline route overlay, cell selection on the globe, search, filters, sorting, pagination, and details in Orders. Dollar fields are explicitly unset. No globe entity is created for each cell.

**Agreed:** The Orders tab presents the cell market, with toggleable globe layers for category exposure, calculated cell value, or repeat-purchase/freshness state once defined. The grid has about 1.04 million cells before land masking; the renderer must not create one globe entity per cell.

**Work:** Add a market dashboard with read-only category imagery prices and average customer refresh cadences, plus player-editable category priority rates. Add a searchable, filterable, sortable cell view with location/ID, per-category exposure, available payout and priority contributions, cell payout and priority totals, and VAM/recovery state. Render tiled or aggregated cell layers and connect selected cells in the table to the globe.

**Done when:** The view and globe map reflect the same simulation state, support cell selection, and remain separate from geographic data preparation and collection rules.

**Remaining:** Add the market dashboard for read-only category prices/cadences and editable category priority rates; per-cell exposure, payout, and priority readouts; and payout/priority/VAM map layers. Geographic display conventions and source caveats are recorded in [Cell grid data](CELL_DATA.md).

### FLEET-03 — Support additional orbit models

**Status:** Needs design  
**Agreed:** Orbit definitions and propagation are per spacecraft. Fleet-level simulation and rendering must not assume all spacecraft share one altitude, phase, or path. The current circular orbit is a provisional starter model; future orbit classes should fit behind a replaceable propagation boundary.

**Work:** Introduce or refine an orbit-definition/propagation boundary so each spacecraft can provide its own orbit parameters and produce position/state at simulation time. Keep current circular propagation as the first model. Add additional orbit classes only when selected and specified; do not require high-fidelity astrodynamics as part of the abstraction work.

**Done when:** Two spacecraft can use different supported orbit definitions and independently produce correct snapshots and rendered paths without special cases in fleet tables or UI. Simulation/domain types remain Cesium-independent.

**Open choices:** Which orbit classes to support first, required accuracy, how orbit parameters are authored or acquired, epoch/time conventions, and whether perturbations or external ephemeris formats are needed.

**Dependency:** Existing per-spacecraft fleet definitions and world snapshots.

## Fleet, operations, and company systems

### FLEET-02 — Add slew speed and future-launch upgrades

**Status:** Needs design  
**Agreed:** Slew speed is a satellite capability. A paid upgrade affects satellites launched afterward.

**Work:** Add slew speed to satellite capability data and make cell-collection scheduling account for time needed to retarget between cells. Model upgrade purchases as company configuration applied to future launches, not retroactive changes to existing spacecraft.

**Done when:** Different slew capabilities can change retarget time and opportunity throughput; newly launched satellites receive the selected upgrade level; existing satellite specifications remain stable.

**Open choices:** Units, starting values, upgrade cost and progression, whether slew speed is distinct from pointing-angle limits, and how satellite design/launch purchasing is represented.

### OPS-01 — Model onboard storage, power, and downlink operations

**Status:** Needs design  
**Agreed:** Operations should connect image capture, onboard data retention, energy, eclipse, downlink opportunities, and station service. Routine operation should eventually be manageable through standing priorities.

**Work:** Design and then implement explicit simulation state for generated image data, storage capacity, power generation/storage/use, and downlink. Keep time-step processing independent from the interface. The existing sunlight/eclipse and station-range calculations can provide inputs but do not yet change battery or data state.

**Done when:** A capture consumes defined resources and occupies storage; downlink transfers data under explicit availability/capacity rules; sunlight/eclipse affects energy according to documented rules; state is visible in the Spacecraft and Ground Stations views.

**Open choices:** Storage units and data sizes, battery/solar behavior, power consumption, data retention/deletion, station bandwidth/scheduling, and tick size.

### OPS-02 — Add health, degradation, and anomaly response

**Status:** Needs design  
**Agreed:** Satellites can degrade or encounter anomalies; players should see understandable symptoms and make consequential intervention choices.

**Work:** Define health state, degradation causes, anomaly events, and the information exposed before/after diagnosis. Add an exception queue to Summary and relevant spacecraft details once the rules are settled.

**Done when:** At least one anomaly has a legible cause/effect and player response path; the event changes simulation capability or risk and is reflected in fleet status.

**Open choices:** Failure rates, hidden versus visible information, diagnosis process, repair costs, intervention choices, and whether anomalies can permanently disable a satellite.

### BIZ-01 — Connect imagery collection to company finances

**Status:** Needs design  
**Agreed:** On successful whole-cell capture completion, the cell's calculated currently available market payout is credited exactly once. CELL-02 owns the collection calculation, company cash transaction, and recovery reset as one domain event. BIZ-01 adds finance reporting and any later operating costs; it must not credit the capture a second time. The initial market has no archive sales for old imagery. Individual customer contracts and satisfaction are optional future layers.

**Work:** Record cell-collection payouts at capture and connect them to company cash/income. If storage, downlink, processing, or delivery are modeled, treat their capacity and costs separately from whether the image sale occurs. Add customer satisfaction only if a later contract system defines service expectations.

**Done when:** Each collection payout and relevant cost is traceable to simulation events and company totals reconcile from those events.

**Open choices:** Which operational costs apply after an immediate sale; whether to add contracts, deadlines, penalties, customer retention, or satisfaction later.

### BIZ-02 — Add Finance & Growth view and satellite procurement

**Status:** Needs design  
**Agreed:** Money constrains hardware, launches, operations, and business growth. Finance & Growth is a management tab.

**Work:** Show company cash, income, costs, and available growth decisions from explicit company state. Later connect spending to satellite design, slew upgrades for future launches, launch cadence, and ground capacity.

**Done when:** Every displayed financial figure is derived from recorded company and collection events; purchases validate affordability and change the intended future capability or capacity; income is reconciled from recorded cell-collection and other business events.

**Open choices:** Starting funds, prices, recurring costs, launch cadence, financing, satellite design options, and whether growth unlocks are time- or milestone-based.

## Persistence and deployment

### PLATFORM-01 — Add local save and load

**Status:** Needs design  
**Agreed:** The prototype is a static single-player browser app; local browser persistence is the provisional direction if saves are added.

**Work:** Save and restore the versioned simulation state locally, including game time, repeat-purchase state, and company/fleet state as those systems are implemented. Add migration handling before changing a released save schema.

**Done when:** A player can reload without losing a saved run; invalid or older data is handled without silently corrupting a save.

**Open choices:** When saving enters the first playable build, autosave/manual-save behavior, save slots, and the initial schema version.

### PLATFORM-02 — Configure GitHub Pages publishing

**Status:** Ready  
**Agreed:** GitHub Pages is the target static host; no game server is required for the initial build.

**Work:** Add a GitHub Actions workflow that installs dependencies, builds the Vite app with the repository base path, and prepares the static output for Pages. Document any repository Pages setting that must be enabled.

**Done when:** A clean checkout builds in CI and the workflow prepares the Pages artifact with Cesium assets resolving at the configured project path. A live public deployment is a separate step.

**Open choices:** Public publication timing and required asset/data attributions. Preparing the workflow does not authorize an agent to push changes or enable public publishing; handle those as separate user-approved actions.

## Suggested starting order

This is a dependency guide, not a commitment to start work automatically:

UI-03 is a ready but deferred table cleanup; it does not block the next simulation-system work.

1. Finish **CELL-01** by agreeing the market categories and normalizing sourced attributes into inspectable per-cell area/count exposures.
2. Define and implement **CELL-02**: time-varying market prices/cadences, player-set category priority rates, shared VAM recovery, category-based payout and priority calculation, and immediate whole-cell sales.
3. Complete **CELL-03** with the category market dashboard, per-cell category exposure and gross value readouts, and cadence/repeat-purchase display.
4. Add finance reporting and any modeled operating costs in **BIZ-01**; capture cash credits are recorded by CELL-02.
5. **FLEET-03** can extend the current per-spacecraft orbit model; **OPS-01**, **FLEET-02**, and **BIZ-02** add operations and growth as their rules are decided.
6. **OPS-02**, **PLATFORM-01**, and **PLATFORM-02** remain queued for selection when their dependencies and release timing are clear.
