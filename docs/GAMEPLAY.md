# Gameplay brief

This document captures gameplay intent and current design agreements. It is a working brief, not a complete specification. Details marked **Open** need a design decision before implementation depends on them.

## Player role and growth arc

The player owns and operates an earth-imagery satellite startup. They begin with limited money and design their first satellite, using mostly default options. As the business grows, they move from spacecraft-level configuration toward fleet policies, launch planning, and choosing which customers and markets to pursue.

## Core loop

1. **Configure capacity:** Design or select satellites and set their operating priorities within the available budget.
2. **Run the operation:** Satellites execute uploaded commands, capture imagery, use energy, and manage onboard storage. Imagery earns revenue only when downlinked through an available ground station. Storage pressure causes imagery deletion according to retention priority, so collecting an image does not guarantee income.
3. **Monitor outcomes:** Review operations, revenue, customer satisfaction, asset health, and anomalies.
4. **Resolve exceptions:** Diagnose or respond to issues that threaten service, equipment, or finances.
5. **Choose growth:** Reinvest in spacecraft, ground capacity, or the customer portfolio, then adapt operations to the larger business.

Routine operations should be able to run unattended for a while. The player should be able to intervene when an exception or strategic decision makes their attention valuable.

## Systems in the concept

These are intended subject areas; the specific formulas and interactions remain to be designed.

- **Satellite design:** A constrained set of hardware choices, with money as a major limit. Candidate dimensions include imaging capability, onboard storage, energy generation and storage, pointing agility, processing, communications, and expected service life.
- **Operations:** Capture opportunities, power use, onboard storage, and downlink availability.
- **Data and value:** Successful capture creates onboard imagery; revenue is realized only when that imagery is downlinked. Imagery deleted before delivery earns no revenue. A separate archive market for later resale is outside the current model.
- **Cell-based imaging market:** Geographic cells contain different category exposures. Market prices, average customer refresh cadences, player-set category priority rates, and the agreed VAM recovery curve determine available payout and cell priority. A candidate exposure mapping is implemented for review; category approval and initial market/priority rates remain open.
- **Customers and revenue:** Individual contracts, monitoring sites, and project fulfillment are possible later layers. They are not required for the initial market and collection loop.
- **Asset health:** Degradation and anomalies affect a satellite’s capability or risk. The player monitors fleet health and decides when to investigate, change operations, or accept a loss.
- **Company resources:** Cash and operational capacity constrain what can be built, launched, supported, and promised.
- **Fleet growth:** More satellites increase capacity and revenue potential, while making per-satellite oversight less practical. Fleet policies and satellite classes become more useful as the constellation grows.

## Interface needs

### Agreed layout and navigation

- Keep the globe/visualization at the top of the screen and show the selected data view below it.
- The data area has tabs for **Summary**, **Spacecraft**, **Orders**, **Ground Stations**, and **Finance & Growth**. Summary is the default tab and replaces the current single readout as the overview.
- Summary brings together fleet-wide and company information, current exceptions, and the operational indicators that need attention.
- Use tables wherever they suit lists and comparisons, especially in Spacecraft, Orders, and Ground Stations. Selecting a row should make its subject easy to locate in the globe view.
- The Orders view includes a searchable cell market list and controls globe layers for category exposure, calculated value, and repeat-purchase state when defined.

### Information each view should support

- Fleet and individual satellite state, including onboard data, energy, health, and current work.
- Operations and exceptions requiring attention.
- Revenue and other business performance.
- The next growth choices available to the company.
- Ground-station location, status, capacity, and contact activity.
- Cell category exposures, calculated revenue, refresh state, and collection constraints.

A visual Earth with orbit paths and satellite markers is operational context. Detailed interaction with the globe is not required by the current brief, though selecting a row should connect its data to its location on the globe.

## Design principles

- Show causes alongside alerts and outcomes. A low-storage warning should help the player see what is filling storage and what options remain.
- Make routine actions automatable through priorities or policies as fleet size grows.
- Keep exceptions consequential but understandable. An anomaly should lead to a legible choice, not unexplained failure.
- Connect operational performance to business outcomes so capture, scheduling, and any modeled resource or delivery costs matter.
- Avoid requiring constant manual input for every orbit or routine activity.

## Cell-based imaging market

### Agreed direction

- Use a regular **¼° latitude/longitude grid** as the market and collection unit. A cell is the smallest collection unit; the simulation treats collection as imaging the entire cell. Swath width is abstracted away. Collection time, resource use, and access limits remain to be defined at the cell level.
- Include cells that intersect land, including mixed land-and-sea coastal cells. Exclude cells with no land so remote open-ocean areas such as the central Pacific do not fill the market map. Do not calculate fractional land coverage as a requirement for cell eligibility or value.
- Each eligible cell has category-specific geographic exposures, expressed in the unit used by that category's price (for example, eligible square kilometres or feature count). The cell's gross price is calculated from the current category rates and those exposures, then the category contributions are summed.
- Geographic attributes such as urban footprint area, infrastructure counts, and agriculture may contribute to category exposures. The currently implemented candidate mapping is listed in [Cell grid data](CELL_DATA.md); it converts measured area to km² and retains count/presence source measures for sites and routes. It is **Proposed** pending review, including treatment of overlapping crop/pasture, plant-count/capacity, and polygon/presence measures. Market rates are tunable in-game assumptions, not literal real-world customer prices.
- The market grid and cell-value rules belong to the simulation/domain model and remain independent of the globe renderer.

### Market information, cell revenue, and scheduling

#### Agreed market readout and revenue calculation

- The player can view a market readout that changes over time and is not editable by the player. It reports, by market category, the current purchase price and the average customer refresh cadence: how often customers are willing to buy the same area or counted feature again.
- Prices use the unit appropriate to the category, such as dollars per square kilometre for area-based categories or dollars per counted feature for count-based categories. A readout could, for example, show urban imagery at $5/km² with a two-month refresh cadence, and pipelines at $100 per pipeline in a cell with a six-month refresh cadence. These are illustrative values, not balance decisions.
- Match each category's exposure and price units. Convert area measures to square kilometres where useful (hectares ÷ 100); keep discrete sites/routes as counts unless the source provides a defensible measured area or length. The computation can use a data-driven category/unit mapping, so the revenue and priority formulas do not need separate hand-written code for each source layer.
- For each cell-category, calculate maximum payout by multiplying the applicable market unit price by the eligible area or feature count in that cell. Multiply that maximum payout by the category's VAM to get its currently available payout. Sum the available category payouts to get the cell's potential sale value. Credit revenue only when imagery is downlinked. Whether an image's payable value is fixed at capture or evaluated at delivery remains **Open**.
- A category's market price and refresh cadence are market information, not player controls. Market changes over time are visible in the readout.

#### Agreed value and priority recovery curve

- Use a **Value Availability Multiplier (VAM)** for the available fraction of both a category's maximum cell payout and its maximum cell priority points. VAM is dimensionless and ranges from 0 to 1. The market determines the payout rate; the player sets the category priority rate.
- A never-collected cell starts at VAM 1. After a successful whole-cell collection, let `elapsed` be simulation time since that cell's last successful collection and `cadence` the category's current customer refresh duration. The minimum refresh period is 10% of that cadence.
- VAM remains 0 while `elapsed <= 0.1 × cadence`, increases linearly from 0 to 1 between `0.1 × cadence` and `cadence`, then remains 1 once `elapsed >= cadence`:

  `VAM = clamp((elapsed - 0.1 × cadence) / (0.9 × cadence), 0, 1)`

- For a 100-day cadence, VAM is 0 through day 10, then rises linearly to 1 at day 100. Use explicit simulation durations such as seconds, minutes, hours, and days; “month” is not a simulation unit. The UI may format durations for readability.

- The category's maximum payout for a cell is its applicable market unit price multiplied by that cell's eligible area or feature count. Its available payout is `maximum payout × VAM`. Sum available category payouts for the cell. This is potential revenue; capture itself does not credit company money.
- The player sets an editable priority rate in points per matching unit for each category (for example, points/km² or points/pipeline). A cell-category's maximum priority is `player-set category priority rate × cell exposure`; its available priority is `maximum priority × VAM`. Sum the available category priority points to get the cell's priority score.
- Category priority rates are the player's scheduling control. There is no separate category/cell emphasis control. These rates do not alter market prices, refresh cadences, or payout amounts. VAM scales market payout and player-set priority in parallel, so a cell-category's contribution to either is reduced until its refresh curve recovers.
- A successful whole-cell collection resets one `lastCollectedAt` timestamp for that cell. All category contributions in the cell use this same elapsed time, while each category applies its own cadence and derives its own VAM. Collecting a mixed cell also resets its slower-refresh categories; this is an accepted consequence of whole-cell collection.
- Recalculate VAM immediately when simulation time, market cadence, or player-set priority rates change. Treat payout and priority points as calculated values, not stored balances. An optional cell-level `atMaximum` cache is true only when all contributing categories are fully recovered; invalidate it whenever relevant market data changes.
- A successful collection creates an imagery record and resets the cell's collection timestamp without crediting company money. A failed collection creates no saleable image and does not reset the cell. Downlink settlement must credit each image's eligible revenue only once. The existing recovery rule still uses successful collection time; payment timing does not move that timestamp to downlink.

#### Agreed imagery retention and delivery (2026-10-13)

- Revenue is realized when imagery is downlinked, superseding the earlier payment-at-capture rule. Imagery deleted before delivery produces no revenue.
- When onboard storage is constrained, delete imagery according to retention priority. The default retention priority is the cell priority; lower-priority imagery should be discarded first. Storage pressure is handled through deletion rather than a blanket stop on collection.
- Keep retention priority distinct from dollar payout. Whether priority is captured with the image or recalculated later, which overrides the player can set, tie-breaking, and how a newly collected image competes with existing imagery remain **Open**.
- Storage capacity, image data size, downlink ordering, partial transfers/resumption, the payment threshold for a partly downlinked image, and when delivered imagery is removed from storage remain **Open**. So do the payable value's pricing/VAM reference time and any age-related value change.
- **Prototype implementation:** Captures create identified onboard images and reset recovery without cash. Live transfers progress only during available station contacts at the configured downlink rate; partial progress persists across contacts, and a full transfer settles the labeled capture-time quote exactly once. Storage uses a configurable 100 MiB per-spacecraft prototype capacity with 10 MiB sample images; overflow deletes the lowest captured cell-priority image first, breaking ties by oldest capture and then image ID. These size, capacity, retention snapshot/tie, FIFO downlink, and capture-time quote choices are prototype assumptions, not final gameplay decisions. The Orders preview can still settle an image instantly as a clearly labeled shortcut.

#### Agreed scheduling behavior

- Scheduling uses both geometry and time. Geometry determines which cells are in a satellite's reachable observation opportunities; timing determines whether the satellite can turn, collect, and finish before that opportunity closes. The player's category priority rates determine which feasible work is most valuable to schedule.
- The player does not choose among scheduler algorithms or use a separate "emphasis" control. Category priority rates already express the player's scheduling strategy.
- While a collection is underway, the scheduler must identify and hold the next collection target. It may reconsider targets after that one. In other words, the current collection and the next collection are committed; later collections in a plan are tentative.
- Use a two-simulation-minute optimization window to bound the number of collection combinations considered in one scheduling segment. This search window is separate from TEL duration. Advance through successive segments to build the longer schedule; segments can extend or revise tentative collection choices. Every segment must remain feasible from the cell immediately before it, using that collection's actual or planned completion state. Revisions must also preserve compatibility with any retained continuation.
- Use the current collection, slew, and locked next collection's execution time to calculate and refresh the plan. Have the next target ready when it is needed; do not insert extra simulated waiting solely for schedule computation.
- Treat the Task Event List (TEL) as the executable plan stored onboard the satellite. Ground-side Greedy/Beam scheduling produces TEL updates, but the satellite receives new or revised events only during contact with an available ground station. Between contacts it follows its onboard TEL; changes to player priorities, market data, or other new information do not silently alter the onboard plan before an upload.
- If the onboard TEL has no remaining events, the satellite enters **Standby** until it receives an updated TEL at a ground-station contact. Additional real-world safe-mode behavior is outside the simulation's current scope.
- At contact, the ground station uploads a TEL containing commands to operate the satellite all the way to the next contact. Build that duration by progressing through short optimization segments; it is not a single two-minute TEL or one exhaustive search over the entire interval. Behavior when no next contact is available, or when a predicted contact is missed, remains **Open**.
- **Proposed capture prototype:** Orders can add selected cells to an authored ground TEL. The draft forecasts the next available contact and sequences each target from the prior command's completion and pointing. Uploaded capture commands use a shared cell-center access and slew calculation; a successful command creates onboard imagery and resets recovery, while an access or timing failure creates no image and does not reset recovery. The current demonstration settings (25° off-nadir, 45-second collection, sunlight ignored) are provisional only. Final access geometry, sunlight rules, duration, interruption, and failure behavior remain **Open**.
- **Proposed scheduler prototype:** The selected spacecraft's Spacecraft view can generate a greedy ground TEL spanning its next two available contacts. It searches in two-minute segments, samples candidate opportunities every 60 seconds, ranks by projected available priority at completion, carries planned VAM resets and pointing into later segments, and emits explicit idle commands when no positive-priority feasible target is available. Ties use priority, earliest start, then cell ID. Orders remains the place to select cells and add individual capture commands to the authored draft. The proposed plan uploads through the existing contact flow and remains fixed onboard until a later contact. Automatic replanning, locked-target preservation, segment tuning, and final tie-break rules remain **Open**.
- A contact may upload a TEL and downlink imagery at the same time. Downlink throughput constrains how much imagery reaches the ground and may leave data onboard or result in imagery loss, creating a tradeoff between accepting loss and investing in more contacts, bandwidth, or transfer time. The prototype uses station downlink rates; whether TEL upload has any transfer cost or duration remains **Open**.
- The satellite accumulates imagery onboard between contacts and deletes imagery under storage pressure using retention priority, defaulting to cell priority. Downlink determines when revenue is realized; more contacts, bandwidth, or contact time can deliver imagery before it is discarded. Prototype transfer, capacity, and ordering choices are recorded above; final gameplay values and policy details remain **Open**.
- The planner may maintain a tentative continuation beyond the events currently committed onboard. Contact is the synchronization point at which the satellite can receive that continuation or revisions. The precise division between ground-side planning, onboard execution/autonomy, and replanning between contacts remains **Open**.
- The segment boundary and overlap remain **Open**. The implementation proposal is to begin the first optimization window after the locked next collection's completion, then advance the scheduling cursor through later segments using each preceding collection's completion state. The scheduler can build these future segments ahead of execution; it need not wait for simulation time to reach each one.
- A plan's main objective is the total available priority points expected from feasible collections completed in its lookahead. Predict VAM at each planned completion and apply the shared cell timestamp behavior; only planned successful captures reset that cell's timestamp in the projected plan. Payout remains visible to the player but does not get multiplied into this scheduling score.
- A short, bounded search should compare several plausible target sequences instead of enumerating every possible combination. The first feasible target in the current ground-side plan is committed for that plan; the remainder may change as the satellite advances, new information arrives, or the player edits category priorities. Any changes to onboard execution take effect only after TEL upload at contact. Prefer a simpler, broadly sensible plan over a search that aims to guarantee a mathematically perfect schedule.
- **Agreed prototype cloud representation:** Use ERA5 monthly mean total cloud cover as the global seasonal baseline, averaged over 1991–2020. Select the baseline for the simulation's calendar month. Aggregate the global 0.25° source grid into the project's 1° weather cells with area weighting. For each hourly time bucket, generate an actual 0–1 cloud-cover value for every 1° weather cell using a Gaussian draw centered on that cell's seasonal baseline. For a targeted ¼° market cell, draw a second Gaussian value centered on the current hourly value of its parent 1° cell, then clamp to [0, 1]. Exactly 0 or 1 are acceptable results. Make both draws deterministic for the scenario and their cell/time-bucket keys, so replanning and repeated checks do not reroll actual weather. Keep each result fixed for the hour.
- The scheduler sees a separate imperfect forecast, never hidden actual conditions; a forecast may weight expected priority by the chance of a usable capture. Gaussian spreads, forecast accuracy, usable-image threshold, failure costs, and retry policy remain **Open**. A failed capture creates no image or revenue and does not reset VAM.

#### Proposed scheduling method

1. Generate candidate cell opportunities in the two-minute lookahead using predicted satellite position and the current access and pointing limits.
2. Reject sequences that cannot fit the required turn and collection durations inside each opportunity. These limits and durations are still to be designed.
3. Start with a quick greedy feasible plan, then use a bounded beam search: extend a limited set of the best partial sequences with promising next cells, and stop at the horizon or a fixed search budget. Keep the greedy result as a known feasible fallback. Search width, candidate limits, and search budget are tuning choices, not gameplay rules.
4. Compare sequences by total expected available priority. Candidate ranking may retain a mix of high-priority, nearby, and soon-to-close opportunities so the search does not ignore convenient multi-cell sequences. Lower total turning and waiting time can break ties.
5. Extend or revise the tentative ground plan in successive short segments until it covers the next contact. Seed each segment with the preceding collection's completion time, pointing, and relevant projected state. Revalidate transitions into and out of a revised segment. Preserve the current and locked next collection; revisions affect onboard commands only after upload at contact. Show an understandable reason for the next choice and notable skipped alternatives where the interface supports it.

If cloud forecast data is available, one proposed comparison is `available priority × estimated probability of a usable capture`. This estimate affects selection only; it does not change the displayed cell priority or the payout formula. Do not reroll the same forecast every time the scheduler revisits a candidate. The weather model, forecast accuracy, cloud threshold for a usable whole-cell image, effects of failure on time/resources, and retry policy remain **Open**.

### Open design questions

- Whether to approve or revise the proposed sourced-attribute mapping and how overlapping features/categories are handled, including whether the same area can contribute to multiple categories.
- The starting market prices, player-set category priority rates, and refresh cadences, plus how market information changes over time.
- The two-minute lookahead boundary relative to the locked next collection, the search budget, and tie-break rules.
- How optimization segments advance and overlap, how far back tentative choices can be revised, and how to preserve feasibility across segment boundaries.
- How to handle a missing or missed next contact, or an uploaded TEL that becomes infeasible before the next contact.
- Whether TEL uploads have any meaningful size, duration, or resource cost; uplink speed is not currently expected to be a major constraint.
- Storage capacity and image sizes; retention-priority sampling/update rules, overrides, and ties; downlink ordering and partial-transfer behavior.
- Which changes require a replacement TEL at the next contact, and whether any changes can be accepted during a contact already in progress.
- Satellite access geometry, pointing limit, slew speed, collection duration, and which changes are important enough to cancel or replace the locked next target.
- The idle reconsideration interval and the retry policy after a failed collection.
- How cloud conditions determine usable image quality, how imperfect forecasts feed the scheduler, and how failure affects time and spacecraft resources.
- Final storage/downlink costs and capacities; payable value at capture versus delivery, and the settlement threshold for partially delivered imagery. Revenue is realized only on downlink.
- Whether customer contracts, deadlines, or named monitoring sites should be added as an optional layer later.
- Where and how to present category rates, per-cell exposures and revenue contributions, calculated gross cell value, and any repeat-purchase/freshness state, including heat-map normalization.

**Agreed delivery priority (2026-10-06):** Cell dollar values and a manual collection/recovery preview are visible in Orders. [Pending Changes](PENDING_CHANGES.md) records CELL-03A/B as implemented. The sample rates are **Proposed** preview inputs, not approved game balance; preview controls do not define satellite access rules. Market prices and cadences remain read-only to the player; category priority rates remain the intended scheduling controls.

**Agreed future inspection tools (2026-10-06):** The Cell table should eventually sort and filter on cell dollar value, maximum priority, and current/available priority, alongside geographic attributes. Globe cells should offer color modes for those same three metrics so players can compare market payout potential with the scheduling score. Maximum priority is calculated at VAM 1; current priority applies the categories' current VAM values. Exact color ramps and numeric normalization remain open presentation choices.

The current prototype exposes the geographic grid in Orders and on the globe, with sourced city, port, per-cell urban footprint area, border, coast, cropland, pasture, power plant, major oil pipeline, military installation, data-center, NOAA research-site, and UNESCO World Heritage attributes. Large urban footprints span their mapped cells; a city-point population label does not concentrate the entire city's market value in one cell. Proposed normalized category exposures and sample-priced values are inspectable in Orders. The app connects the market model to simulation time, executes captures from uploaded TELs, and can manually generate a greedy ground plan. Automatic recurring replanning and market trends remain unimplemented. See [Cell grid data](CELL_DATA.md) for source coverage, candidate category mapping, and limits.

## Open design questions

- What is the basic time unit, and how does the player advance or accelerate time?
- How should sourced cell attributes map into market categories and their price/priority units?
- Which design choices belong in the first satellite builder, and which use defaults?
- Which storage/downlink/processing costs apply, and how should the imagery delivery and revenue rules handle partial transfers and deletion?
- What anomaly information is immediately visible, and what requires diagnosis?
- Which routine decisions can be expressed as simple operating priorities?
- What is the first meaningful growth choice after the initial satellite is operating?
