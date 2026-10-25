# Technical strategy

This document records implementation constraints and architecture direction. The first world-model prototype now provisionally uses TypeScript, Vite, and CesiumJS; these are prototype choices, not final product commitments.

## Current constraints

- **Target:** A browser-based, single-player game.
- **Hosting target:** GitHub Pages, which serves static site output and does not run the game’s server-side application logic.
- **Initial emphasis:** Simulation mechanics and status views. The orbital display can be a simple visual layer.
- **Initial persistence assumption:** Local browser save data is sufficient for a prototype; no account or shared cloud save is currently required.
- **Provisional prototype stack:** TypeScript for application code, Vite for the static client build, and CesiumJS for the 3D globe.
- **Provisional Earth display:** Cesium's bundled Natural Earth II imagery is used without a Cesium ion token. The top-bar Basemap toggle can hide the imagery and show Natural Earth land-border outlines over a dark globe; the plain globe color remains the fallback if imagery fails to load.

## Architecture direction

- Keep simulation state and rules separate from UI rendering. The simulation should be advanceable and inspectable without depending on a screen component.
- Let the Cesium-independent simulation runtime own elapsed time and per-spacecraft timed actions. Advance directly between known action boundaries; process each start/completion event once, then set the requested final simulation time. Pause and speed controls choose whether and how far to advance the same runtime.
- Represent satellites, data, customer work, finances, and anomalies as explicit domain state rather than values embedded in UI components.
- Keep company cash and its append-only financial ledger in a renderer-independent simulation module. Adapt the existing exactly-once image settlement event into that ledger as the sole revenue entry; do not credit cash independently from both imagery and finance code. Process recurring spacecraft and station costs at exact daily simulation-time boundaries so results do not depend on step size. See the [BIZ-01 design](BIZ_01_FINANCE_DESIGN.md).
- Fleet growth uses a shared lifecycle boundary: an affordability-checked purchase records itemized capital spending, registers a stable-ID spacecraft, and refreshes the views without reconstructing the running simulation. Keep capital spending separate from recurring operating costs. Support signed opening balances without allowing negative revenue or prices. Preserve existing spacecraft state on registration and remove purchased assets on reset. The Finance & Growth form lets the player select altitude, inclination, ascending node, and phase at launch; convert the selected launch phase to the epoch value used by the propagator. See the [BIZ-02 guide](BIZ_02_GROWTH_DESIGN.md).
- Keep the first orbital display a view of simulation state. It may use simplified orbit positions; it does not need to implement high-precision astrodynamics.
- Build the app as a static client-side bundle suitable for GitHub Pages. Avoid adding a backend unless a future requirement needs hosted persistence, user accounts, or shared state.
- If local saves are added, version the save format so later builds can detect or migrate older data.

## Management interface

### Agreed direction

- Preserve the macro layout with the globe/visualization at the top and the active data view below it.
- When the data view is fully expanded, keep the orbit overview compact within the data header so it does not cover the view title or context.
- The data view uses tabs for **Summary**, **Spacecraft**, **Schedule**, **Orders**, **Ground Stations**, and **Finance & Growth**. Summary is the default and replaces the current single readout as the overview.
- Summary combines fleet-wide state, company information, operational exceptions, and key indicators that need attention.
- Prefer tables for lists and comparisons, especially spacecraft, orders, and ground stations. Selecting a row should connect that record to its object or location on the globe.
- The Orders view includes a searchable, filterable, sortable cell-market list and cell details. Its map controls show selected-category priority fills, maximum potential dollar value dots, total current-priority dots, scheduled cells, and active imaging.
- The Spacecraft view presents one row per configured satellite, current modeled position and state, and a detail view for the selected spacecraft. Selection highlights that spacecraft's globe marker and orbit.
- The Schedule view groups each spacecraft's current onboard TEL in a collapsible table. List every scheduled cell capture with current total available priority points, current total available payout, and available priority points from each land-use category. Values are derived from the current market, player priority rates, recovery state, and simulation time; this view does not edit the TEL.

**Implemented information density:** Management tabs use compact spacing and dense tables to keep more information visible. The tab content is the primary vertical scroll area. Configured ground stations fit without an inner table scrollbar and switch to labeled station cards on narrow screens. Schedule tables retain a bounded scroll area with sticky headings.

### Open interface decisions

- Exact columns, summary metrics, sorting defaults, and detail-panel contents for Summary, Spacecraft, Orders, Ground Stations, and Finance & Growth. The Spacecraft prototype uses orbit altitude, subsatellite point, sunlight/eclipse, and antenna link/wait state; its detail view also shows inclination. Other accessibility refinements remain open.
- How selected table rows focus or highlight objects in the globe, and how that interaction works on narrow screens.
- Whether tables should support bulk actions as fleet and order volumes grow.

### Fleet prototype data

- Keep spacecraft as a collection keyed by stable satellite IDs. The current initial fleet contains only Asteria-1, preserving the intended one-spacecraft start; no additional satellite or launch cost is invented for the prototype.
- Calculate a separate world snapshot per spacecraft from the shared simulation clock and surface-object set. Drive each table row, selected detail view, marker, and orbit from that spacecraft's definition and snapshot.
- The selected spacecraft is highlighted with a larger marker, visible label, and brighter orbit path. Health, onboard storage, battery state, camera capability, and cell-market revenue remain absent until their gameplay systems are implemented.

### Ground-station prototype data

- Keep facility operational status separate from a satellite's contact window. A station may be marked available or down independently of any spacecraft.
- Model one antenna per station in the prototype. It serves one spacecraft at a time: earliest pass start holds it until exit, then it hands off to the earliest waiting spacecraft still in view; simultaneous starts use spacecraft ID order. The station view shows owner and queue. Real antenna counts and supported bands remain future design options.
- Treat the satellite's onboard Task Event List (TEL) as the source of executable scheduled work between contacts. Ground planning builds commands covering operation through the next contact by progressing through two-minute optimization segments. Transmit changes only during an available ground-station contact. Keep the proposed ground plan distinct from the version stored onboard so changed priorities or market information do not affect execution before upload. If the TEL is exhausted, the satellite enters Standby until an updated TEL is uploaded. Missing/missed-contact behavior remains open. See [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior).
- Allow TEL uplink and imagery downlink to occur simultaneously. Store uplink and downlink bit rates in Mbps on each station definition; downlink throughput constrains imagery delivery and revenue realization, while uplink speed is not currently expected to materially constrain TEL uploads. Both sample stations use configurable placeholder defaults of 10 Mbps uplink and 100 Mbps downlink; these are not real-site specifications. Downlink rate now drives contact-time transfer progress. Detailed TEL transfer cost/size remains open.
- Revenue is realized only when imagery is downlinked. Model capture, onboard retention, transfer, deletion, and revenue settlement as distinct lifecycle events. Under storage pressure, delete imagery by the approved prototype retention policy in Gameplay; imagery deleted before delivery earns no revenue. Prototype implementation uses captured priority snapshots, oldest-first ties, FIFO transfer, 10 MiB images, 100 MiB capacity, and capture-time value quotes. Capacity and image sizes remain configurable balance choices. See [Gameplay](GAMEPLAY.md#agreed-imagery-retention-and-delivery-2026-10-13-prototype-policies-approved-2026-10-14).
- The sample station statuses are static configuration. Outages, maintenance, and status changes over time have not been modeled.
- Location, facility availability, uplink/downlink rate, and antenna assignment are shown in the station table. Real antenna counts, supported bands, and maintenance state remain future design options.

## Earth coordinates and orbit display

### Agreed direction

- Designers and game content should describe surface locations in familiar latitude/longitude terms, with altitude/height where needed. Coordinate conversion should be an implementation detail.
- The displayed globe stays fixed while satellite markers and their paths move relative to the surface as game time advances.
- Keep satellite altitude to scale in the visualization. Make the satellite marker visible with a glowing dot; an orbit path can be shown optionally. Marker size is a visual choice and does not change simulated position or altitude.
- Show the displayed 3D orbit path as half an orbit ahead and half an orbit behind each satellite's current position. Keep its orbital geometry stable and move it relative to the fixed globe as simulation time advances; it does not change the propagated satellite state.
- Use the current 550 km / 53° orbit as a configurable suggestion. Each launch can set its own altitude, inclination, ascending node, and phase before it enters the fleet.
- Approximate ground-station contact with a constant distance threshold for the prototype. Treat this as a gameplay approximation of visibility; it can later become altitude-dependent or use a more exact line-of-sight/elevation rule.

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
- Each eligible cell has category-specific exposures, expressed in the unit used by that category's price. Its potential value is the sum of current per-category payouts after VAM. Capture creates onboard imagery; revenue is realized only on downlink. Storage and transfer constraints therefore affect earned income. A separate archive market for later resale is outside the current model.
- The candidate category/exposure mapping is implemented in `src/simulation/categoryExposures.ts` and described in [Cell grid data](CELL_DATA.md). It converts urban, cropland, and pasture area into km²; other candidates retain mapped record/polygon counts or MW. This mapping is **Proposed** pending review, and its data measures are not approved market categories or verified real-world prices.
- Geographic attributes such as sensitive ecological areas, borders, and additional energy infrastructure may be considered later; they are not in the current candidate market mapping.
- The Orders tab presents the cell market and offers globe layers for category exposure, calculated gross value, and repeat-purchase/freshness state once that state is defined. Individual customer orders, point targets, and project contracts are not required for this initial economic loop; they may be added later as a separate layer.
- Each satellite has a slew-speed capability. Installed hardware is chosen at launch and immutable afterward. The current code convention is degrees per second plus settling seconds, with great-circle separation between pointing vectors; Asteria-1's Standard 1 degree/second and 2-second settling values remain prototype inputs. The configurable Enhanced option is 2 degrees/second, 2 seconds settling, and +$5M per spacecraft. These approved starters are not final balance. CELL-04A/B share `calculateRetargetDurationSeconds`; independent-axis pointing limits remain open.

### Proposed implementation shape

- Keep the grid, geographic attribute layers, per-cell category exposures, market state, repeat-purchase state, and collection updates in simulation/domain data, separate from Cesium and UI components.
- The complete ¼° grid contains 1,036,800 cells before the land mask. Compact typed arrays or equivalent packed data are expected to keep static attributes and dynamic value state inexpensive. Do not create one globe entity per cell; render a tiled/grid layer and aggregate at display resolution when useful.
- Preprocess sourced geographic datasets into the cell grid or load suitable static datasets; do not query external data services during simulation steps. Record source, version/date, resolution, attribution, and license for each distributed data layer.
- Use one last-collection simulation timestamp per cell. Every category derives VAM from the shared elapsed time and its own cadence. A never-collected cell starts fully available (VAM 1). Successful capture records the image and resets the timestamp without crediting cash; failure does neither. Downlink settlement credits eligible image revenue exactly once. Preserve image identity across capture, transfer, and deletion so retries cannot pay twice and discarded imagery cannot subsequently settle.
- Store geographic attributes and derived category exposures separately from time-varying market rates and dynamic repeat-purchase state. Keep collection events traceable for revenue accounting.
- Keep the category exposure mapping data-driven and independently inspectable without Cesium. Orders now shows the proposed exposure quantities, sample market rates, derived payout, and priority separately.
- **Implemented prototype lifecycle:** `src/simulation/cellMarketState.ts` accepts explicit market values, priority rates, and starting cash; stores one `Float64Array` timestamp per cell; and calculates snapshots on demand. Successful capture creates an identified onboard image, captures its value-potential quote and initial cell-priority score, and resets recovery without changing cash. `src/simulation/imageryOperations.ts` applies a configurable per-spacecraft byte capacity, deletes lowest-priority images on overflow, advances downlink bytes only over active station-contact intervals, and settles completed images exactly once. Partial bytes persist on the image record. The prototype uses approved capture-time quotes and FIFO transfer order; only numeric capacity and image sizes remain open for tuning.
- **Agreed market and priority model:** Keep read-only market prices/cadences and player-set category priority rates distinct. Category exposure units must match price and priority units. VAM is 0 through 10% of cadence, rises linearly to 1 at cadence, then stays at 1: `clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. A never-collected cell starts at VAM 1. Recalculate derived values when time or inputs change. Successful whole-cell capture resets the shared timestamp for all categories without crediting cash. Downlink realizes the quote captured at successful completion using pre-reset VAM. See [Gameplay](GAMEPLAY.md#market-information-cell-revenue-and-scheduling).
- Cell aggregation uses a regular lat/lon index. Its geographic cell area varies with latitude; value layers must have an explicit interpretation (for example per-cell market value) and must not accidentally treat raw feature counts as comparable dollar prices.
- Represent collection as a whole-cell operation. Swath width, scan-strip sequencing, and partial-cell coverage are outside the current model. Whole-cell completion does not imply instantaneous or cost-free collection; timing and resource rules remain open.
- Draw the market as a toggleable cell layer. Cell resolution is agreed at ¼°; color normalization, zoom-level aggregation, and exact rendering representation remain open tuning choices.
- When a satellite collects a cell, a temporary line or compact footprint cue may connect the satellite to the collection area. Do not render image pixels in the initial implementation.

### OPS-04 integration verification

OPS-04 verifies the existing operational loop and fixes defects against its documented prototype rules. Follow the [implementation and verification guide](OPS_04_VERIFICATION.md) for the code map, baseline failures, fixture recipes, scenario matrix, comparisons, and delivery checks.

Keep capture/transfer orchestration in the simulation domain and call that same code from the browser and tests. The current glue in `src/main.ts` must be extracted narrowly so headless tests exercise production behavior. Advance effects chronologically across action/contact boundaries; later captures must not change inventory before earlier eligible transfers have been applied.

Use exact contact fixtures to verify event integration and separate cases with the real predictor to verify contact plumbing and its documented geometry tolerance. Compare business identities, irreversible outcomes, checkpoint state, and causal event order. Transfer-progress record counts and sequence-based diagnostic event IDs may differ with step size; they must not be used as a substitute for checking byte/cash conservation. Keep scenario values explicitly provisional. No new power, weather, pricing, or TEL-replacement policy is approved by this verification work.

The user-approved CELL-04A, OPS-03, OPS-01A, and CELL-02A policies are recorded in [Gameplay](GAMEPLAY.md#agreed-operational-closure-policies-approved-2026-10-14). OPS-03 processes same-time contact edges per spacecraft and uploads once at contact-episode entry; OPS-01A uses the fastest single active station downlink when windows overlap. Existing sample sizes, rates, and access geometry remain configurable prototype inputs.

### OPS-01B technical boundary

The agreed prototype power rules are in [Gameplay](GAMEPLAY.md#spacecraft-power--agreed-prototype-rules-ops-01b). Keep energy state and rate integration in renderer-independent simulation modules. Planning and execution call the same pure feasibility/projection functions for generation, activity load, and reserve checks. Integrate across simulation-time intervals and split at eclipse, activity, and contact edges; do not update power on UI frames or wall-clock timers. The shared operational loop connects contact-limited transfer, capture completion, and battery state chronologically in the browser and deterministic verification.

`src/simulation/power.ts` owns projection, admission, and power state; `OperationalLoop` owns chronological integration; `cellScheduler.ts` uses the same projection for candidate feasibility; the Spacecraft panel exposes the current readout and inhibition reason. The [OPS-01B implementation and verification guide](OPS_01B_POWER_DESIGN.md) records the passing threshold, delivery, depletion/restart, planner alignment, and time-step checks. Energy boundaries share the authoritative clock; there is no second simulation loop. Planner contact forecasts use the same union of overlapping/touching windows as the approved runtime episode rule. Gameplay policy is agreed; final numeric balance and future fault systems remain separate work.

### FLEET-03 dynamic orbit maneuvers

The current circular orbit inputs are immutable and propagated from simulation time. Dynamic burns need a maneuver-aware orbit state with event boundaries for burn start, transfer, and orbit arrival. Keep a single deterministic position/velocity query in the simulation world model so the globe, contacts, capture access, eclipse/power projection, and schedule planner all follow the same changed orbit. Use propellant mass with simple configured spacecraft mass and engine specific impulse, sharing one fuel-cost function between preview and execution. Prototype maintenance deductions can run on regular simulation-time intervals; daily COLA checks should use the seeded simulation RNG. The proposed event and module boundaries are in the [FLEET-03 design](FLEET_03_ORBIT_MANEUVER_DESIGN.md).

### CELL-04B automatic cell scheduler

- Keep schedule search in the simulation layer and make it deterministic from the same simulation time, orbit/access predictions, cell-market snapshot, spacecraft capabilities, and forecast inputs. It should not depend on Cesium rendering or wall-clock frame rate.
- Treat the current collection and the next collection as committed. While collection A executes, keep B locked as the next collection and build or refresh tentative entries C onward after B. When A completes and B starts, promote C to the locked next collection; later entries remain replaceable. Roll the horizon forward so successive windows overlap.
- Use the current collection, slew, and the locked next collection's execution time to compute the follow-on schedule. Have the next target ready before it is needed; do not impose a separate simulated planning delay.
- Use two-minute optimization segments to bound search complexity, independently of the TEL duration through the next contact. Advance a planning cursor through future segments ahead of execution. Each segment starts from its preceding collection's actual or projected completion state, including time, pointing, and applicable resources. Revisions must preserve feasibility with the preceding collection and any retained continuation. Segment advancement/overlap remains open; beginning the first segment after the locked next collection completes is the current proposal.
- Build candidate opportunities from geometric access windows and time feasibility. Include time to slew and to complete the whole-cell collection before the opportunity closes. Exact pointing limits, slew speeds, collection durations, and capability/resource constraints are not defined yet.
- Use bounded search rather than exhaustive permutation of all opportunities. The implemented prototype builds a feasible greedy continuation, expands a limited beam of alternative partial sequences within each segment, and keeps the searched full continuation only when it scores strictly higher than greedy under the same inputs. Automatic refresh rebuilds the tentative suffix after locked work; each segment projects time, pointing, energy, and cell freshness from the previous one. Onboard commands change only upon upload at contact. See the [CELL-04C guide](CELL_04C_DESIGN.md) for limits and checks.
- Score a sequence by total available category priority points projected at each capture completion. Projected successful captures reset each cell's shared collection timestamp for later entries in that sequence. Category priority rates remain the player's strategic controls; do not add a separate emphasis setting or multiply payout into priority.
- Weather uses NOAA/NCEI's public ISCCP-H HGM Basic monthly cloud amount, averaged by calendar month for 2004–2013 (10 complete years). The source is already a global 1° equal-angle grid. Actual cloud and forecast draws are deterministic, hourly, and keyed; a shared coarse six-hour component provides broad persistence. At completion, collection-time average cover decides whether an image exists; a weather failure still consumes its command time and admitted power without resetting VAM. See the approved rules in [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior).
- Keep baseline lookup, actual weather, forecast, and capture evaluation in renderer-independent interfaces. The current implementation uses integer percentages, stateless keyed draws, and simple risk weights. An interim baseline loads the January 2013 NOAA HGM Basic spatial map, repeated across all months; its source citation, checksum, and 14 nearest-neighbor fills are recorded in the manifest. Replace it with the selected 2004–2013 monthly climatology when available. See the [CLOUD-01 design guide](CLOUD_01_DESIGN.md).
- **CELL-04B approved prototype baseline:** Reconsider after each TEL command/capture outcome, after player priority inputs change, and at two-minute simulation-time planning boundaries while automatic scheduling is active. Coalesce same-time triggers; never run planning on renderer frames or wall-clock timers.
- Enable the ground-side planner for every spacecraft when cell-market data becomes available, and for each spacecraft launched afterward. Generate and refresh plans automatically; contact remains the only TEL upload point.
- Preserve the executing command and the next not-yet-started capture, including an active wait that leads to it, while rebuilding only the later tentative suffix from its projected completion state. At each distinct available contact entry, upload the latest ground revision once, preserving active/locked work; revisions after contact entry wait for the next contact. Invalid locked targets are not silently replaced; report execution failure, then replan.
- When no second available contact is predicted within the 48-hour horizon, retain the last feasible ground continuation and onboard TEL. If the onboard list is exhausted, retain OPS-03 Standby until a later available contact. Do not create an empty replacement solely because the forecast horizon has no second contact.
- Preserve an explanation of the chosen target and main skipped alternatives so the player can understand the schedule.

### Immediate integration milestone

CELL-03A in [Pending Changes](PENDING_CHANGES.md) is implemented. `src/simulation/prototypeCellMarket.ts` provides explicit sample scenario inputs; the app owns one market model and supplies its simulation time. Orders reads cell snapshots and submits player priority changes, while sample market rates remain read-only. Only the selected cell and visible table rows refresh when time or inputs change; the entire grid is not recalculated on render frames. Tab switches preserve the model instance.

The readout uses the proposed mapping and explicitly labeled sample rates. All cells initially have VAM 1. CELL-03B has selected-cell capture, failed-attempt, clock-advance, and reset previews. Capture stores imagery without cash; settlement occurs on delivery. TEL capture execution and contact-limited transfer/storage deletion are implemented as prototype behavior, with sample settings documented in [Gameplay](GAMEPLAY.md).

Future Orders work should add sorting/filtering against calculated dollar value and priority. The globe's Land Categories fill reads a selected category's current available-priority contribution from the shared market state; Planning draws operational state as outlines and target cues, plus maximum-value and total current-priority dots. Render category fills through tiled/aggregated imagery, and use Cesium entities only for the comparatively small active schedule; do not create one globe entity per market cell. See [Pending Changes](PENDING_CHANGES.md#cell-03--show-the-cell-market-in-orders).

### Open implementation and gameplay decisions

- Which additional attribute layers to include and their source, version, resolution, license, and attribution requirements.
- Whether to approve/revise the proposed geographic-to-category mapping and how its overlapping area/count/presence measures combine into category-level maximum in-game values; no adjustment solely for land fraction is planned.
- How market category prices and refresh cadences change over time; changes immediately recalculate derived payout and priority using the existing per-cell timestamp.
- Approval of the proposed category-to-source mapping and exact count semantics for mixed record/polygon layers; starting market prices/player priority rates/cadences and how market information changes over time.
- Whether representative long horizons need different bounded-search limits after profiling; the current method, budget, and locked-target behavior are documented above.
- How Sun elevation, off-nadir access, slew limits, collection duration, and satellite resources constrain opportunities and successful cell collection.
- How cloud forecasts estimate usable captures, how actual weather determines success, and what failure costs or retry rules apply.
- Storage capacity and image sizes; future retention overrides; and scheduler projections of storage pressure. The prototype retention ordering, FIFO partial transfer, and capture-time quote/full-delivery settlement are agreed in [Gameplay](GAMEPLAY.md#agreed-imagery-retention-and-delivery-2026-10-13-prototype-policies-approved-2026-10-14).
- Whether individual customer contracts, deadlines, or named monitoring sites are useful as an optional layer beyond the cell market.
- How polar and dateline cells are represented for collection geometry, and how the heat-map layer aggregates and normalizes at different zoom levels.
### Implemented geographic foundation (2026-10-05)

- The initial dataset contains 363,779 cells intersecting Natural Earth land polygons at ¼° resolution, including mixed coastal cells. Eligibility uses all touched cells and does not calculate land fraction.
- Fourteen geographic datasets are currently sourced: six Natural Earth layers for land, coastline, populated places/population, ports, urban areas, and boundaries; two circa-2015 agricultural rasters; WRI power plants; generalized Global Energy Monitor oil routes; NTAD military installation polygons; a Gigawatt Map data-center snapshot; NOAA GML research-monitoring stations; and UNESCO World Heritage points. Natural gas pipelines, grid lines/substations, sensitive ecological areas, and ships remain unsourced/null. See [Cell grid data](CELL_DATA.md) for provenance and caveats.
- Sample dollar rates and priority rates are configured for inspection in Orders. Final economy rates remain open.
- The Orders view supports search, attribute filters, sorting, pagination, numeric payout columns, a category breakdown, and player-editable priority rates. An on-demand geographic tile overlay shows eligibility and sourced attributes; cell selection links the globe and table. Collection/recovery preview controls, maximum-value dots, and total current-priority dots are implemented. The maximum-value layer shows potential payout at full VAM; current-priority dots sum available points across categories after recovery/VAM.
- Provenance, source limitations, packed data format, indexing rules, and rebuild steps are maintained in [Cell grid data](CELL_DATA.md).

### Provisional prototype conventions

- Authoring data uses named decimal-degree fields `latitudeDeg` and `longitudeDeg`. Domain altitudes and Cartesian positions use kilometers; the Cesium adapter converts kilometers to meters and passes longitude before latitude to Cesium.
- Cesium uses the WGS84 ellipsoid for display conversion. The initial orbital/contact model uses a spherical Earth with a mean radius of 6,371 km; this mismatch is a deliberate simplification to revisit if it affects gameplay.
- The globe remains fixed. Satellite orbit coordinates are calculated in a simple Earth-centered inertial-like frame, then rotated into an Earth-fixed frame using a 24-hour prototype day.
- The first satellite uses a circular 550 km orbit at 53° inclination, with configurable starting node and phase. Orbital period is calculated from the selected altitude and Earth's gravitational parameter.
- The prototype Sun is fixed along the inertial +X direction. Surface illumination uses the dot product of the surface normal and the Earth-fixed Sun direction. Satellite eclipse uses a cylindrical Earth-shadow approximation.
- Initial station contact uses a fixed 1,800 km great-circle surface-distance threshold from the sub-satellite point. The geometric contact rule does not model antenna angles, link budget, or true line of sight; configured station bandwidth separately constrains imagery transfer.
- The prototype simulation offers 1×, 60×, and 300× time speed, with 60× as the starting value. These speeds and all geometry constants are configurable scenario defaults, not balance decisions.

Keep the simulation/domain model independent of Cesium so another renderer can replace it if needed.

Treat each launched spacecraft's installed hardware specification as immutable. Procurement may select upgrades for a new spacecraft; retain the resulting per-spacecraft capability snapshot for planning and execution. Operational state and future maneuver state evolve under their own rules. The prototype `spacecraftCatalog.ts` defines Standard and Enhanced slew packages, and the domain purchase command validates the option, quotes it, and registers the configured spacecraft. The first upgrade slice covers one slew option; broader new-spacecraft upgrade choices are deferred. See the [FLEET-02B design brief](LAYER_3_PLAN.md#fleet-02b-design-brief).

## Suggested code boundaries

Names and folder layout are proposals until the project scaffold is chosen.

- **Simulation/domain:** State types, event-boundary time advancement, timed actions, operating policies, and business rules.
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
