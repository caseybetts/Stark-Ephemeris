# Pending Changes

This is the project's on-deck menu of implementation work. It turns discussed features into bounded work items an agent can pick up after the user selects them.

## How to use this list

- The user can select work by ID or by outcome, for example: **Work on UI-01** or **Show cell values in the GUI**. A request to take the next step selects the next milestone in the order below.
- Do not start an item solely because it appears here. Work within the user's selected outcome and check its dependencies and source documents first; a milestone may span the minimum required parts of CELL-02 and CELL-03.
- Keep each change within its listed scope. If implementation requires an open gameplay or technical decision, surface that decision instead of silently turning a proposal into a requirement.
- Update an item's status here when the user selects it or when the work is completed. Mark completed items with a short note and date; keep this menu focused on work that remains.
- Read [`README.md`](README.md), [`GAMEPLAY.md`](GAMEPLAY.md), and [`TECHNICAL_STRATEGY.md`](TECHNICAL_STRATEGY.md) before implementation. Read [`IMPLEMENTATION_OUTLINE.md`](IMPLEMENTATION_OUTLINE.md) for the current world model and code boundaries.

## Status key

- **Ready:** The first implementation slice is sufficiently described.
- **Needs design:** The direction is agreed, but important rules or data sources need user decisions before the full feature can be implemented.
- **Partial:** A usable slice is implemented; the item lists remaining work and decisions.

## Cell value inspection milestones

**Priority agreed 2026-10-06:** The user wants to see cell values and manually check progress. Deliver a working value readout before completing automatic collection, scheduling, or the wider economy.

| Part | Current state | Work needed for visible values |
| --- | --- | --- |
| Cell geography and proposed category quantities | Implemented; visible in Orders | Reuse the existing grid and selected-cell interaction |
| VAM, payout, priority, and collection state | Implemented as domain modules | Sample readout and manual collection/recovery preview are visible in Orders; automatic capture and final game balance remain open |
| Dollar totals and market readout | Sample values visible in Orders | Review the calculations in the GUI; final rates and category balance remain open |

### CELL-03A — First visible dollar values

**Status:** Completed 2026-10-06. The app now shows numeric cell values and their category breakdown in Orders, using the proposed preview configuration below.

**Implemented preview configuration (still Proposed for gameplay):** `src/simulation/prototypeCellMarket.ts` supplies $1 per native exposure unit, 1 priority point per matching unit, and a 100-day cadence (8,640,000 seconds) for each candidate category, plus $0 initial cash for the preview model. The readout says “Prototype market — sample rates.” All candidate contributions are additive so the arithmetic is easy to inspect; final categories, overlap policy, balance, and starting game budget remain open. Sample market prices/cadences are read-only in the player UI. Market trends are not modeled yet.

**Implemented:**

1. Created one app-owned market instance after loading the cell grid and connected it to the existing simulation clock. The instance persists through tab switches and UI refreshes.
2. Added a category readout with market price, unit, cadence, and editable player priority rate. Configuration supplies every candidate category; a missing rate is an error rather than an implied zero price.
3. Added maximum and available payout columns to the paginated cell table. Selected-cell details show totals and a category breakdown of quantity, market rate, maximum payout, VAM, available payout, priority rate, and available priority. Cadence appears per category.
4. Replaced hard-coded economy placeholders with calculated values. The selected cell and visible table rows refresh when simulation time or priority inputs change; geographic sorting, filtering, selection, and map interactions remain intact.

**Verified result:** Orders shows maximum and available payout for each visible row. Selecting a cell shows its category quantities, rates, VAM, available payout, and priority contributions. Never-collected cells start with VAM 1; a cell without candidate exposure shows $0.00. Editing one category's priority updates the selected cell's priority immediately while leaving dollars unchanged, including while paused. TypeScript, the existing cell/economy tests, production build, and live Orders inspection passed.

**Not prerequisites:** Automatic captures, scheduler ranking, final game balance or starting cash, market trends, cloud/pointing/slew rules, storage/downlink, Finance & Growth, persistence, or dollar/priority/VAM heat maps. The earlier choice to keep the geographic baseline unpriced describes the current state; it must not be treated as a permanent blocker to this requested value preview. Keep temporary preview assumptions explicit rather than presenting them as final gameplay agreements.

### CELL-03B — Inspect collection and recovery

**Status:** Completed 2026-10-06.

Orders now has clearly labeled preview controls to record a successful collection of the selected cell, preview a failed attempt, advance the shared simulation clock by explicit durations, and reset the preview. Successful capture uses the same domain settlement operation as the state model; the UI shows event payout, preview cash, the shared last-collection time, and per-category VAM and available payout. Reset restores the supplied sample scenario, starting cash, priorities, cell timestamps, and simulation time without changing geographic source data. These controls preview successful completion; they do not establish satellite access, duration, or scheduling rules.

**Verification:** With the sample 100-day cadence, the GUI showed the New York cell at VAM 0% immediately after capture, 0% at day 10, 50% at day 55, and 100% at day 100. The capture credited its $1,938.80 payout once; the failed-attempt preview left cash and the day-0 collection timestamp unchanged. Focused state-model checks pass for duplicate event rejection, failed validation leaving state unchanged, cadence changes against the shared timestamp, and reset restoring preview defaults. The domain tests also cover a single timestamp with category-specific cadence curves. Production build succeeds; the existing large Cesium chunk warning remains.

**After these visible milestones:** Settle automatic capture/access and scheduler rules, add the real collection lifecycle and market trends, then add value map layers, broader sorting, and finance reporting as separate tasks. Final category/balance review can use the GUI evidence from CELL-03A/B.

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
- CELL-01/CELL-03 geographic foundation completed 2026-10-05: 363,779 eligible ¼° land/coastal cells and fourteen sourced datasets, including military installations, data centers, NOAA research stations, and UNESCO World Heritage points. Orders has search, filters, sorting, pagination, cell details, and sixteen cell map modes. CELL-03A/B added a sample-priced market readout, cell payout/priority breakdown, and controlled collection/recovery preview on 2026-10-06; category approval, final rates, automatic capture, scheduler, and market trends remain open.

## Ready for implementation

### UI-03 — Use station location as the table identifier

**Status:** Ready  
**Agreed:** The Ground Stations table does not need a separate station-name column when its location already identifies the site. If more than one station is in a city, distinguish those sites with numbers.

**Work:** Remove the standalone station-name column and use city/location as the primary identifier. If a city has multiple stations, append stable, deterministic numbering to distinguish them. Preserve internal station IDs and the other site-specific columns.

**Done when:** The table identifies each station by its location; duplicate-city locations receive unambiguous numbering; station identity in simulation data is unchanged.

## Cell market and imaging system

### CELL-01 — Prepare the land-intersecting cell market

**Status:** Partial — geographic foundation and proposed exposure mapping implemented 2026-10-06; category approval and valuation remain open.
**Implemented:** 363,779 eligible cells with fourteen sourced datasets: six Natural Earth layers; cropland and pasture area; power plant counts/capacity; mapped major oil pipeline routes; military installation polygons; data-center records; NOAA research-monitoring stations; and UNESCO World Heritage entries. A reproducible build pipeline records provenance and keeps remaining unsourced attributes null. The initial geographic foundation had unset dollar values; CELL-03A now shows an explicitly labeled sample market. See [Cell grid data](CELL_DATA.md).

**Agreed:** Use a regular ¼° latitude/longitude grid. Cells that intersect any land are eligible, including mixed land-and-sea coastal cells; cells with no land are excluded. Do not require a land-fraction calculation. Geographic feature layers may contribute to each eligible cell's maximum in-game collection value.

**Implemented:** `src/simulation/categoryExposures.ts` defines a data-driven, Cesium-independent candidate mapping. It converts mapped urban area, cropland, and pasture to km²; preserves source counts for mapped populated places, ports, power-plant records, oil-route features, military installation polygons, data-center record/polygon presence, NOAA stations, and World Heritage records; and also exposes power capacity in MW. Orders shows these candidate quantities and calculated sample payouts. The sample rates are explicitly provisional.

**Work remaining:** Review and approve or revise the candidate market categories and exposure measures for the final economy. The explicitly labeled candidate mapping is sufficient for CELL-03A's preview; final approval is not a prerequisite for displaying sample values. Keep static exposures separate from market rates and recovery state.

**Done when:** Every eligible cell's proposed category exposures can be inspected and normalized independently of Cesium, ready for the dynamic market and value rules in CELL-02. This implementation criterion is met; the candidate taxonomy still needs product review before it becomes agreed.

**Open choices:** Approve/revise the proposed category list and decide whether overlapping categories may use the same exposure; determine whether record/polygon presence is an acceptable exposure for data centers and military installations; decide whether to add more geographic layers. Sources and licenses for all fourteen datasets are recorded.

### CELL-02 — Calculate whole-cell revenue and repeat-purchase behavior

**Status:** Partial — pure VAM/payout/priority calculations and a Cesium-independent market/cell-state model are implemented 2026-10-06; runtime configuration and Orders/finance integration remain.

**Agreed:** The ¼° cell is the smallest collection unit, and collection is treated as imaging the entire cell. Swath width is abstracted away; timing, resource use, and access rules are defined at the cell level. Successful capture pays the sum of currently available per-category payouts and credits company money immediately on completion.

**Agreed:** The market sets each category's current imagery price and average customer refresh cadence. These values change over time, are visible in a read-only market dashboard, and are not player-editable. Rates use category-appropriate units, such as dollars per square kilometre or dollars per counted feature. The player sets an editable priority rate in points per matching unit for each category. These category priority rates determine per-cell priority from that cell's area/count exposure; there is no separate category or cell emphasis control. Priority rates do not change market prices, cadence, or payout.

**Agreed recovery curve and state:** A never-collected cell starts at VAM 1. Store one last-collection timestamp per cell; all categories in that cell share elapsed time but apply their own cadence. The minimum refresh period is 10% of cadence. VAM is 0 through that time, rises linearly to 1 at the full cadence, and stays there: `VAM = clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. For example, with a 100-day cadence, VAM stays 0 through day 10 and reaches 1 at day 100. Durations use explicit simulation units (internally seconds); calendar months are not a simulation unit. Recalculate VAM and derived payout/priority immediately when time, cadence, market price, or player priority rates change. Values are calculated scores, not balances. A whole-cell collection resets the shared timestamp for all categories in the cell, including slower-refresh categories; this is accepted. An optional per-cell `atMaximum` cache is true only when all contributing categories are at VAM 1 and is invalidated when relevant market data changes.

For each cell-category, maximum payout is applicable market unit price × eligible area/count and available payout is maximum payout × VAM. Maximum priority is player-set category priority rate × eligible area/count and available priority is maximum priority × VAM. Sum payouts and priority points separately. Successful capture completion calculates and records payout, credits company money exactly once, and resets the cell timestamp as one operation. Failed capture does not pay or reset.

**Implemented:** `src/simulation/cellEconomy.ts` calculates VAM, category payouts, category priority points, and capture settlements without renderer dependencies. `src/simulation/cellMarketState.ts` composes caller-supplied market prices/cadences and player priority rates with the CELL-01 exposure mapping; holds one compact last-collection timestamp per cell; recalculates snapshots on demand; and records a successful capture event with cell, satellite, time, and category payouts while crediting supplied company cash exactly once per unique event ID. No market rates, cadence defaults, player rates, or starting cash are invented.

**Implemented preview:** CELL-03B now exposes successful and failed-attempt previews, explicit shared-clock advances, cash and category recovery readouts, and reset in Orders. The preview is a verification tool, not the automatic collection lifecycle.

**Work remaining:** Final rates, market trends, starting budget, scheduler ranking, and real capture access/duration/failure rules remain separate gameplay work. Keep category approval and overlap choices from CELL-01 visible.

**Done when:** Per-category payout is market unit price × eligible exposure × VAM; per-category priority is player-set priority rate × eligible exposure × VAM; the two totals are inspectable separately; never-collected cells start at VAM 1; time/input changes update calculated values immediately; capture credits the sum of payouts once and resets the timestamp; market data is not player-editable; and changing priority rates affects scheduling without changing payout. Domain state and the manual Orders preview are implemented; automatic capture/scheduling is not.

**Open choices:** Approval/revision of CELL-01's proposed category mapping and treatment of overlapping categories/features; starting prices, priority rates, and cadences and their trends; how the scheduler ranks available priority against payout, access, and satellite constraints; starting company cash; collection timing/cost; and the role of clouds/Sun/off-nadir/slew capability.

### CELL-03 — Show the cell market in Orders

**Status:** Partial — geographic visualization and CELL-03A/B sample market, cell value, and collection/recovery readouts implemented; value map modes remain.
**Implemented:** Toggleable imagery tiles for eligibility and fourteen sourced geographic datasets, plus a mapped oil pipeline route overlay, cell selection on the globe, search, filters, sorting, pagination, and details in Orders. A read-only sample market price/cadence table, editable priority rates, numeric payout columns, selected-cell category calculations, and manual collection/recovery preview are visible. No globe entity is created for each cell.

**Agreed:** The Orders tab presents the cell market, with toggleable globe layers for category exposure, calculated cell value, or repeat-purchase/freshness state once defined. The grid has about 1.04 million cells before land masking; the renderer must not create one globe entity per cell.

**Agreed future UI requirement (2026-10-06):** The Cell table should eventually support sorting and filtering by calculated dollar value, maximum priority, and current/available priority, in addition to its existing geographic-attribute sorting and filtering. Cells on the globe should have selectable color modes that show dollar value, maximum priority, or current/available priority. “Maximum priority” is the sum of category priority points at VAM 1; “current priority” is the calculated available priority after each category's VAM is applied.

**Work:** Review/approve the proposed categories and sample balance; add value-aware table sorting/filtering; then render tiled or aggregated value, priority, and freshness layers and connect them to the same state already shown in Orders.

**Done when:** The view and globe map reflect the same simulation state, support cell selection, expose sorting/filtering for the calculated value and priority totals, and offer cell-color modes for dollar value, maximum priority, and current/available priority. These remain separate from geographic data preparation and collection rules.

**Open presentation choices:** Color ramps, normalization across the globe, legend/readout behavior, and whether filtering uses ranges, thresholds, or both. Geographic display conventions and source caveats are recorded in [Cell grid data](CELL_DATA.md).

**Remaining, in order:** Review proposed category/exposure choices and sample balance; add value-aware sorting/filtering; implement dollar/maximum-priority/current-priority cell-color modes; then add freshness coloring as a separate layer. These can be delivered as separate increments.

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

1. ~~Inspect the completed **CELL-03A** dollar readout and category breakdown in Orders.~~ Completed 2026-10-06.
2. ~~Implement **CELL-03B**: inspect collection payouts, cash credit, and recovery with explicit preview controls and focused state checks.~~ Completed 2026-10-06.
3. Review proposed **CELL-01** categories/exposures and sample balance using the GUI evidence; define real capture/access and scheduling behavior before implementing automatic **CELL-02**. Market trends and remaining **CELL-03** map layers can follow independently.
4. Add finance reporting and any modeled operating costs in **BIZ-01**; capture cash credits are already owned by CELL-02 and must not be applied again.
5. **FLEET-03** can extend the current per-spacecraft orbit model; **OPS-01**, **FLEET-02**, and **BIZ-02** add operations and growth as their rules are decided.
6. **OPS-02**, **PLATFORM-01**, and **PLATFORM-02** remain queued for selection when their dependencies and release timing are clear.
