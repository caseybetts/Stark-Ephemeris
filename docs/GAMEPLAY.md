# Gameplay brief

This document captures gameplay intent and current design agreements. It is a working brief, not a complete specification. Details marked **Open** need a design decision before implementation depends on them.

## Player role and growth arc

The player owns and operates an earth-imagery satellite startup. They begin with limited money and design their first satellite, using mostly default options. As the business grows, they move from spacecraft-level configuration toward fleet policies, launch planning, and choosing which customers and markets to pursue.

## Core loop

1. **Configure capacity:** Design or select satellites and set their operating priorities within the available budget.
2. **Run the operation:** Satellites capture imagery, use energy, and manage onboard data and downlinks. A successful cell capture earns its market sale immediately; storage and delivery are separate operating concerns rather than an archive-sales delay.
3. **Monitor outcomes:** Review operations, revenue, customer satisfaction, asset health, and anomalies.
4. **Resolve exceptions:** Diagnose or respond to issues that threaten service, equipment, or finances.
5. **Choose growth:** Reinvest in spacecraft, ground capacity, or the customer portfolio, then adapt operations to the larger business.

Routine operations should be able to run unattended for a while. The player should be able to intervene when an exception or strategic decision makes their attention valuable.

## Systems in the concept

These are intended subject areas; the specific formulas and interactions remain to be designed.

- **Satellite design:** A constrained set of hardware choices, with money as a major limit. Candidate dimensions include imaging capability, onboard storage, energy generation and storage, pointing agility, processing, communications, and expected service life.
- **Operations:** Capture opportunities, power use, onboard storage, and downlink availability.
- **Data and value:** A successful capture realizes the cell's currently available market value immediately; the game has no archive market for selling old imagery later. Whether raw image data still occupies storage or incurs transfer/processing costs is a separate operational rule.
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
- For each cell-category, calculate maximum payout by multiplying the applicable market unit price by the eligible area or feature count in that cell. Multiply that maximum payout by the category's VAM to get its currently available payout. Sum the available category payouts to get the cell's sale price. Credit that revenue to company money when collection succeeds; delivery or archive sales are not prerequisites for this payment.
- A category's market price and refresh cadence are market information, not player controls. Market changes over time are visible in the readout.

#### Agreed value and priority recovery curve

- Use a **Value Availability Multiplier (VAM)** for the available fraction of both a category's maximum cell payout and its maximum cell priority points. VAM is dimensionless and ranges from 0 to 1. The market determines the payout rate; the player sets the category priority rate.
- A never-collected cell starts at VAM 1. After a successful whole-cell collection, let `elapsed` be simulation time since that cell's last successful collection and `cadence` the category's current customer refresh duration. The minimum refresh period is 10% of that cadence.
- VAM remains 0 while `elapsed <= 0.1 × cadence`, increases linearly from 0 to 1 between `0.1 × cadence` and `cadence`, then remains 1 once `elapsed >= cadence`:

  `VAM = clamp((elapsed - 0.1 × cadence) / (0.9 × cadence), 0, 1)`

- For a 100-day cadence, VAM is 0 through day 10, then rises linearly to 1 at day 100. Use explicit simulation durations such as seconds, minutes, hours, and days; “month” is not a simulation unit. The UI may format durations for readability.

- The category's maximum payout for a cell is its applicable market unit price multiplied by that cell's eligible area or feature count. Its available payout is `maximum payout × VAM`. Sum available category payouts for the cell. Credit that amount immediately when collection succeeds.
- The player sets an editable priority rate in points per matching unit for each category (for example, points/km² or points/pipeline). A cell-category's maximum priority is `player-set category priority rate × cell exposure`; its available priority is `maximum priority × VAM`. Sum the available category priority points to get the cell's priority score.
- Category priority rates are the player's scheduling control. There is no separate category/cell emphasis control. These rates do not alter market prices, refresh cadences, or payout amounts. VAM scales market payout and player-set priority in parallel, so a cell-category's contribution to either is reduced until its refresh curve recovers.
- A successful whole-cell collection resets one `lastCollectedAt` timestamp for that cell. All category contributions in the cell use this same elapsed time, while each category applies its own cadence and derives its own VAM. Collecting a mixed cell also resets its slower-refresh categories; this is an accepted consequence of whole-cell collection.
- Recalculate VAM immediately when simulation time, market cadence, or player-set priority rates change. Treat payout and priority points as calculated values, not stored balances. An optional cell-level `atMaximum` cache is true only when all contributing categories are fully recovered; invalidate it whenever relevant market data changes.
- A successful collection completion calculates and records the payout, credits company money once, and resets the cell timestamp as one operation. A failed collection does not pay or reset the cell.

#### Open curve parameters and scheduling rule

How the scheduler ranks available cell priority against access, collection time, satellite constraints, and payout remains **Open**. The player-set category priority rates themselves are the priority controls; there is no additional emphasis setting.

### Open design questions

- Whether to approve or revise the proposed sourced-attribute mapping and how overlapping features/categories are handled, including whether the same area can contribute to multiple categories.
- The starting market prices, player-set category priority rates, and refresh cadences, plus how market information changes over time.
- How the scheduler ranks total available category priority points against access, collection time, satellite constraints, and payout.
- How collection time and image quality affect the immediate payout, and how storage/downlink costs or capacity remain relevant after sale.
- Whether customer contracts, deadlines, or named monitoring sites should be added as an optional layer later.
- Where and how to present category rates, per-cell exposures and revenue contributions, calculated gross cell value, and any repeat-purchase/freshness state, including heat-map normalization.

**Agreed delivery priority (2026-10-06):** Cell dollar values and a manual collection/recovery preview are visible in Orders. [Pending Changes](PENDING_CHANGES.md) records CELL-03A/B as implemented. The sample rates are **Proposed** preview inputs, not approved game balance; preview controls do not define satellite access rules. Market prices and cadences remain read-only to the player; category priority rates remain the intended scheduling controls.

**Agreed future inspection tools (2026-10-06):** The Cell table should eventually sort and filter on cell dollar value, maximum priority, and current/available priority, alongside geographic attributes. Globe cells should offer color modes for those same three metrics so players can compare market payout potential with the scheduling score. Maximum priority is calculated at VAM 1; current priority applies the categories' current VAM values. Exact color ramps and numeric normalization remain open presentation choices.

The current prototype exposes the geographic grid in Orders and on the globe, with sourced city, port, per-cell urban footprint area, border, coast, cropland, pasture, power plant, major oil pipeline, military installation, data-center, NOAA research-site, and UNESCO World Heritage attributes. Large urban footprints span their mapped cells; a city-point population label does not concentrate the entire city's market value in one cell. Proposed normalized category exposures and sample-priced values are inspectable in Orders. The app connects the market model to simulation time, but has no automatic capture or market trend simulation yet. See [Cell grid data](CELL_DATA.md) for source coverage, candidate category mapping, and limits.

## Open design questions

- What is the basic time unit, and how does the player advance or accelerate time?
- How should sourced cell attributes map into market categories and their price/priority units?
- Which design choices belong in the first satellite builder, and which use defaults?
- Which storage/downlink/processing costs or capacity constraints apply after a cell's market sale is realized immediately?
- What anomaly information is immediately visible, and what requires diagnosis?
- Which routine decisions can be expressed as simple operating priorities?
- What is the first meaningful growth choice after the initial satellite is operating?
