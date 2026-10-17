# Pending Changes

This is the project's on-deck menu of implementation work. It turns discussed features into bounded work items an agent can pick up after the user selects them.

**Design update (2026-10-15):** BIZ-02's standard purchase flow, pre-launch orbit selection, and shared antenna handoff are implemented; the production build passes. The user also approved prototype policies for capture completion, contact episodes, image retention/transfer, capture-time value quotes, and OPS-01B power behavior. Capacity and image-size values, physical capture limits, final power balance, and planner forecasts of antenna contention remain open.

## How to use this list

- The user can select work by ID or by outcome, for example: **Work on OPS-04** or **Finish automatic TEL replanning**. A request to take the next step selects the first incomplete entry in [Suggested starting order](#suggested-starting-order); a **Needs design** entry starts with its design decisions, not implementation of assumed rules.
- Do not start an item solely because it appears here. Work within the user's selected outcome and check its dependencies and source documents first; a milestone may span the minimum required parts of CELL-02 and CELL-03.
- Keep each change within its listed scope. If implementation requires an open gameplay or technical decision, surface that decision instead of silently turning a proposal into a requirement.
- Update an item's status here when the user selects it or when the work is completed. Mark completed items with a short note and date; keep this menu focused on work that remains.
- Read [`README.md`](README.md), [`GAMEPLAY.md`](GAMEPLAY.md), and [`TECHNICAL_STRATEGY.md`](TECHNICAL_STRATEGY.md) before implementation. Read [`IMPLEMENTATION_OUTLINE.md`](IMPLEMENTATION_OUTLINE.md) for the current world model and code boundaries.

## Status key

- **Ready:** The first implementation slice is sufficiently described.
- **Needs design:** The direction is agreed, but important rules or data sources need user decisions before the full feature can be implemented.
- **Partial:** A usable slice is implemented; the item lists remaining work and decisions.
- **Split:** An umbrella item retained for existing references; select its bounded child tasks in dependency order.
- **Completed:** The described slice is implemented; this does not approve its provisional gameplay values or imply all later extensions are complete.

## Roadmap alignment and tonight's handoff (2026-10-13)

The [roadmap](ROADMAP.md) owns the high-level sequence. This menu maps that sequence to existing task IDs without treating every layer as finished or every open rule as approved. “Global Order Deck” maps to the existing Orders cell market; it does not introduce individual customer contracts.

| Roadmap area | Work items and current boundary |
| --- | --- |
| Layer 1: GUI and visualizations, Global Order Deck | Management tabs, CELL-03A/B, and priority/value/schedule/imaging map prototypes are implemented. Value sorting/filtering and map behavior review remain; UI-03 is a ready, independent cleanup. Broader polish belongs to Layer 4. |
| Layer 1: Scheduling behavior | CELL-04A/B provide capture execution and automatic TEL planning for every spacecraft, preserving committed work through contact uploads. CELL-04C adds bounded search over tentative work. |
| Layer 2: Ground contact dynamics | OPS-03 provides approximate contacts and one TEL upload per contact episode; OPS-01A provides contact-limited transfer. OPS-04 verifies their integrated behavior. BIZ-02 adds one spacecraft per station antenna with pass-ordered handoff. Dynamic outages belong to Layer 3. |
| Layer 2: Basic Revenue Generation | CELL-02/CELL-02A and OPS-01A implement capture-to-downlink settlement with sample inputs. Full company accounting is BIZ-01 in Layer 3. |
| Layer 2: Spacecraft subsystems | FLEET-02A slew and OPS-01A storage are prototype slices; OPS-01B power is implemented and verified at prototype scope. Final balance remains open. CLOUD-01 adds environmental constraints to the same operational loop; it is supporting work, not a new spacecraft subsystem. |
| Layer 3: Company finances | BIZ-01 owns costs and accounting/reporting; BIZ-02 consumes that state in Finance & Growth. |
| Layer 3: Spacecraft building and launching | BIZ-02 owns procurement and launch choices; FLEET-02B adds paid slew upgrades for future launches. FLEET-03 now covers dynamic orbital maneuvers and orbit-model support. |
| Layer 3: Outages, errors, and anomalies | OPS-02 owns degradation/anomaly response and the design of operational outages, including missed contacts. |
| Layer 4: Playable attributes and revenue tuning | TUNE-01 coordinates final category/exposure review, balance, and operational scenario values after the relevant mechanics work. |
| Layer 4: GUI refinement | UI-04 covers usability and operational explanations; remaining CELL-03 inspection tools and UI-03 can be selected earlier when useful. |
| Release support, outside the four feature layers | PLATFORM-01 save/load and PLATFORM-02 publishing remain separately selectable. |

**Current selection status:** OPS-04, CELL-04B, and the approved prototype policy closure for CELL-04A, OPS-03, OPS-01A, CELL-02A, and OPS-01B are complete. OPS-01B has passed its deterministic verification and local GUI walkthrough; see its [implementation/verification guide](OPS_01B_POWER_DESIGN.md). This sequence is a work proposal, not a change to gameplay agreements.

**Ready alternative:** UI-03 is a small, specified table change. Do not interpret remaining design work as permission to invent pricing, contact, or failure policies.

### OPS-04 — Verify the integrated operational loop

**Status:** Completed 2026-10-14 — runtime regression repaired, shared `OperationalLoop` extracted, deterministic integration suite/build pass, and live browser contact/capture/downlink journey verified. The partial-transfer interval was confirmed by tests but was too brief to inspect at 300× playback.

**Implemented slice:** `SimulationRuntime` now processes queued actions that start and finish within one large advance. The browser and tests share `src/simulation/operationalLoop.ts` for chronological contact/action advancement, capture outcomes, storage pressure, transfer, settlement, and reset. `tests/operationalLoop.test.mjs` covers large/regular/irregular time partitions, exact and real contact prediction, both directions of capacity eviction, reset/replay, and a greedy TEL smoke case. See the [Technical Strategy boundary](TECHNICAL_STRATEGY.md#ops-04-integration-verification) and [verification guide](OPS_04_VERIFICATION.md).

**Verification results:** Automated coverage verifies no exchange with a down station, successful/failed capture effects, priority eviction, partial-byte persistence, exactly-once settlement, no pre-capture transfer, pending ground revisions, TEL Standby, chronology, priority edits independent of TEL/payout, automatic refresh and contact-cycle continuity, one upload across overlapping and back-to-back station windows, same-time trigger coalescing, locked-prefix replacement, slew-dependent feasible throughput, and reset. Checks pass: runtime 4/4, operations 17/17, market 10/10, cells 5/5, and production build. The live browser run uploaded ground TEL V1, executed captures, observed cell `C0627880` captured at T+11:12 with `$88.54` potential and no cash credited, then observed TEL exhaustion/Standby and a subsequent contact. At T+12:09:42 Orders showed `$5,607.37` revenue and no onboard imagery. The UI's manual preview is not live downlink evidence; the observed revenue came from normal simulation playback.

**Scope:** Fix defects exposed against documented prototype behavior and record any unresolved policy discrepancy. Do not introduce new balance, power, weather, or automatic replanning rules. OPS-04 verifies this prototype path; it does not validate the entire game or prove every possible contact geometry.

**Dependencies:** Implemented SIM-01, OPS-03, CELL-04A/B prototype, CELL-02A, and OPS-01A. No new product decision or external data is required to begin.

## Layer 2 foundations

These tasks connect the existing world and market calculations to the operational systems in [Roadmap Layer 2](ROADMAP.md#layer-2--operational-simulation-depth). The breakdown and sequence are the implementation plan; details explicitly marked **Proposed** or **Open** still need resolution before code depends on them. Each increment should expose enough state and event history to explain its behavior.

### SIM-01 — Own simulation time and action state in the domain

**Status:** Completed 2026-10-13 — generic timed actions, event history, and app clock integration are in place; contact, collection, and resource rules remain in their own tasks.

**Agreed boundary:** Simulation rules and state must be independent of Cesium and the interface.

**Work:** Introduce domain-owned time advancement, per-spacecraft runtime state, action identity/completion, and a small operational event history. Route playback and explicit time advances through the same domain entry point. Process intervening actions rather than jumping directly to an endpoint snapshot. Keep renderer snapshots and UI selection separate from mutable operational state.

**Implemented approach:** Advance directly between known action boundaries. Generic actions are queued sequentially per spacecraft; the domain records scheduled, started, and completed events with simulation timestamps. A large advance processes every action boundary in chronological order before setting the final clock time.

**OPS-04 repair (2026-10-13):** `SimulationRuntime.advanceBy` now repeatedly processes queued starts and completions through the requested endpoint. `npm run test:runtime` passes 4/4, including step-size invariance. The old baseline failure is repaired.

**Historical verified result:** A scripted sequence produces the same ordered events and final per-spacecraft action state for the same elapsed simulation time across small and large advances. UI playback and the manual preview clock call the same runtime. Pause avoids advancing it; completed actions run once; state and event history are inspectable without a renderer. `npm run test:runtime` and `npm run build` pass.

**Dependencies:** Existing pure world calculations and shared market model. No new gameplay constants are needed for a scripted foundation scenario.

### OPS-03 — Predict ground contacts and synchronize onboard TELs

**Status:** Completed 2026-10-14 — authored TELs upload once when an available contact episode begins, execute through the shared runtime, and process contact transitions during large time advances. Dynamic outages and generated schedules remain later extensions.

**Agreed:** A spacecraft exchanges TEL updates and imagery with the ground only during contact with an available ground station. The onboard TEL supplies commands through the next contact; ground-side revisions do not change it before upload. An exhausted TEL causes Standby. Upload and downlink may occur simultaneously.

**Work:** Predict contact start/end times with the existing 1,800 km approximation. Distinguish geometric access, station operational status, and an active communication opportunity. Maintain separately identifiable ground-plan and onboard-TEL versions; upload only during available contact. Begin with authored command sequences so plan synchronization can be inspected before automatic scheduling exists. Expose the next contact, onboard plan coverage, upload events, and Standby cause.

**Implemented prototype behavior:** Contact windows use the current circular-orbit world model and 1,800 km effective radius; a 120-second scan refines each boundary to about one second. The UI forecasts 24 hours ahead. An authored sample TEL covers the interval from the first to the second distinct predicted contact and uploads once at the start of an available contact episode. Overlapping and back-to-back windows for one spacecraft are one episode; ground-plan revisions made during an episode wait for a later episode. Simulation advancement groups simultaneous edges per spacecraft and processes them chronologically with action completions. BIZ-02 adds one spacecraft per station antenna, with earliest-pass ownership and handoff to the next waiting spacecraft still in view. If no contact is predicted in the UI horizon, the revised ground plan stays pending and the onboard TEL continues; an exhausted TEL stays in Standby until a later available contact. Station availability is static in the current scenario, so an unexpected outage or missed predicted pass is not simulated.

**Done when:** A down station cannot exchange data; transitions are processed even when one time advance crosses a full contact; changing a ground plan outside contact leaves onboard commands unchanged; upload updates the onboard version during contact; and exhausting a TEL enters Standby. The prototype's no-predicted-contact behavior and static-outage limitation are documented above.

**Later extensions:** Operational outages and truly missed contacts; contact accuracy beyond the current approximate geometry; and upload size/duration. The approved contact-episode and antenna queue policies are in [Gameplay](GAMEPLAY.md#agreed-operational-closure-policies-approved-2026-10-14).

**Dependencies:** SIM-01 and existing orbit/station definitions. Physical capture execution belongs to CELL-04A, automatic plan generation to CELL-04B, and imagery transfer to OPS-01A.

## Cell value inspection milestones

**Priority agreed 2026-10-06:** The user wants to see cell values and manually check progress. Deliver a working value readout before completing automatic collection, scheduling, or the wider economy.

| Part | Current state | Work needed for visible values |
| --- | --- | --- |
| Cell geography and proposed category quantities | Implemented; visible in Orders | Reuse the existing grid and selected-cell interaction |
| VAM, payout, priority, and collection state | Implemented as domain modules | Sample readout, manual preview, TEL capture execution, and automatic continuation exist; category approval and final game balance remain open |
| Dollar totals and market readout | Sample values visible in Orders | Review the calculations in the GUI; final rates and category balance remain open |

### CELL-03A — First visible dollar values

**Status:** Completed 2026-10-06. The app now shows numeric cell values and their category breakdown in Orders, using the proposed preview configuration below.

**Implemented preview configuration (still Proposed for gameplay):** `src/simulation/prototypeCellMarket.ts` supplies $1 per native exposure unit, 1 priority point per matching unit, and a 100-day cadence (8,640,000 seconds) for each candidate category, plus $0 initial cash for the preview model. The readout says “Prototype market — sample rates.” All candidate contributions are additive so the arithmetic is easy to inspect; final categories, overlap policy, and balance remain open. BIZ-02 sets the company opening balance to -$50,000. Sample market prices/cadences are read-only in the player UI. Market trends are not modeled yet.

**Implemented:**

1. Created one app-owned market instance after loading the cell grid and connected it to the existing simulation clock. The instance persists through tab switches and UI refreshes.
2. Added a category readout with market price, unit, cadence, and editable player priority rate. Configuration supplies every candidate category; a missing rate is an error rather than an implied zero price.
3. Added maximum and available payout columns to the paginated cell table. Selected-cell details show totals and a category breakdown of quantity, market rate, maximum payout, VAM, available payout, priority rate, and available priority. Cadence appears per category.
4. Replaced hard-coded economy placeholders with calculated values. The selected cell and visible table rows refresh when simulation time or priority inputs change; geographic sorting, filtering, selection, and map interactions remain intact.

**Verified result:** Orders shows maximum and available payout for each visible row. Selecting a cell shows its category quantities, rates, VAM, available payout, and priority contributions. Never-collected cells start with VAM 1; a cell without candidate exposure shows $0.00. Editing one category's priority updates the selected cell's priority immediately while leaving dollars unchanged, including while paused. TypeScript, the existing cell/economy tests, production build, and live Orders inspection passed.

**Not prerequisites:** Automatic captures, scheduler ranking, final game balance or starting cash, market trends, cloud/pointing/slew rules, storage/downlink, Finance & Growth, persistence, or dollar/priority/VAM heat maps. The earlier choice to keep the geographic baseline unpriced describes the current state; it must not be treated as a permanent blocker to this requested value preview. Keep temporary preview assumptions explicit rather than presenting them as final gameplay agreements.

### CELL-03B — Inspect collection and recovery

**Status:** Completed 2026-10-06; lifecycle preview migrated 2026-10-13.

Orders now has clearly labeled preview controls to record successful/failed collection attempts, advance the shared simulation clock, deliver or delete the resulting sample imagery, and reset the preview. Capture resets recovery and stores an image without crediting revenue; downlink settlement and deletion are distinct events. The UI shows value potential, realized revenue, onboard imagery, lost value, the shared last-collection time, and per-category VAM. Reset restores the supplied scenario and clears image/events without changing geographic source data. These controls preview lifecycle outcomes; they do not establish satellite access, duration, or live transfer rules.

**Historical verification before the 2026-10-13 migration:** With the sample 100-day cadence, the GUI showed the New York cell at VAM 0% immediately after capture, 0% at day 10, 50% at day 55, and 100% at day 100. The earlier preview credited the $1,938.80 capture quote immediately; CELL-02A supersedes that behavior. The failed-attempt preview left cash and the day-0 collection timestamp unchanged. Production build succeeds; the existing large Cesium chunk warning remains.

**After these visible milestones:** Continue the revised contact/TEL and capture-to-downlink sequence below, including live transfer, capacity-driven retention, and automatic capture integration. Market trends, richer map/table tools, and finance reporting are separate increments. Final category/balance review can use the GUI evidence from CELL-03A/B.

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
- CELL-01/CELL-03 geographic foundation completed 2026-10-05: 363,779 eligible ¼° land/coastal cells and fourteen sourced datasets, including military installations, data centers, NOAA research stations, and UNESCO World Heritage points. Orders has search, filters, sorting, pagination, cell details, and sixteen cell map modes. CELL-03A/B added a sample-priced market readout, cell payout/priority breakdown, and controlled collection/recovery preview on 2026-10-06; category approval, final rates, and market trends remain open; TEL capture execution and automatic greedy continuation are implemented as prototypes.

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

**Status:** Partial — VAM/payout/priority calculations and the live image lifecycle are implemented; final rates, category approval, and balance remain open.

**Agreed:** The ¼° cell is the smallest collection unit, treated as imaging the entire cell. Swath width is abstracted away; timing, resource use, and access rules are defined at cell level. Successful capture creates onboard imagery and resets collection recovery. Revenue is realized only when that imagery is downlinked; imagery deleted before delivery earns nothing.

**Agreed:** The market sets each category's current imagery price and average customer refresh cadence. These values change over time, are visible in a read-only market dashboard, and are not player-editable. Rates use category-appropriate units, such as dollars per square kilometre or dollars per counted feature. The player sets an editable priority rate in points per matching unit for each category. These category priority rates determine per-cell priority from that cell's area/count exposure; there is no separate category or cell emphasis control. Priority rates do not change market prices, cadence, or payout.

**Agreed recovery curve and state:** A never-collected cell starts at VAM 1. Store one last-collection timestamp per cell; all categories in that cell share elapsed time but apply their own cadence. The minimum refresh period is 10% of cadence. VAM is 0 through that time, rises linearly to 1 at the full cadence, and stays there: `VAM = clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. For example, with a 100-day cadence, VAM stays 0 through day 10 and reaches 1 at day 100. Durations use explicit simulation units (internally seconds); calendar months are not a simulation unit. Recalculate VAM and derived payout/priority immediately when time, cadence, market price, or player priority rates change. Values are calculated scores, not balances. A whole-cell collection resets the shared timestamp for all categories in the cell, including slower-refresh categories; this is accepted. An optional per-cell `atMaximum` cache is true only when all contributing categories are at VAM 1 and is invalidated when relevant market data changes.

For each cell-category, maximum payout is market unit price × eligible exposure and available payout is maximum payout × VAM. Maximum priority is player priority rate × exposure and available priority is maximum priority × VAM. Sum payouts and priority separately. Successful capture records an image and resets the cell timestamp without paying cash; failed capture does neither. Downlink settlement credits the capture-time quote once on full delivery.

**Implemented prototype:** `src/simulation/cellEconomy.ts` calculates VAM, category payouts, and priorities without renderer dependencies. `src/simulation/cellMarketState.ts` tracks cell timestamps, image records, transfer progress, deletion/downlink events, and exactly-once realized revenue; capture does not credit cash. `src/simulation/imageryOperations.ts` applies capacity-based retention and advances downlink only during active station contacts.

**Implemented preview:** CELL-03B now exposes successful and failed-attempt previews, explicit shared-clock advances, cash and category recovery readouts, and reset in Orders. The preview is a verification tool, not the automatic collection lifecycle.

**Work remaining:** Final rates, market trends, and capture access/duration/failure rules remain separate gameplay work. Keep category approval and overlap choices from CELL-01 visible. CELL-04B automatic continuation and CELL-04C bounded search are implemented at prototype scope. Market-change behavior needs design before tuning its values; final balance belongs to TUNE-01.

**Done when:** Payout potential and priority remain separately inspectable, VAM follows the agreed shared collection timestamp, successful capture creates image inventory and resets recovery without cash credit, and downlink realizes eligible revenue exactly once. Deleted undelivered imagery cannot earn money. Market data remains read-only and changing player priority does not change price. The prototype lifecycle is implemented; category approval and market balance remain open.

**Open choices:** Approval/revision of CELL-01's proposed category mapping and treatment of overlapping categories/features; starting prices, priority rates, and cadences and their trends; and collection timing/cost. Starting company cash is agreed under BIZ-02. Scheduler details are tracked in CELL-04.

### CELL-02A — Separate capture from downlink revenue

**Status:** Completed 2026-10-14 — identifiable image lifecycle, approved capture-time quote and retention snapshot, contact-limited FIFO transfer, capacity retention, and exactly-once full-downlink settlement are integrated as prototype behavior. Numeric capacity/image sizes remain open for balance.

**Work:** Introduce identifiable imagery records linking cell, spacecraft, capture time, size, retention priority, and transfer/settlement state. Separate capture/recovery from cash settlement. Establish the image and delivery-event contract shared with OPS-01A; migrate the manual preview and affected checks to the new lifecycle. The approved prototype quote uses market rates and pre-reset VAM at successful capture completion. A controlled delivery preview can exercise settlement before live transfer integration exists, and must be clearly labeled as a preview.

**Implemented prototype behavior:** Each successful capture creates an image record with cell/satellite identity, capture time, a 10 MiB sample size, captured value potential, and cell priority at capture completion as its retention score. Configured prototype capacity is 100 MiB per spacecraft; overflow deletes the lowest-priority image, with oldest capture then image ID as tie-breaks, including the incoming image. Live transfer advances FIFO at station downlink rate only during available contact, carries partial bytes across contacts, and settles the capture-time quote exactly once on full completion. The Orders preview also retains an explicitly labeled instant-settlement shortcut. Numeric sizes and capacity remain configurable balance inputs.

**Done when:** Capture alone earns no cash; successful downlink earns eligible revenue once; deleting undelivered imagery prevents its settlement; successful capture still resets VAM; failed capture does not create saleable imagery or reset VAM. Display captured value potential, stored imagery, transfer progress, lost imagery, and realized revenue distinctly. Prototype behavior meets this lifecycle.

**Open choices:** Final category rates/cadences, capacity and image-size balance, and future archive/resale systems.

**Dependencies:** SIM-01, CELL-02 calculations, OPS-03 contacts, and OPS-01A transfer behavior. BIZ-01 later reports settlement events without crediting them again.

### CELL-04 — Plan and schedule automatic cell collections

**Status:** Split into CELL-04A (capture execution), CELL-04B (baseline scheduler), and CELL-04C (scheduler improvements). This umbrella retains the agreed direction and existing references.

**Agreed behavior:** Combine geometric access, time feasibility, and category priority. Keep the current and next collection committed. Optimize within short two-minute segments to bound combinations, then extend or revise tentative segments to build a TEL covering all operations through the next contact. Each segment must fit the preceding cell's actual or planned completion state, and revisions must preserve the retained continuation. The two-minute search window does not limit TEL duration. Upload changes only during an available ground-station contact; execute the onboard TEL between contacts and enter Standby when it is exhausted.

### CELL-04A — Execute feasible whole-cell captures

**Status:** Partial — authored TEL capture execution uses shared feasibility, approved command-boundary completion/failure behavior, and CELL-02A image creation. Physical limits and continuous access geometry remain open.

**Work:** Define the minimum access, pointing, illumination, slew, and collection-duration rules. Execute authored TEL commands through explicit slew, collection, success/failure, and completion states. Use one set of feasibility calculations for future planning and actual execution. Connect successful completion to CELL-02A image creation and recovery, with no capture-time cash credit.

**Done when:** A valid uploaded command completes a whole-cell capture exactly once; an impossible or failed capture creates no saleable imagery and does not reset VAM; completion and failure reasons are visible. Successive commands account for the preceding collection's completion time and pointing state.

**Implemented prototype:** Orders can append selected cells to a ground TEL draft. The draft forecasts the next available contact, then sequences commands using the same access, slew, and duration evaluator used at execution. Uploaded commands run through the shared runtime; success creates one CELL-02A image and resets recovery without cash, while access/timing failure records a reason and creates no image or recovery reset. Successful and failed outcomes are visible in ground-control status. The sample uses clearly labeled proposed settings of 25° maximum off-nadir, 45-second collection, and illumination ignored; these are not gameplay approvals. Multi-command pointing state advances from each preceding target.

**Shared feasibility foundation:** `src/simulation/cellCapture.ts` evaluates cell-center look geometry at collection start and completion, computes retarget duration with the spacecraft's shared slew capability, optionally checks target sunlight, and returns timing, angles, ending pointing, and a failure reason. Planning and execution call this same function. Weather, power, and storage remain unconstrained for this slice.

**Remaining open choices:** Final whole-cell access geometry and whether a cell-center approximation is sufficient; pointing limits; whether sunlight is required; collection duration and physical interruption sources; and approved scenario values. The endpoint checks do not prove continuous access throughout a collection.

**Dependencies:** SIM-01, OPS-03 command execution, FLEET-02A slew capability, and the initial CELL-02A image lifecycle. Use explicitly labeled clear-weather and unconstrained-power/storage scenarios for this isolated slice; real limits arrive in OPS-01A/B and CLOUD-01.

### CELL-04B — Build a baseline schedule through the next contact

**Status:** Completed for the updated prototype baseline on 2026-10-17. Automatic planning is enabled for all spacecraft when market data is ready and for spacecraft launched later. Refresh follows command/capture outcomes, player priority edits, and 120-second simulation-time boundaries. Contact uploads preserve active and next-capture work and replace the tentative suffix. When fewer than two future contacts are forecast within 48 hours, the existing plan is retained. See [Gameplay](GAMEPLAY.md#cell-04b-automatic-continuation--approved-prototype-baseline) and [Technical Strategy](TECHNICAL_STRATEGY.md).

**Work:** Build a greedy feasible schedule from reachable cell opportunities and player category priorities. Advance through two-minute segments until the next contact is covered; use each segment's predecessor state and projected VAM resets. Preserve the current and locked next collection and keep a feasible tentative continuation. Send the resulting ground plan through OPS-03 upload handling. Show why the next target was selected and why relevant alternatives were skipped.

**Done when:** One spacecraft receives a generated TEL at contact and repeatedly executes feasible work until the next contact. Ground priority changes cannot silently change the onboard TEL. Segment transitions remain feasible, and planned idle periods have an explicit reason. The planner works with the same feasibility rules used by execution.

**Remaining:** Richer skipped-candidate explanations and final access/collection/balance rules remain open. CELL-04C bounded search is implemented; current 60-second candidate sampling, two-minute segments, and clear-weather capture settings are prototype defaults.

**Implemented prototype:** The operations loop forecasts the next two distinct available contacts and automatically builds a ground-side plan from the first to the second for each spacecraft. It searches two-minute segments, samples candidate opportunities every 60 seconds, scores available priority at projected completion time, and carries planned VAM resets and pointing forward between captures. It uses CELL-04A's shared feasibility function and the current player category priorities. Ties resolve by higher priority, earlier start, then lower cell ID. When a segment has no feasible positive-priority target, an explicit idle TEL command records why. The plan remains ground-side until OPS-03 uploads it at an available contact; uploaded commands are unchanged by later priority edits. Orders remains the place to select a cell and optionally add an individual capture target.

**Automatic continuation:** The operations loop refreshes on action/capture completion, player priority changes, and each 120-second simulation-time boundary. At upload, active work and the next capture (including its active wait) remain committed while the later suffix is replaced. Successive contact cycles are verified with one large advance and equivalent partitioned advances. Segment start/advance behavior, sample interval, tie-breaking, and no-target idle behavior are prototype choices, not final balance decisions. Access geometry and collection settings remain provisional under CELL-04A.

**Approved prototype baseline, updated 2026-10-17:** Automatically initialize planning for every spacecraft when the market is available; spacecraft launched later join automatically. Refresh after action completion/failure, priority input changes, and the two-minute simulation-time boundary. Keep the active and next capture locked while revising only the later suffix. Contact-entry synchronization remains one upload opportunity; later revisions wait until a later contact. Keep the existing plan when the forecast has no second contact. If a locked target becomes infeasible, report the execution failure and then refresh; never silently substitute it. Final access and balance decisions remain open. Keep greedy search and sample settings; beam search and final balance are not prerequisites.

**Acceptance:** Verified successive contact uploads after automatic initialization; priority and simulation-time refreshes; retention when no future contact pair is forecast; active/next capture preservation during suffix replacement; identical results for large and partitioned time advances; and FLEET-02A throughput sensitivity at 0.1 versus 10 degrees/second (1 versus 6 captures in the fixed 120-second sequence).

**Dependencies:** CELL-04A and OPS-03. Final market balance, cloud simulation, additional orbit classes, and beam search are not prerequisites. Later resource/weather tasks must extend both planning inputs and execution outcomes.

### CELL-04C — Improve tentative schedules with bounded search

**Status:** Completed 2026-10-15 — bounded search now improves tentative schedules when its full continuation beats the greedy fallback.

**Implemented:** A width-6 beam draws from a 16-cell segment pool, examines up to 8 feasible candidates per partial path, and allows 48 extensions per two-minute segment. It reuses geometry, slew, market, OPS-01B power, and CLOUD-01 forecast checks, and retains greedy when the complete searched continuation does not score higher. The [implementation guide](CELL_04C_DESIGN.md) records limits, fallback behavior, and checks.

**Done when:** Search stays within its documented budget, preserves a feasible fallback, and never substitutes a lower-scoring plan under the same inputs and scoring rules. Revised segments remain compatible with preceding and retained following commands. Explain meaningful changes to the chosen plan.

**Verification:** A fixture shows a two-capture plan beating a one-capture greedy plan; a dense fixture reaches the extension cap; existing automatic contact, locked-prefix, and time-partition tests pass. Meaningful next-target changes appear in the ground-plan event. The limits may be tuned after profiling; coordinated fleet scheduling is separate later work.

**Dependencies:** CELL-04B. Nominal search improvement can be developed independently of later resource/weather features; their integration uses their agreed rules. This task does not block the first complete contact/capture/downlink cycle.

### CELL-03 — Show the cell market in Orders

**Status:** Partial — geographic visualization, CELL-03A/B readouts, and maximum/current priority, current dollar value, scheduled-cell, and active-imaging map prototypes are implemented. Value-aware table tools and focused map behavior review remain.
**Implemented:** Toggleable imagery tiles for eligibility and fourteen sourced geographic datasets, plus a mapped oil pipeline route overlay, cell selection on the globe, search, filters, sorting, pagination, and details in Orders. A read-only sample market price/cadence table, editable priority rates, numeric payout columns, selected-cell category calculations, and manual collection/recovery preview are visible. No globe entity is created for each cell.

**Agreed:** The Orders tab presents the cell market, with toggleable globe layers for category exposure, calculated cell value, or repeat-purchase/freshness state once defined. The grid has about 1.04 million cells before land masking; the renderer must not create one globe entity per cell.

**Agreed future UI requirement (2026-10-06):** The Cell table should eventually support sorting and filtering by calculated dollar value, maximum priority, and current/available priority, in addition to its existing geographic-attribute sorting and filtering. Cells on the globe should have selectable color modes that show dollar value, maximum priority, or current/available priority. “Maximum priority” is the sum of category priority points at VAM 1; “current priority” is the calculated available priority after each category's VAM is applied.

**Work:** Add value-aware table sorting/filtering; review category fill and Planning outlines against shared simulation state, including paused changes, spacecraft selection, switching management tabs, pending versus uploaded plans, and active capture transitions. Freshness coloring remains a separate future layer. Explicitly labeled sample inputs are sufficient; final category review and TUNE-01 balance are separate work.

**Done when:** The view and globe map reflect the same simulation state, support cell selection, expose sorting/filtering for calculated value and priority totals, and independently show one priority category as fill and operational planning as outlines.

**Map implementation:** Land Categories selects any category that contributes to priority and colors each cell by that category's current available-priority contribution with a translucent yellow-to-teal fill. Coastal cells are included as a proposed binary-priority category. The separate Planning dropdown controls orange scheduled-cell outlines or the active imaging target/line; it does not replace fill. Both controls work independently and overlays refresh across tabs. See the [visualization design](CELL_VISUALIZATION_DESIGN.md). Production build passes; numeric table filters and palette tuning remain open.

**Remaining, in order:** Review category fill and planning outlines during normal revenue play; specify and add numeric value/priority sorting and filtering; consider freshness coloring separately. Geographic display conventions and source caveats remain in [Cell grid data](CELL_DATA.md).

### FLEET-03 — Add dynamic orbital maneuvers and orbit-model support

**Status:** Design drafted from the user's direction; see the [orbit maneuver design](FLEET_03_ORBIT_MANEUVER_DESIGN.md). This expands the original orbit-class task to include maneuvers that change orbital state over simulation time.
**Agreed:** Orbit definitions and propagation are per spacecraft. Players may schedule altitude/inclination changes and receive a fuel and elapsed-time estimate before submitting. Automated collision-avoidance and maintenance burns consume fuel and are visible with their cause and outcome. Propellant mass is the preferred fuel representation, using simple configurable spacecraft/engine values. For the prototype, maintenance may deduct a small amount of fuel at a regular simulation-time interval, and each spacecraft may have a small once-per-game-day COLA chance. These rates and costs remain tunable.

**Proposed slices:** (1) maneuver-aware orbit state and deterministic propagation, (2) player altitude/inclination planning with fuel preview and transfer time, (3) regular-interval maintenance fuel use, and (4) once-per-day seeded COLA checks that create clearly labeled scenario events. Reuse one propellant-mass and maneuver model for player and automatic burns.

**Done when:** Player changes preserve continuous position across maneuver phases, show fuel cost and estimated arrival time before submission, and update contact/capture/eclipse/power projections. Automatic burns record why they occurred, when they ran, and fuel used. All orbit and maneuver rules stay independent of Cesium and UI rendering.

**Open:** Target orbit range and starter propulsion values; maneuver upload and conflict rules; maintenance interval and fuel deduction; COLA daily chance and maneuver cost; whether a public conjunction source is useful later; additional orbit classes and propagation accuracy.

**Dependencies:** Per-spacecraft fleet definitions and shared world snapshots. BIZ-01/BIZ-02 are not prerequisites for a configured prototype fuel resource.

## Fleet, operations, and company systems

### FLEET-02 — Add slew speed and future-launch upgrades

**Status:** Split into FLEET-02A (Layer 2 capability) and FLEET-02B (Layer 3 purchasing). Existing references to FLEET-02 cover both.

### FLEET-02A — Model spacecraft slew capability

**Status:** Partial — CELL-04A and CELL-04B consume shared feasibility, including the retarget calculation. A fixed 120-second feasibility sequence verifies that changing slew rate from 0.1 to 10 degrees/second changes completed captures from 1 to 6; final capability/pointing choices remain open.
**Agreed:** Slew speed is a per-spacecraft capability and affects the time needed to retarget between cells.

**Work:** Add explicit slew capability to spacecraft definitions and a shared retarget-time calculation for planning and execution. Keep scenario values configurable.

**Implemented foundation:** `SatelliteDefinition.slew` carries configured slew rate in degrees per second and settling time in seconds. `calculateRetargetDurationSeconds` computes great-circle angular separation between two pointing vectors, divides by rate, and adds settling time for a non-zero retarget. Asteria-1 currently uses clearly labeled scenario placeholders of 1 degree/second and 2 seconds; these are not approved gameplay balance. The helper is independent of rendering and is the shared calculation CELL-04A/B should consume.

**Done when:** Different configured slew capabilities produce different feasible transitions and opportunity throughput, and CELL-04A/B use the same retarget-time calculation.

**Open choices:** Approve or revise the prototype units and initial values, confirm great-circle pointing separation versus an axis-constrained model, tune settling time, and define how pointing limits interact with slew capability. CELL-04A/B must use the shared helper and demonstrate effects on feasible opportunities before this task is fully complete.

**Dependencies:** Existing per-spacecraft definitions and world geometry. Purchasing and launches are not prerequisites.

### FLEET-02B — Purchase slew upgrades for future launches

**Status:** Implemented prototype 2026-10-16 — TypeScript and production build pass. Focused behavioral verification remains pending. The [Layer 3 plan](LAYER_3_PLAN.md#fleet-02b-design-brief) records the approved Enhanced slew option for new spacecraft: +$5M per equipped spacecraft, 2 degrees/second, and 2 seconds settling time. Values are configurable; further hardware-detail design is deferred in favor of reaching playtesting.

**Agreed:** Installed hardware and its designed capabilities are fixed after launch. Upgrades equip new spacecraft and never retrofit an in-orbit asset. The first planned slice covers one slew improvement; a wider selection of new-spacecraft upgrades is later work.

**Implemented:** Added a domain-owned package catalog and purchase command; the launch form offers Standard and Enhanced slew, quotes the full price and remaining cash, and records base, upgrade, and launch line items in one capital entry. Each launched spacecraft stores its selected equipment identity and slew capability; spacecraft details show the installed option. Existing spacecraft retain their launched specification. Values live in `src/simulation/spacecraftCatalog.ts` for tuning.

**Done when:** Procurement validates affordability, the selected new spacecraft receives the purchased capability, and all existing spacecraft specifications remain unchanged.

**Later tuning:** The surcharge, slew rate, and settling time are approved starter inputs, with standard subsystem settings/daily cost retained. Final balance can be adjusted after playtesting. BIZ-02's behavioral review remains pending and is carried into the implementation handoff; broader upgrade variety is deferred.

**Dependencies:** FLEET-02A, BIZ-01 financial accounting, and BIZ-02 procurement.

### OPS-01 — Model onboard storage, power, and downlink operations

**Status:** Split into OPS-01A (storage/downlink) and OPS-01B (power). Existing references to OPS-01 cover both.

### OPS-01A — Retain, delete, and downlink imagery

**Status:** Partial — prototype enforces approved retention, FIFO transfer, partial-byte persistence, full-delivery settlement, and removal from active storage. Numeric capacity and image sizes remain open for balance.

**Agreed:** Delete imagery under storage pressure using retention priority, defaulting to cell priority. Imagery deleted before delivery earns no revenue. Revenue is realized only on downlink. TEL upload and imagery downlink may happen simultaneously during an available ground-station contact.

**Work:** Define storage capacity and image sizes, implement priority-based deletion, and integrate transfer progress over actual available contact time and station bandwidth. Use CELL-02A image identity and settlement rather than creating another cash-credit path. Expose inventory, deleted imagery, transfer progress, and realized revenue. Supply relevant capacity/retention projections to the scheduler without turning a full store into an automatic collection stop.

**Done when:** Storage remains within its defined capacity, deletion follows priority, transfer stops outside contact or when a station is down, and delivered imagery settles exactly once. Crossing contact boundaries in a large time advance transfers only the eligible amount. The initial end-to-end loop can upload a plan, collect, retain/delete, downlink, and earn revenue.

**Open choices:** Capacity and image sizes; future retention overrides; scheduler projections of storage outcomes; and whether future planning should forecast the approved multi-spacecraft antenna queue.

**Dependencies:** SIM-01, OPS-03 contacts, and the initial CELL-02A image/settlement contract. CELL-04A/B provide live collection for the end-to-end milestone; stored-image fixtures can exercise transfer independently.

**Implemented prototype details:** `ImageryOperations` uses 100 MiB per spacecraft and 10 MiB images as configurable scenario placeholders. It evicts the lowest captured cell-priority score first (oldest capture, then image ID for ties), transfers FIFO, uses the fastest allocated station link when contact windows overlap, persists partial bytes across contacts, and settles the capture-time quote only after full transfer. `GroundOperations` allocates one antenna per station to a single spacecraft, keeps the earliest pass, and hands off to the next waiting spacecraft still in view; ties use spacecraft ID order. Capacity/image sizes remain open for balance.

**Remaining:** Feed projected storage/retention outcomes into scheduler scoring. The current scheduler does not reduce capture choices based on predicted storage pressure; runtime deletion preserves the agreed rule that a full store does not automatically stop collection.

### OPS-01B — Model spacecraft power

**Status:** Completed 2026-10-14 — prototype implementation, deterministic acceptance checks, and local Spacecraft GUI walkthrough complete. Final power balance remains open.

**Agreed:** Power generation, storage, consumption, minimum-charge admission, fixed failed-command slots, protection for current/next captures, downlink pause/resume, depletion/restart, contact-entry upload eligibility, and synthetic starter values are defined in [Gameplay](GAMEPLAY.md#spacecraft-power--agreed-prototype-rules-ops-01b).

**Implemented slice:** `src/simulation/power.ts` holds deterministic charge, eclipse-generation, load integration, capture admission, radio gating, depletion/restart events, and shared projection. `OperationalLoop` integrates these boundaries with image delivery and committed capture work. The greedy scheduler rejects captures that project below reserve and carries charge across idle/capture intervals. Spacecraft reports Wh, charge percentage, power state, generation, and load. Contact forecasts now merge overlapping and touching station windows into episodes.

**Verified:** Sun/eclipse energy and event boundaries; charge/spill/depletion accounting; capture minimum-charge admission and fixed rejection slots; queued work timing; contact-entry upload gating; current/next capture energy protection; capture/downlink concurrency; reserve pause/restart; partial-byte preservation; final-byte delivery cutoff; automatic planner reserve filtering and contact-episode union; large/irregular step consistency; reset; and the visible Spacecraft readout. See the [verification guide](OPS_01B_POWER_DESIGN.md) for exact suite results.

**Done when:** The documented prototype policies are implemented and verified; sunlight/eclipses and activities change energy under documented rules, charge stays bounded, and insufficient power produces an explicit outcome consistently across playback speeds. Complete for the prototype.

**Open choices:** Final balance, panel orientation, aging, faults, thermal effects, and future capture interruption sources remain deferred; they do not block the prototype.

**Dependencies:** Existing SIM-01 runtime, OPS-03 contacts, CELL-04A/B capture/planning, OPS-01A transfer, and world eclipse calculations. The prototype connects these systems through the shared loop; remaining checks are bounded by the guide.

**Next deliverable:** None for the agreed prototype slice. Final balance and battery aging, faults, thermal effects, and panel orientation remain later tuning or subsystem work.

### CLOUD-01 — Model cloud conditions, forecasts, and failed captures

**Status:** Partial — approved deterministic cloud behavior, failed-capture outcomes, and forecast-weighted scheduling are implemented. A public NOAA data source is selected; the processed baseline file and source manifest remain. Per the user's request, data acquisition is deferred until they are back on the network.

**Agreed:** Actual cloud conditions can cause capture failure. Forecasts may help scheduling but do not reveal perfect weather knowledge. Failed captures create no saleable imagery and do not reset VAM. Use NOAA/NCEI's public ISCCP-H HGM Basic monthly mean cloud amount, averaged by calendar month for 1984–2013. Its 1° equal-angle source grid matches the weather grid, so no spatial regridding is needed. See the [public NCEI data page](https://www.ncei.noaa.gov/products/international-satellite-cloud-climatology) and [direct HGM download directory](https://www.ncei.noaa.gov/data/international-satellite-cloud-climate-project-isccp-h-series-data/access/isccp-basic/hgm/); registration is optional. For each hourly time bucket, generate deterministic keyed 1° cover around its seasonal baseline, plus the agreed ¼° child variation. Store whole percentage points; clamp to 0–100.

**Agreed behavior:** Use an explicit UTC epoch (2026-01-01), integer percentage cover, a 5° shared six-hour disturbance plus 1° hourly and ¼° child variation, collection-weighted usability at <=60%, and a separate coarse lead-dependent forecast. Weather failure consumes command time and admitted power without creating an image or resetting VAM. The planner scales projected priority by four coarse forecast weights. See [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior) and the [CLOUD-01 design guide](CLOUD_01_DESIGN.md).

**Implemented:** `src/simulation/weather.ts` supplies keyed actual cover, collection interval averages, and a separate hourly forecast; `OperationalLoop` evaluates weather at capture completion; `cellScheduler` uses forecast-weighted priority. `tests/weather.test.mjs` and operations coverage exercise replay, hour boundaries, forecasts, and failed-capture costs.

**Remaining:** Download the public HGM Basic NetCDF, average `cldamt` over 1984–2013 by calendar month, reorder the source's latitude/longitude axes for the runtime table, and write the 777,600-byte Uint8 baseline with a version/citation/checksum manifest. Then replace the app's temporary flat 50% baseline and verify known cells and month indexing. No API key is required.

**Done when:** The same scenario and simulation time produce consistent conditions across playback speeds and replanning; forecasts can be wrong; an unsuccessful capture creates no image or revenue and leaves recovery unchanged. Scheduling can use forecasts without accessing hidden actual conditions.

**Open choices:** None for the approved prototype behavior. Forecast display remains optional. Record the NOAA/NCEI dataset citation and source metadata with the derived baseline; the source page says registration is optional and provides direct download/THREDDS access.

**Dependencies:** SIM-01, CELL-04A/B, and CELL-02A. Integrate resource costs with OPS-01A/B. A live weather service and cloud graphics are not prerequisites.

### OPS-02 — Add health, degradation, and anomaly response

**Status:** Design drafted 2026-10-17; review pending, not implemented. The [station outage design](OPS_02_STATION_OUTAGE_DESIGN.md) specifies a proposed 30-minute outage, free normal recovery or a $100 two-minute expedited repair requiring cash, and explicit recovery/upload behavior. These terms remain proposals until accepted.
**Agreed:** Satellites can degrade or encounter anomalies; players should see understandable symptoms and make consequential intervention choices.

**Work:** Review the bounded station scenario and its upload-latch extension; then implement domain availability, interrupted contact/transfer behavior, repair accounting, and Summary/station explanations using the design's acceptance handoff. Broader health/degradation design follows separately.

**Done when:** At least one anomaly has a legible cause/effect and player response path; the event changes simulation capability or risk and is reflected in fleet status.

**Open choices:** Accept or revise the proposed repair terms and recovery/upload policy. Random failure rates, hidden diagnosis, continuous degradation, and permanent losses are deferred.

**Roadmap scope:** Layer 3 includes ground-station outages and resulting missed contacts as well as spacecraft faults. Design one bounded failure/response scenario first; do not silently fold dynamic outages into the completed static-contact OPS-03 slice. Depend on the nominal subsystem being affected and define how its failure changes execution, planning, and player-visible explanations.

### BIZ-01 — Connect imagery collection to company finances

**Status:** Completed 2026-10-15 — shared company ledger, downlink revenue, recurring spacecraft/station charges, negative-cash warning, and Finance & Growth readout implemented. See the [BIZ-01 finance design](BIZ_01_FINANCE_DESIGN.md).
**Agreed:** Revenue is realized only when imagery is downlinked. CELL-02A and OPS-01A own image identity, delivery, and settlement; BIZ-01 reports those events and must not credit them again. Capture alone and deletion of undelivered imagery produce no cash. Charge both spacecraft and ground stations recurring operating costs. Cash may go negative; warn the player but do not stop routine operations or settlement. A separate archive resale market is outside the current model. Contracts and satisfaction remain optional later layers.

**Implemented:** `CompanyFinance` owns cash and an append-only ledger in integer cents. It receives the existing exactly-once downlink settlement, and posts $100 per spacecraft-day and $25 per ground-station-day at simulation-day boundaries. The spacecraft charge represents general mission operations. Finance & Growth shows whole-run cash, realized revenue, costs, net operating result, and ledger history. Negative cash displays a warning while operations and settlement continue. BIZ-02 now sets the app's opening cash to -$50,000.

**Verified:** Settlement idempotency, cost boundaries, negative balance, reset, and large/irregular time-step consistency are covered in `tests/companyFinance.test.mjs`; imagery settlement integration is covered in `tests/operationalLoop.test.mjs` and `tests/cellMarketState.test.mjs`.

**Later extensions:** Contracts, deadlines, penalties, customer retention, and satisfaction remain optional future systems; starting funds and spacecraft procurement are implemented under BIZ-02.

### BIZ-02 — Add Finance & Growth view and satellite procurement

**Status:** Implemented prototype — signed -$50,000 opening cash, affordability-checked procurement accounting, capital reporting, editable pre-launch orbit selection, immediate launch, live fleet/globe updates, shared antenna allocation, and reset are implemented. The production build passes; behavioral verification remains pending. See the [BIZ-02 guide](BIZ_02_GROWTH_DESIGN.md).
**Agreed:** Money constrains hardware, launches, operations, and business growth. Finance & Growth is a management tab.

**Implemented work:** Finance & Growth shows company cash, income, costs, affordability, and Standard/Enhanced slew spacecraft purchases from explicit company/fleet state. Each spacecraft snapshots its purchased slew capability; see FLEET-02B.

**Done when:** Every displayed financial figure is derived from company state and ledger entries; purchases validate affordability atomically and change fleet capacity; income reconciles from downlink settlement and spending reconciles to purchase/launch entries.

**Agreed integration behavior:** The $100 spacecraft-day cost is a general mission operations charge; new spacecraft join at the first day boundary after launch with no proration. The player chooses orbit altitude, inclination, ascending node, and phase before launch. Each station antenna serves one spacecraft at a time; earliest pass start holds it until pass end, then it hands off to the earliest waiting spacecraft still in view, with spacecraft-ID ties. These are recorded in the [BIZ-02 guide](BIZ_02_GROWTH_DESIGN.md) and [Gameplay](GAMEPLAY.md).

**Original BIZ-02 first slice:** Offer the standard spacecraft package for immediate launch after player-selected altitude, inclination, ascending node, and phase. FLEET-02B now extends procurement with the approved slew choice for new spacecraft. Use -$50,000 starting cash, $50,000,000 base spacecraft cost, and $0 launch cost as configurable prototype values. Require sufficient cash for a purchase; the initial fleet must earn revenue to reach the purchase price. Show costs and remaining cash, then add a stable-ID spacecraft. Defer production queues, financing, ground-station construction, and unmodeled hardware.

**Dependencies:** BIZ-01 company ledger and FLEET-02A per-spacecraft capability. FLEET-02B extends the implemented procurement flow; neither additional orbit classes nor FLEET-03 maneuvers are prerequisites. See the [reviewed Layer 3 sequence](LAYER_3_PLAN.md).

## Layer 4 — Tuning and refinement

### TUNE-01 — Tune playable attributes and revenue

**Status:** Needs design — a proposed breakdown of the roadmap's tuning work.

**Work:** Review CELL-01's candidate categories/overlap and CELL-02's prices/cadences alongside capture, slew, storage, downlink, and power settings. Choose representative scenarios and desired operating tradeoffs before changing values. Design market trends separately under CELL-02 before tuning them. Keep scenario inputs configurable and distinguish potential payout, realized income, and deletion losses.

**Done when:** Selected scenarios have documented before/after outcomes, approved values are recorded in the owning brief/configuration, and tuning preserves revenue/priority separation and exactly-once settlement. Unapproved values remain labeled provisional.

**Open choices:** Intended difficulty, target income/cost progression, representative scenarios, and which attributes to tune first.

**Dependencies:** The mechanics being tuned must be implemented and verified; company profitability tuning additionally depends on BIZ-01/BIZ-02. Final balance does not block the earlier sample operational loop.

### UI-04 — Refine operational management views

**Status:** Needs design — a proposed breakdown of the roadmap's GUI refinement.

**Work:** Review the working loop for unclear state, explanations, navigation, table readability, and accessibility. Select a bounded set of observed usability issues and acceptance criteria before implementation. Reuse CELL-03 for value inspection tools and UI-03 for station identifiers rather than duplicating those tasks.

**Done when:** The selected issues have verified fixes, and players can distinguish ground plans from onboard commands and potential imagery value from realized revenue in the affected views.

**Dependencies:** Implemented systems and a review of their actual interface. Prioritize operational understanding over decorative graphics.

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

**Playtesting priority (2026-10-16):** The user wants to begin trying the game soon and accepts configurable prototype values for additional spacecraft. The existing one-spacecraft capture/downlink/revenue loop is available now; see the [playtest steps](../README.md#try-the-single-spacecraft-revenue-loop). FLEET-02B and OPS-02 are feature work, not prerequisites for that first session. Use play observations to identify immediate usability and pacing fixes.

OPS-04 and the approved CELL-04B automatic-continuation slice completed on 2026-10-14. The approved CELL-04A, OPS-03, OPS-01A, and CELL-02A prototype policies are recorded in [Gameplay](GAMEPLAY.md#agreed-operational-closure-policies-approved-2026-10-14). A request to take the next step selects the first incomplete item below.

| Order | Tasks | Next deliverable | Model suggestion |
| --- | --- | --- | --- |
| 1 | **FLEET-02B / BIZ-02 — Behavioral review pending**, plus **CELL-03 map review** | Exercise purchase, reset, shared antennas, installed slew capability, and map updates during the normal revenue loop. Use findings to select immediate playability fixes. | **Review and implementation:** gpt-6.1-sol, medium or high reasoning should be sufficient for these bounded checks. |
| Next feature | **OPS-02 — Design drafted; review pending** | Review the [outage proposal](OPS_02_STATION_OUTAGE_DESIGN.md), then implement one event/response/recovery journey. The 2026-10-17 design request advanced this brief without marking earlier behavioral checks complete. | **OPS-02 design:** gpt-6-astra, high or xhigh reasoning, if the outage choices span finance, contacts, and simulation timing. |
| Done | **BIZ-02 — Implemented prototype** | Pre-launch orbit choice, immediate spacecraft purchase, capital accounting, live fleet updates, and exclusive antenna handoff are in place; production build passes. Behavioral review remains pending. | gpt-6.1-sol, medium reasoning should be sufficient for the bounded behavior review. |
| 2 | **TUNE-01**, **UI-04 — Needs design** | Layer 4: evaluate operating tradeoffs and revenue balance, then refine the management experience using observed issues. | gpt-6-astra, high reasoning, if balancing decisions span several interacting systems; otherwise gpt-6.1-sol, medium/high. |
| Later | **CLOUD-01 — Partial; data acquisition deferred** | When back on the network, download and validate the public climatology asset and replace the temporary flat baseline. | gpt-6.1-sol, medium reasoning should be sufficient for the data preparation; use a stronger model only if source interpretation or integration raises design questions. |

Model suggestions are optional guidance, not a requirement to switch models. Use the strongest reasoning model for open, cross-system design decisions; a workhorse model is enough for bounded implementation and verification.

**Implemented foundation, not a pending queue:** SIM-01, OPS-03's static-contact/authored-TEL slice, CELL-03A/B, CELL-02A, CELL-04B automatic continuation, CELL-04C bounded search, OPS-01A integration, and OPS-01B simplified power are present. The prototype supports successive contact cycles with one spacecraft, clear weather, capacity-driven deletion, partial transfers, reserve-aware downlink, and full-delivery settlement. OPS-04, CELL-04B/C, and OPS-01B have verification coverage; market/access/power balance settings are not final balance decisions.

**Independent work:** UI-03 is ready; CELL-03's numeric sorting/filtering can proceed once its controls are specified, using labeled sample rates. Its new map views are already implemented as prototypes. CELL-01 category review and CELL-02 market-trend design can proceed separately. FLEET-03's orbit maneuver design is drafted; implementation can be selected after review. PLATFORM-01 and PLATFORM-02 remain separately selectable according to release needs.
