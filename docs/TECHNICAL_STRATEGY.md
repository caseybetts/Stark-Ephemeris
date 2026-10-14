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
- Let the Cesium-independent simulation runtime own elapsed time and per-spacecraft timed actions. Advance directly between known action boundaries; process each start/completion event once, then set the requested final simulation time. Pause and speed controls choose whether and how far to advance the same runtime.
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
- Treat the satellite's onboard Task Event List (TEL) as the source of executable scheduled work between contacts. Ground planning builds commands covering operation through the next contact by progressing through two-minute optimization segments. Transmit changes only during an available ground-station contact. Keep the proposed ground plan distinct from the version stored onboard so changed priorities or market information do not affect execution before upload. If the TEL is exhausted, the satellite enters Standby until an updated TEL is uploaded. Missing/missed-contact behavior remains open. See [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior).
- Allow TEL uplink and imagery downlink to occur simultaneously. Store uplink and downlink bit rates in Mbps on each station definition; downlink throughput constrains imagery delivery and revenue realization, while uplink speed is not currently expected to materially constrain TEL uploads. Both sample stations use configurable placeholder defaults of 10 Mbps uplink and 100 Mbps downlink; these are not real-site specifications. Downlink rate now drives contact-time transfer progress. Detailed TEL transfer cost/size remains open.
- Revenue is realized only when imagery is downlinked. Model capture, onboard retention, transfer, deletion, and revenue settlement as distinct lifecycle events. Under storage pressure, delete imagery by retention priority, defaulting to cell priority; imagery deleted before delivery earns no revenue. Prototype implementation uses captured priority snapshots, oldest-first ties, FIFO transfer, 10 MiB images, 100 MiB capacity, and capture-time value quotes. These are configurable/proposed choices; final capacity, image sizes, priority updates/ties, downlink order, partial-delivery payment rules, and pricing reference time remain open. See [Gameplay](GAMEPLAY.md#agreed-imagery-retention-and-delivery-2026-10-13).
- The sample station statuses are static configuration. Outages, maintenance, and status changes over time have not been modeled.
- Location, facility availability, uplink rate, and downlink rate are the initial site fields shown in the table. Antenna count, how many spacecraft can use a station concurrently, supported bands, and maintenance state remain future design options.

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
- Each eligible cell has category-specific exposures, expressed in the unit used by that category's price. Its potential value is the sum of current per-category payouts after VAM. Capture creates onboard imagery; revenue is realized only on downlink. Storage and transfer constraints therefore affect earned income. A separate archive market for later resale is outside the current model.
- The candidate category/exposure mapping is implemented in `src/simulation/categoryExposures.ts` and described in [Cell grid data](CELL_DATA.md). It converts urban, cropland, and pasture area into km²; other candidates retain mapped record/polygon counts or MW. This mapping is **Proposed** pending review, and its data measures are not approved market categories or verified real-world prices.
- Geographic attributes such as sensitive ecological areas, borders, and additional energy infrastructure may be considered later; they are not in the current candidate market mapping.
- The Orders tab presents the cell market and offers globe layers for category exposure, calculated gross value, and repeat-purchase/freshness state once that state is defined. Individual customer orders, point targets, and project contracts are not required for this initial economic loop; they may be added later as a separate layer.
- Each satellite has a slew-speed capability. A paid upgrade applies to satellites launched afterward. The current code convention is degrees per second plus settling seconds, with great-circle separation between pointing vectors; Asteria-1's 1 degree/second and 2-second settling values are scenario placeholders, not approved gameplay balance. CELL-04A/B should share `calculateRetargetDurationSeconds`. Whether pointing uses independent-axis limits, the final units/values, and any upgrade amounts remain open.

### Proposed implementation shape

- Keep the grid, geographic attribute layers, per-cell category exposures, market state, repeat-purchase state, and collection updates in simulation/domain data, separate from Cesium and UI components.
- The complete ¼° grid contains 1,036,800 cells before the land mask. Compact typed arrays or equivalent packed data are expected to keep static attributes and dynamic value state inexpensive. Do not create one globe entity per cell; render a tiled/grid layer and aggregate at display resolution when useful.
- Preprocess sourced geographic datasets into the cell grid or load suitable static datasets; do not query external data services during simulation steps. Record source, version/date, resolution, attribution, and license for each distributed data layer.
- Use one last-collection simulation timestamp per cell. Every category derives VAM from the shared elapsed time and its own cadence. A never-collected cell starts fully available (VAM 1). Successful capture records the image and resets the timestamp without crediting cash; failure does neither. Downlink settlement credits eligible image revenue exactly once. Preserve image identity across capture, transfer, and deletion so retries cannot pay twice and discarded imagery cannot subsequently settle.
- Store geographic attributes and derived category exposures separately from time-varying market rates and dynamic repeat-purchase state. Keep collection events traceable for revenue accounting.
- Keep the category exposure mapping data-driven and independently inspectable without Cesium. Orders now shows the proposed exposure quantities, sample market rates, derived payout, and priority separately.
- **Implemented prototype lifecycle:** `src/simulation/cellMarketState.ts` accepts explicit market values, priority rates, and starting cash; stores one `Float64Array` timestamp per cell; and calculates snapshots on demand. Successful capture creates an identified onboard image, captures its value-potential quote and initial cell-priority score, and resets recovery without changing cash. `src/simulation/imageryOperations.ts` applies a configurable per-spacecraft byte capacity, deletes lowest-priority images on overflow, advances downlink bytes only over active station-contact intervals, and settles completed images exactly once. Partial bytes persist on the image record. The prototype uses capture-time quotes and FIFO transfer order; these and capacity/image sizes remain proposed choices. Partial-delivery payment and final pricing reference time remain open.
- **Agreed market and priority model:** Keep read-only market prices/cadences and player-set category priority rates distinct. Category exposure units must match price and priority units. VAM is 0 through 10% of cadence, rises linearly to 1 at cadence, then stays at 1: `clamp((elapsed - 0.1 * cadence) / (0.9 * cadence), 0, 1)`. A never-collected cell starts at VAM 1. Recalculate derived values when time or inputs change. Successful whole-cell capture resets the shared timestamp for all categories without crediting cash. Downlink realizes revenue. Whether the payable value is fixed at capture or evaluated at delivery remains open; do not accidentally price imagery against its own just-reset VAM. See [Gameplay](GAMEPLAY.md#market-information-cell-revenue-and-scheduling).
- Cell aggregation uses a regular lat/lon index. Its geographic cell area varies with latitude; value layers must have an explicit interpretation (for example per-cell market value) and must not accidentally treat raw feature counts as comparable dollar prices.
- Represent collection as a whole-cell operation. Swath width, scan-strip sequencing, and partial-cell coverage are outside the current model. Whole-cell completion does not imply instantaneous or cost-free collection; timing and resource rules remain open.
- Draw the market as a toggleable cell layer. Cell resolution is agreed at ¼°; color normalization, zoom-level aggregation, and exact rendering representation remain open tuning choices.
- When a satellite collects a cell, a temporary line or compact footprint cue may connect the satellite to the collection area. Do not render image pixels in the initial implementation.

### OPS-04 integration verification

OPS-04 verifies the existing operational loop and fixes defects against its documented prototype rules. Follow the [implementation and verification guide](OPS_04_VERIFICATION.md) for the code map, baseline failures, fixture recipes, scenario matrix, comparisons, and delivery checks.

Keep capture/transfer orchestration in the simulation domain and call that same code from the browser and tests. The current glue in `src/main.ts` must be extracted narrowly so headless tests exercise production behavior. Advance effects chronologically across action/contact boundaries; later captures must not change inventory before earlier eligible transfers have been applied.

Use exact contact fixtures to verify event integration and separate cases with the real predictor to verify contact plumbing and its documented geometry tolerance. Compare business identities, irreversible outcomes, checkpoint state, and causal event order. Transfer-progress record counts and sequence-based diagnostic event IDs may differ with step size; they must not be used as a substitute for checking byte/cash conservation. Keep scenario values explicitly provisional. No new power, weather, pricing, or TEL-replacement policy is approved by this verification work.

### Proposed automatic cell scheduler

- Keep schedule search in the simulation layer and make it deterministic from the same simulation time, orbit/access predictions, cell-market snapshot, spacecraft capabilities, and forecast inputs. It should not depend on Cesium rendering or wall-clock frame rate.
- Treat the current collection and the next collection as committed. While collection A executes, keep B locked as the next collection and build or refresh tentative entries C onward after B. When A completes and B starts, promote C to the locked next collection; later entries remain replaceable. Roll the horizon forward so successive windows overlap.
- Use the current collection, slew, and the locked next collection's execution time to compute the follow-on schedule. Have the next target ready before it is needed; do not impose a separate simulated planning delay.
- Use two-minute optimization segments to bound search complexity, independently of the TEL duration through the next contact. Advance a planning cursor through future segments ahead of execution. Each segment starts from its preceding collection's actual or projected completion state, including time, pointing, and applicable resources. Revisions must preserve feasibility with the preceding collection and any retained continuation. Segment advancement/overlap remains open; beginning the first segment after the locked next collection completes is the current proposal.
- Build candidate opportunities from geometric access windows and time feasibility. Include time to slew and to complete the whole-cell collection before the opportunity closes. Exact pointing limits, slew speeds, collection durations, and capability/resource constraints are not defined yet.
- Use bounded search rather than exhaustive permutation of all opportunities. Proposed baseline: produce a quick feasible greedy plan, expand a limited beam of alternative partial sequences within each segment, and retain the best feasible schedule within a fixed candidate/iteration budget. Keep the prior feasible continuation as fallback while extending or revising tentative portions of the ground plan. Onboard commands change only upon upload at contact.
- Score a sequence by total available category priority points projected at each capture completion. Projected successful captures reset each cell's shared collection timestamp for later entries in that sequence. Category priority rates remain the player's strategic controls; do not add a separate emphasis setting or multiply payout into priority.
- Weather is uncertain. Use the 1991–2020 calendar-month climatology of ERA5 total cloud cover, aggregated with area weighting from 0.25° to the 1° weather grid, as the seasonal baseline. For each hourly bucket, actual 1° cloud values use deterministic Gaussian draws around that baseline; actual ¼° values use a second draw around the parent 1° value. Both are clamped to [0, 1] and stable per scenario/cell/hour. A separate imperfect forecast may weight expected available priority by probability of a usable capture; it must not expose actual weather or reroll on each planning pass. Failure must not create imagery, credit payout, or reset VAM. Gaussian spreads, image-quality thresholds, and retry/failure costs remain open; see [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior).
- Reconsider after an action completes and when player priorities or relevant forecasts/constraints change. An idle polling interval and thresholds for replacing a still-feasible locked target are proposals requiring tuning; a working committed action should not thrash in response to small score changes.
- Preserve an explanation of the chosen target and main skipped alternatives so the player can understand the schedule.

### Immediate integration milestone

CELL-03A in [Pending Changes](PENDING_CHANGES.md) is implemented. `src/simulation/prototypeCellMarket.ts` provides explicit sample scenario inputs; the app owns one market model and supplies its simulation time. Orders reads cell snapshots and submits player priority changes, while sample market rates remain read-only. Only the selected cell and visible table rows refresh when time or inputs change; the entire grid is not recalculated on render frames. Tab switches preserve the model instance.

The readout uses the proposed mapping and explicitly labeled sample rates. All cells initially have VAM 1. CELL-03B has selected-cell capture, failed-attempt, clock-advance, and reset previews. Capture stores imagery without cash; settlement occurs on delivery. TEL capture execution and contact-limited transfer/storage deletion are implemented as prototype behavior, with sample settings documented in [Gameplay](GAMEPLAY.md).

Future Orders work should add sorting/filtering against calculated dollar value, maximum priority, and current/available priority, and selectable globe cell-color modes for those same metrics. Calculate map values from the shared market snapshot and render through tiled/aggregated layers, not per-cell Cesium entities. Color ramps, normalization, legends, and range/threshold filter controls remain open UI choices; see [Pending Changes](PENDING_CHANGES.md#cell-03--show-the-cell-market-in-orders).

### Open implementation and gameplay decisions

- Which additional attribute layers to include and their source, version, resolution, license, and attribution requirements.
- Whether to approve/revise the proposed geographic-to-category mapping and how its overlapping area/count/presence measures combine into category-level maximum in-game values; no adjustment solely for land fraction is planned.
- How market category prices and refresh cadences change over time; changes immediately recalculate derived payout and priority using the existing per-cell timestamp.
- Approval of the proposed category-to-source mapping and exact count semantics for mixed record/polygon layers; starting market prices/player priority rates/cadences and how market information changes over time.
- Exact horizon boundary, bounded-search method and budget, idle reconsideration interval, and rules for replacing a still-feasible locked target.
- How Sun elevation, off-nadir access, slew limits, collection duration, and satellite resources constrain opportunities and successful cell collection.
- How cloud forecasts estimate usable captures, how actual weather determines success, and what failure costs or retry rules apply.
- Storage capacity and image sizes; retention priority sampling, overrides and ties; downlink ordering and partial-transfer/resumption rules; payable value reference time and settlement threshold. Deletion under storage pressure and revenue only on downlink are agreed.
- Whether individual customer contracts, deadlines, or named monitoring sites are useful as an optional layer beyond the cell market.
- How polar and dateline cells are represented for collection geometry, and how the heat-map layer aggregates and normalizes at different zoom levels.
### Implemented geographic foundation (2026-10-05)

- The initial dataset contains 363,779 cells intersecting Natural Earth land polygons at ¼° resolution, including mixed coastal cells. Eligibility uses all touched cells and does not calculate land fraction.
- Fourteen geographic datasets are currently sourced: six Natural Earth layers for land, coastline, populated places/population, ports, urban areas, and boundaries; two circa-2015 agricultural rasters; WRI power plants; generalized Global Energy Monitor oil routes; NTAD military installation polygons; a Gigawatt Map data-center snapshot; NOAA GML research-monitoring stations; and UNESCO World Heritage points. Natural gas pipelines, grid lines/substations, sensitive ecological areas, and ships remain unsourced/null. See [Cell grid data](CELL_DATA.md) for provenance and caveats.
- Sample dollar rates and priority rates are configured for inspection in Orders. Final economy rates remain open.
- The Orders view supports search, attribute filters, sorting, pagination, numeric payout columns, a category breakdown, and player-editable priority rates. An on-demand geographic tile overlay shows eligibility and sourced attributes; cell selection links the globe and table. Collection/recovery preview controls are implemented; value/freshness map layers remain future work.
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
