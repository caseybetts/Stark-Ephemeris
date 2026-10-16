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
- The Orders view includes a searchable cell market list. Globe controls split **Land use categories** from **Everything else**; planning and operational views stay beside the map.
- The Orders globe supports maximum cell priority, current available priority, current available dollar value, scheduled capture cells, and an active satellite-to-cell imaging view. Dollar value on the map is potential payout; only a completed downlink realizes revenue.

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

## Spacecraft power — agreed prototype rules (OPS-01B)

These rules define the first power slice. Energy is a legible operational constraint that the scheduler predicts and execution enforces using the same calculations. Starter values are agreed prototype inputs, not final balance or spacecraft specifications.

### Prototype model

- **State and units:** Track each spacecraft's stored energy and battery capacity in watt-hours (Wh). Express solar generation and activity loads in watts (W); integrate them over simulation seconds. Keep scenario values configurable and label starter values as provisional.
- **Generation:** Use the existing satellite eclipse calculation. A sunlit spacecraft generates at a configured constant rate; generation is zero in eclipse. For the first slice, assume fixed panel orientation and a fixed generation rate rather than modeling solar angle, panel articulation, degradation, or temperature. Surplus generation charges the battery up to capacity; energy above capacity is discarded. Use 100% charging/discharging efficiency initially so energy accounting is easy to inspect. Do not add separate battery charge/discharge rate or electrical peak-power limits in this slice.
- **Loads:** Apply an always-on housekeeping load. Add configurable load for capture operations and for imagery downlink. Treat capture's current combined slew-and-collection command as one load interval until execution models those phases separately. TEL upload has no modeled energy cost in this slice, consistent with its currently negligible transfer duration.
- **Concurrent activity:** Capture and imagery downlink may run together when energy permits. Housekeeping has first claim on power. Protect the active capture and the locked next capture, including its intervening wait; downlink uses energy left after those commitments. Downlink draws its configured additional load only while bytes are being transferred, at the fastest available single station's full rate. There is no radio load for an empty store, an unavailable station, or a paused transfer.
- **Reserve and feasibility:** Reserve is a discretionary-work threshold, not a physical battery floor. Admit a capture at command start only if the predicted minimum charge over its entire slew-and-collection interval stays at or above reserve, accounting for eclipse transitions and capacity saturation. An acceptable final charge alone is insufficient. Preserve energy for feasible committed work before allocating downlink. Housekeeping continues below reserve when necessary; charge can reach zero but never become negative.
- **Rejected captures:** Decide power admission once at the command's start, using charge at that instant. A power-rejected command occupies its original time slot, draws only housekeeping while powered, does not slew or change pointing, and reports failure at its completion boundary without an image or VAM reset. Charging during the slot does not restart it. Continue to the next original command; do not shift queued times or silently replace the locked target. An admitted capture draws its additional load throughout the command even if its eventual image fails another check; consumed energy is not refunded.
- **Recovery:** When energy reaches zero, enter a separate `power-depleted` state: payload and radio are unavailable, housekeeping is shed, and solar generation still charges the battery. Retain imagery, partial bytes, TEL identity, and the original command timeline. Commands whose starts occur while depleted are power-rejected in their existing slots. Restore housekeeping and normal admission automatically at a configured restart charge above reserve. This is a deterministic recovery abstraction, not a modeled spacecraft fault or repair system. A validated, admitted capture should never deplete under this deterministic model; an unexpected breach is an implementation error, not a new abort policy.
- **Time consistency:** Integrate energy over simulation intervals, splitting at activity, contact, and eclipse transitions. Results must be independent of whether the same elapsed time is advanced in one large step or many small steps. Planning must use the same generation, load, and reserve rules as execution.

### Downlink and planning rules

- Define the downlink guard as the minimum current charge needed to keep the active and locked next capture above reserve through their completion, using known sunlight and mandatory loads. Without committed captures the guard is reserve. If the committed sequence is already infeasible, pause downlink and report the conflict; retain the target and fail it explicitly at execution if still infeasible. Do not borrow energy from those commitments to deliver an image.
- Run full-rate downlink until the next contact, image-completion, illumination, or energy-guard boundary. Pause before crossing the guard. After an energy pause, resume when charge reaches the guard plus a configurable restart margin, or immediately when solar generation can sustain the combined load without eroding the guard. If guard plus margin exceeds capacity, wait for the sustainable-generation condition or a change in commitments; do not create a zero-time pause/resume loop. A recovery may resume downlink during the same contact episode; partial bytes are retained.
- A powered spacecraft may upload at contact-episode entry even below reserve, because upload energy is abstracted to zero. A depleted spacecraft cannot upload. Recovery later in the same episode does not introduce another upload opportunity; wait for the next episode under OPS-03.
- Ground planning projects the current onboard execution, contacts, transfer inventory, and power state to the prospective upload and committed-prefix completion before scoring a suffix. Candidate sequences carry projected energy alongside pointing and VAM, including charging during idle commands. Do not assume a full battery at each two-minute segment or silently modify the onboard TEL between contacts. Preserve current/next commitments; report an infeasible locked command rather than substituting another target.
- Energy remains a feasibility constraint; category priority remains the scheduling objective. Do not introduce a revenue/energy weighting or a new player control in this slice. Keep existing automatic-planning opt-in, completion/input triggers, and two-minute refreshes. Coalesce an additional refresh on power depletion/recovery or changes to power configuration at reset; battery updates on every interval do not each trigger replanning.

### Starter scenario and examples

These agreed values are synthetic fixtures for implementation and playtesting, not spacecraft specifications or final balance. Use 500 Wh capacity, 400 Wh initial charge, 100 Wh reserve, 150 Wh restart charge after depletion, a 10 Wh downlink restart margin, 300 W sunlit generation, 50 W housekeeping, 250 W additional capture load, and 150 W additional downlink load. Capture load includes the current combined slew/collection duration. Generation and loads are fixed for a run; changing the configuration requires reset in this slice.

### Example outcomes to verify

- **Sunlit Standby:** net charging is 250 W; ten minutes adds 41.667 Wh until capacity is reached. Excess generation is discarded.
- **Eclipse Standby:** ten minutes consumes 8.333 Wh. Housekeeping may cross reserve. At zero it is shed; in uninterrupted sunlight, charging from zero to the 150 Wh restart threshold takes 30 minutes while depleted.
- **Capture with insufficient projected energy:** a 45-second capture command in eclipse needs 3.75 Wh, including housekeeping. Starting at 102 Wh fails the reserve check; starting at 104 Wh succeeds and ends at 100.25 Wh. The rejected slot uses only 0.625 Wh of housekeeping, creates no image, and leaves VAM and pointing unchanged.
- **Capture during a ground contact:** simultaneous sunlit capture/downlink draws 450 W against 300 W generation, draining 2.5 Wh per minute. Downlink pauses first if it would consume protected energy. Full delivery stops radio load immediately; no energy is charged for unused contact time.

### Review status and remaining scope

The user approved minimum-charge admission, the failed-slot behavior, energy protection for current/next captures, downlink precedence and restart margin, depletion/restart behavior, powered contact-entry upload, and the synthetic starter values on 2026-10-14. The [OPS-01B implementation and verification guide](OPS_01B_POWER_DESIGN.md) records the staged implementation and acceptance checks. Final balancing and future interruption sources remain open.

The first slice should include one deterministic spacecraft energy state, sun/eclipse charging, housekeeping and capture loads, contact downlink load, shared planning/execution feasibility, a visible low-energy/Standby reason, and replay tests across different time-step sizes. Leave power-aware procurement, battery aging, panel pointing, thermal effects, equipment faults, and multi-spacecraft power policy for later work.

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
- For each cell-category, calculate maximum payout by multiplying the applicable market unit price by the eligible area or feature count in that cell. Multiply that maximum payout by the category's VAM to get its currently available payout. Sum the available category payouts to get the cell's potential sale value. Credit revenue only when imagery is downlinked. The prototype quote is fixed at successful capture completion; final price and refresh balance remain **Open**.
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

#### Agreed imagery retention and delivery (2026-10-13; prototype policies approved 2026-10-14)

- Revenue is realized when imagery is downlinked, superseding the earlier payment-at-capture rule. Imagery deleted before delivery produces no revenue.
- When onboard storage is constrained, delete imagery according to a retention score captured at successful image creation. The prototype score is the cell priority at capture completion; changing player priority later does not change stored scores, and the initial slice has no retention override. Delete the lowest score first, breaking ties by oldest capture and then image ID. Include a newly created image in the same comparison. Storage pressure is handled through deletion rather than a blanket stop on collection.
- Storage capacity and image data size are configurable scenario inputs and remain open for balance. Transfer onboard images FIFO by capture time then image ID; partial bytes persist across contacts; full delivery settles once and removes the image from active storage while retaining its lifecycle record for reporting. Partial transfer earns no revenue. The quote is frozen at successful capture completion using current market rates and pre-reset VAM; market changes do not reprice it. The Orders preview can still settle an image instantly as a clearly labeled shortcut.
- **Prototype implementation:** Captures create identified onboard images and reset recovery without cash. Live transfers progress only during available station contacts at the configured downlink rate. Storage uses a configurable 100 MiB per-spacecraft prototype capacity with 10 MiB sample images. These sample sizes and capacity are not final gameplay balance.

#### Agreed operational closure policies (approved 2026-10-14)

These prototype policies resolve operational gaps while leaving tunable values and future systems open.

- **CELL-04A capture execution:** Treat a started whole-cell collection as one non-interruptible TEL command. If the shared execution check rejects it, consume the scheduled command duration, report the failure at its completion boundary, create no image, and do not reset cell recovery; continue with the next command and let CELL-04B refresh afterward. A ground edit never interrupts onboard work. Power loss, spacecraft faults, and manual aborts remain future interruption sources. Keep the current cell-center, start/end access checks and configurable scenario limits as prototype approximations; continuous access and final geometry remain open.
- **OPS-03 contact synchronization:** Treat overlapping or back-to-back available station windows for one spacecraft as one contact episode. Upload the latest ground TEL once when the first allocated antenna link in that episode begins; revisions made during the episode wait until all contact windows close and a later episode begins. Upload and downlink remain simultaneous. Do not add together overlapping station bandwidth: the prototype uses the fastest currently allocated single station link for downlink.
- **Multi-spacecraft station access (approved 2026-10-15):** Each ground station has one prototype antenna, serving one spacecraft at a time. The spacecraft whose available pass begins first holds the antenna until its pass ends. Then hand it to the earliest waiting spacecraft still in view; simultaneous starts use spacecraft ID order. A waiting spacecraft cannot upload or downlink through that antenna. Show the current owner and waiting spacecraft in Ground Stations and spacecraft status. A spacecraft may use another available station, and imagery transfer still selects one fastest active link.
- **OPS-01A image retention and transfer:** Snapshot cell priority at capture completion as the image's retention score; do not retroactively change an existing image's score when player priorities change, and provide no retention override in the initial slice. Evict the lowest score first, then oldest capture, then image ID; include a newly captured image in that comparison. Transfer onboard images FIFO by capture time then image ID, persist partial bytes across contact episodes, and remove a fully delivered image from active storage. Keep prototype capacity and image sizes as configurable scenario values rather than gameplay decisions.
- **CELL-02A image value and payment:** Freeze the image's payout quote at successful capture completion using the then-current market rates and pre-reset VAM. Pay nothing for partial transfer; credit the frozen quote exactly once on full delivery. An image deleted before full delivery earns no revenue; delivered imagery leaves active storage but its lifecycle record remains available for reporting. Changes to market prices or VAM after capture do not reprice that image.

Open: final cell-access geometry and physical interruption sources; storage capacity and image-size balance; and whether ground planning should forecast multi-spacecraft antenna queues. These open choices do not block using the approved policies for the current prototype.

#### Agreed scheduling behavior

- Scheduling uses both geometry and time. Geometry determines which cells are in a satellite's reachable observation opportunities; timing determines whether the satellite can turn, collect, and finish before that opportunity closes. The player's category priority rates determine which feasible work is most valuable to schedule.
- The player does not choose among scheduler algorithms or use a separate "emphasis" control. Category priority rates already express the player's scheduling strategy.
- While a collection is underway, the scheduler must identify and hold the next collection target. It may reconsider targets after that one. In other words, the current collection and the next collection are committed; later collections in a plan are tentative.
- Use a two-simulation-minute optimization window to bound the number of collection combinations considered in one scheduling segment. This search window is separate from TEL duration. Advance through successive segments to build the longer schedule; segments can extend or revise tentative collection choices. Every segment must remain feasible from the cell immediately before it, using that collection's actual or planned completion state. Revisions must also preserve compatibility with any retained continuation.
- Use the current collection, slew, and locked next collection's execution time to calculate and refresh the plan. Have the next target ready when it is needed; do not insert extra simulated waiting solely for schedule computation.
- Treat the Task Event List (TEL) as the executable plan stored onboard the satellite. Ground-side Greedy/Beam scheduling produces TEL updates, but the satellite receives new or revised events only during contact with an available ground station. Between contacts it follows its onboard TEL; changes to player priorities, market data, or other new information do not silently alter the onboard plan before an upload.
- If the onboard TEL has no remaining events, the satellite enters **Standby** until it receives an updated TEL at a ground-station contact. Additional real-world safe-mode behavior is outside the simulation's current scope.
- At contact, the ground station uploads a TEL containing commands to operate the satellite all the way to the next contact. Build that duration by progressing through short optimization segments; it is not a single two-minute TEL or one exhaustive search over the entire interval. Behavior when no next contact is available, or when a predicted contact is missed, remains **Open**.
- **Proposed capture prototype:** Orders can add selected cells to an authored ground TEL. The draft forecasts the next available contact and sequences each target from the prior command's completion and pointing. Uploaded capture commands use a shared cell-center access and slew calculation; a successful command creates onboard imagery and resets recovery, while an access or timing failure creates no image and does not reset recovery. A started capture runs to its command boundary; an infeasible command consumes that duration and reports failure there. The current demonstration settings (25° off-nadir, 45-second collection, sunlight ignored) are provisional only. Final access geometry, sunlight rules, duration, and future interruption sources remain **Open**.
- **Scheduler prototype:** The selected spacecraft's Spacecraft view can generate a greedy ground TEL spanning its next two available contacts. It searches in two-minute segments, samples candidate opportunities every 60 seconds, ranks by projected available priority at completion, carries planned VAM resets and pointing into later segments, and emits explicit idle commands when no positive-priority feasible target is available. Ties use priority, earliest start, then cell ID. Orders remains the place to select cells and add individual capture commands to the authored draft. After explicit Generate opt-in, CELL-04B refreshes the ground continuation automatically and preserves active/next capture work through contact upload. Search quality, final segment tuning, and balance remain **Open**.
- A contact may upload a TEL and downlink imagery at the same time. Downlink throughput constrains how much imagery reaches the ground and may leave data onboard or result in imagery loss, creating a tradeoff between accepting loss and investing in more contacts, bandwidth, or transfer time. The prototype uses station downlink rates; whether TEL upload has any transfer cost or duration remains **Open**.
- The satellite accumulates imagery onboard between contacts and deletes imagery under storage pressure using the approved prototype retention policy above. Downlink determines when revenue is realized; more contacts, bandwidth, or contact time can deliver imagery before it is discarded. Capacity and image-size balance remain **Open**.
- The planner may maintain a tentative continuation beyond the events currently committed onboard. Contact is the synchronization point at which the satellite can receive that continuation or revisions. The precise division between ground-side planning, onboard execution/autonomy, and replanning between contacts remains **Open**.
- The segment boundary and overlap remain **Open**. The implementation proposal is to begin the first optimization window after the locked next collection's completion, then advance the scheduling cursor through later segments using each preceding collection's completion state. The scheduler can build these future segments ahead of execution; it need not wait for simulation time to reach each one.
- A plan's main objective is the total available priority points expected from feasible collections completed in its lookahead. Predict VAM at each planned completion and apply the shared cell timestamp behavior; only planned successful captures reset that cell's timestamp in the projected plan. Payout remains visible to the player but does not get multiplied into this scheduling score.
- A short, bounded search should compare several plausible target sequences instead of enumerating every possible combination. The first feasible target in the current ground-side plan is committed for that plan; the remainder may change as the satellite advances, new information arrives, or the player edits category priorities. Any changes to onboard execution take effect only after TEL upload at contact. Prefer a simpler, broadly sensible plan over a search that aims to guarantee a mathematically perfect schedule.
- **Agreed CLOUD-01 prototype weather:** Use NOAA/NCEI's [public ISCCP-H HGM Basic](https://www.ncei.noaa.gov/products/international-satellite-cloud-climatology) monthly mean cloud amount, averaged by calendar month over 1984–2013. The source is already a global 1° equal-angle grid. Start the scenario calendar at 2026-01-01 00:00 UTC. Store cloud cover in whole percentage points (0–100). Generate deterministic hourly 1° actual cover using a coarse 5° region component shared for six simulation hours plus smaller 1° hourly variation; use 12 and 8 percentage-point standard deviations. For each targeted ¼° market cell, add a deterministic child draw with 12 percentage-point standard deviation around its parent. Clamp to 0–100. Key each draw by scenario, weather-data version, grid position, and time bucket so replay and lookup order do not change the result.
- **Agreed CLOUD-01 prototype outcomes:** Evaluate usability at capture completion from the time-weighted mean cloud cover during collection only; an image is usable at 60% or less. A weather failure consumes the scheduled command time and admitted power, creates no image or revenue, and does not reset VAM. Existing pointing and later command times remain as if the collection command ran. Do not add an automatic retry or cooldown; the planner may consider the cell again at a later opportunity. The planner receives a separate imperfect hourly forecast based on the shared six-hour pattern plus keyed error that grows with lead time; it uses four coarse cloud-risk weights (4 for clearer to 1 for cloudier) rather than precise probability calculations. Prototype tuning uses cover bands of <=40, 41–60, 61–80, and >80%, with forecast error spreads of 12, 20, and 28 percentage points for lead times through 6h, through 24h, and beyond 24h. These weights affect scheduling only; forecasts do not reveal actual weather.

#### Proposed scheduling method

1. Generate candidate cell opportunities in the two-minute lookahead using predicted satellite position and the current access and pointing limits.
2. Reject sequences that cannot fit the required turn and collection durations inside each opportunity. These limits and durations are still to be designed.
3. Start with a quick greedy feasible plan, then use a bounded beam search: extend a limited set of the best partial sequences with promising next cells, and stop at the horizon or a fixed search budget. Keep the greedy result as a known feasible fallback. Current prototype limits and replacement checks are in the [CELL-04C guide](CELL_04C_DESIGN.md); these are tuning choices, not gameplay rules.
4. Compare sequences by total expected available priority. Candidate ranking may retain a mix of high-priority, nearby, and soon-to-close opportunities so the search does not ignore convenient multi-cell sequences. Lower total turning and waiting time can break ties.
5. Extend or revise the tentative ground plan in successive short segments until it covers the next contact. Seed each segment with the preceding collection's completion time, pointing, and relevant projected state. Revalidate transitions into and out of a revised segment. Preserve the current and locked next collection; revisions affect onboard commands only after upload at contact. Show an understandable reason for the next choice and notable skipped alternatives where the interface supports it.

If cloud forecast data is available, one proposed comparison is `available priority × estimated probability of a usable capture`. This estimate affects selection only; it does not change the displayed cell priority or the payout formula. Do not reroll the same forecast every time the scheduler revisits a candidate. The weather model, forecast accuracy, cloud threshold for a usable whole-cell image, effects of failure on time/resources, and retry policy remain **Open**.

#### CELL-04B automatic continuation — approved prototype baseline

- Keep one deterministic ground-side planner per spacecraft. Rebuild the tentative continuation after a capture command completes or fails, after player priority or other scheduling inputs change, and at each two-minute simulation-time planning boundary while automatic scheduling is active. Coalesce triggers at the same simulation time. Planning uses simulation state and must not depend on renderer frames or wall-clock timing.
- Keep initial plan generation explicit through the existing Spacecraft action. Once a player has created the first schedule, later refreshes are automatic; the player does not need to press Generate again after each contact.
- Preserve the currently executing capture and the next not-yet-started capture as committed work. Preserve the next target's planned start and required wait as needed for feasibility. Later collections are tentative. When the active capture completes, promote the locked next capture and refresh only work after it. If no capture is active, the first future capture is the locked next collection.
- Build each revised continuation from the committed collection's projected completion time, pointing, and projected VAM resets. Revalidate the transition into the revised suffix and retain the previous feasible suffix if no valid replacement can be produced. Do not insert simulated delay for planning.
- Synchronize at most once at the start of each distinct available contact, matching OPS-03. A ground revision made after that contact has started waits for the next distinct contact. At upload, preserve active and locked work and replace only the tentative suffix. A priority or market change cannot silently alter the onboard TEL.
- If no second available contact is predicted within the current 48-hour horizon, leave the previous ground continuation and onboard TEL unchanged rather than uploading an empty replacement. If the onboard TEL runs out, retain the existing Standby behavior until the next available contact.
- If new scores make a locked target less valuable, keep it committed. If the shared execution feasibility check rejects it when it runs, report the existing failure reason and then refresh the tentative continuation. Do not silently substitute another target for a locked collection.
- This baseline is approved for the prototype. Final operating balance remains open, including contact geometry, capture capability, and scheduler search quality. A contact already in progress does not accept a revised plan; it waits for the next distinct predicted contact. When an idle/wait command is active, keep that active command and the next capture through its wait as committed work.

### Open design questions

- Whether to approve or revise the proposed sourced-attribute mapping and how overlapping features/categories are handled, including whether the same area can contribute to multiple categories.
- The starting market prices, player-set category priority rates, and refresh cadences, plus how market information changes over time.
- Whether later tuning should change the prototype's two-minute segments or [CELL-04C search limits](CELL_04C_DESIGN.md). The current planner rebuilds the full tentative suffix after locked work and carries feasibility forward from each segment's projected completion.
- How to handle a missing or missed next contact, or an uploaded TEL that becomes infeasible before the next contact.
- Whether TEL uploads have any meaningful size, duration, or resource cost; uplink speed is not currently expected to be a major constraint.
- Storage capacity and image sizes; future retention overrides; and projected storage effects on scheduler scoring.
- Satellite access geometry, pointing limit, slew speed, collection duration, and which changes are important enough to cancel or replace the locked next target.
- The idle reconsideration interval and the retry policy after a failed collection.
- How cloud conditions determine usable image quality, how imperfect forecasts feed the scheduler, and how failure affects time and spacecraft resources.
- Final storage/downlink costs and capacity balance. Prototype quotes are fixed at successful capture completion and settle only on full delivery; revenue is realized only on downlink.
- Whether customer contracts, deadlines, or named monitoring sites should be added as an optional layer later.
- Where and how to present category rates, per-cell exposures and revenue contributions, calculated gross cell value, and any repeat-purchase/freshness state, including heat-map normalization.

**Agreed delivery priority (2026-10-06):** Cell dollar values and a manual collection/recovery preview are visible in Orders. [Pending Changes](PENDING_CHANGES.md) records CELL-03A/B as implemented. The sample rates are **Proposed** preview inputs, not approved game balance; preview controls do not define satellite access rules. Market prices and cadences remain read-only to the player; category priority rates remain the intended scheduling controls.

**Implemented inspection views (2026-10-16):** Orders now offers globe color modes for maximum priority at VAM 1, current available priority, and current available dollar value. Current priority uses a yellow-to-teal sequential ramp; priority and value use a shared logarithmic, scenario-wide reference ceiling so colors stay comparable while panning. Scheduled cells are coral; the active capture cell and satellite-to-cell line are yellow. Exact selected-cell values remain in the detail panel. This visualization slice is documented in [Cell visualization design](CELL_VISUALIZATION_DESIGN.md); palette contrast and any future multi-spacecraft comparison remain open for playtesting.

The current prototype exposes the geographic grid in Orders and on the globe, with sourced city, port, per-cell urban footprint area, border, coast, cropland, pasture, power plant, major oil pipeline, military installation, data-center, NOAA research-site, and UNESCO World Heritage attributes. Large urban footprints span their mapped cells; a city-point population label does not concentrate the entire city's market value in one cell. Proposed normalized category exposures and sample-priced values are inspectable in Orders. The app connects the market model to simulation time, executes captures from uploaded TELs, and can manually generate a greedy ground plan. Automatic recurring replanning and market trends remain unimplemented. See [Cell grid data](CELL_DATA.md) for source coverage, candidate category mapping, and limits.

## Orbital maneuvers — agreed direction, design in progress

- Players can request target altitude and inclination changes. Show estimated fuel cost and time to the new orbit before they submit.
- Collision avoidance and orbital maintenance can run automatically. Show each burn's cause, timing, and fuel use to the player.
- For the first prototype, maintenance may use a regular fuel deduction, while COLA checks each spacecraft once per game day for a small chance of a maneuver. These rules are simple and tunable; the player sees each resulting event.
- Orbital transitions may use a simplified model; exact spacecraft dynamics are not a goal.
- The prototype approach and remaining choices are in the [FLEET-03 orbit maneuver design](FLEET_03_ORBIT_MANEUVER_DESIGN.md).

## Company finances — BIZ-01 prototype

Revenue enters company cash only when an image is fully downlinked, using its frozen capture-time quote. The ledger shows this income alongside daily sample operating charges of $100 per configured spacecraft and $25 per configured ground station. Cash may become negative; show a warning without stopping routine operations or settlement. Starting funds and purchases belong to BIZ-02. See the [BIZ-01 finance design](BIZ_01_FINANCE_DESIGN.md).

## Company growth — BIZ-02 prototype

The player can buy and immediately launch the standard spacecraft for $50,000,000, with $0 launch cost, after choosing altitude, inclination, ascending node, and phase at launch. The editable fields offer the current starter orbit as a suggestion. Purchases require sufficient cash; the prototype begins at -$50,000, so the initial spacecraft must earn revenue before another launch. Keep those sample values configurable. The separate $100 spacecraft-day cost represents general mission operations, not propellant or a performance penalty; a new spacecraft first incurs it at the next simulation-day boundary, without proration. See the [BIZ-02 design](BIZ_02_GROWTH_DESIGN.md).

**Agreed spacecraft upgrade boundary:** A spacecraft's installed hardware and designed capabilities are fixed once it is in orbit. Upgrades equip new spacecraft; they never retrofit an existing spacecraft. The first planned upgrade slice is the slew improvement in FLEET-02B. A broader selection of upgrade options for new spacecraft is a later expansion. Operational state, TEL updates, and orbital maneuvers follow their own agreed rules.

**FLEET-02B approved prototype, 2026-10-16:** Offer Enhanced slew on each new spacecraft for a $5M surcharge: 2 degrees/second with 2 seconds settling time. Retain the standard package's other subsystem settings and $100 daily operating charge. The standard option remains $50M at 1 degree/second and 2 seconds settling time; Enhanced totals $55M with the existing $0 launch cost. These are configurable starter values for later tuning. The selector, purchase quote, per-spacecraft equipment snapshot, readout, and itemized ledger entry are implemented; focused behavioral verification remains pending. The [FLEET-02B handoff](LAYER_3_PLAN.md#fleet-02b-design-brief) records acceptance checks. Begin playtesting the existing single-spacecraft revenue loop without waiting for a broader hardware catalog.

## Open design questions

- What is the basic time unit, and how does the player advance or accelerate time?
- How should sourced cell attributes map into market categories and their price/priority units?
- Which design choices belong in the first satellite builder, and which use defaults?
- Which storage/downlink/processing costs apply, and how should the imagery delivery and revenue rules handle partial transfers and deletion?
- What anomaly information is immediately visible, and what requires diagnosis?
- Which routine decisions can be expressed as simple operating priorities?
- What is the first meaningful growth choice after the initial satellite is operating?
