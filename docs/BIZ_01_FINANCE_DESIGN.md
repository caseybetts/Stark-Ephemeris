# BIZ-01 company finances design

**Status: Updated 2026-11-02; BIZ-02 purchase and station maintenance flow integrated.** Company cash, revenue, owned-station upkeep, leased contact fees, capital procurement, and opening funds flow through one auditable ledger and Finance & Growth view. Opening cash is -$50,000.

## Goal

Connect operational results to company cash so the player can understand what earned money, what cost money, and the current balance. Keep this layer independent of UI and make it the only place that aggregates company income and expense.

## Existing boundary

Previously, `CellMarketState.downlinkImage` settled an image and updated its own cash counters. BIZ-01 moves cash ownership into `CompanyFinance`; image settlement now creates the single financial revenue entry while preserving the exactly-once full-delivery trigger. Capture quotes, onboard potential value, and deleted-image losses never enter cash.

## Current prototype model

### Ledger and balance

Use an append-only sequence of financial entries. Each entry has a stable ID, simulation timestamp, type/category, signed amount, and a short source reference (for example, image ID, spacecraft ID, or station ID). Cash is the configured starting balance plus the sum of entries. Identical repeated IDs are idempotent; conflicting duplicate IDs are rejected so replaying a settlement or cost event cannot change cash twice.

Record revenue from the existing `image-downlinked` event using its frozen capture-time quote. Record costs as separate entries. Keep starting cash as a scenario input rather than choosing a balance here. Retain image lifecycle history as the operational source; the finance ledger references settlement IDs instead of creating a second payment path. Purchases of spacecraft and additional ground stations are capital spending, recorded once and separately from operating costs.

### Operating costs — approved prototype rule

Do not charge spacecraft daily costs. Owned ground stations incur their configured maintenance cost once per simulated day whether used or idle; the first day is prorated to the station's activation time and posts at the day boundary. Owned stations do not incur per-contact fees. Leased stations have no upfront charge or daily maintenance; they incur the site's configured per-minute lease rate while an antenna is assigned, whether or not imagery is transferred. Capital purchases remain separate BIZ-02 expenses.

Allow cash to fall below zero and mark the low/negative balance in the Summary cash metric. Do not show a separate warning bar in Finance & Growth, and do not stop routine operations or downlink settlement because of a negative balance. Purchases and other discretionary spending can still validate affordability in BIZ-02.

Leave launch/purchase costs, financing, salaries, taxes, customer contracts, and costs for unmodeled services to BIZ-02 or later design. Do not charge for imagined infrastructure or add a cost category without an explicit gameplay purpose.

### Finance & Growth view

Show current cash, cumulative realized revenue, cumulative operating costs, and net operating result for the whole run. A compact ledger table should list time, category, source, and amount. The Summary view may surface current cash and a small attention indicator for low or negative cash. Growth purchases belong to BIZ-02, not this slice.

## Technical shape

- Keep finance state and accrual rules in a renderer-independent simulation module.
- Consume operational settlement events once; do not let both imagery and finance independently credit cash.
- Accrue owned-station maintenance at simulation-day boundaries, prorating initial partial days; charge leased contact intervals using simulation time and preserve cumulative sub-cent rounding across advancement steps.
- Derive displayed totals from the ledger, or cache them only with a single tested update path.
- Reset should restore scenario starting cash and clear finance entries along with the operational scenario.
- Keep amounts in integer cents or another explicitly defined money unit to avoid floating-point drift; the chosen representation should remain consistent with the current dollar quote interface.

## Implemented prototype behavior

- Charges owned stations $100–$250 per simulated day for maintenance and no per-contact fee. Initial partial days are prorated.
- Charges leased stations $110–$150 per contact minute while an antenna is assigned; idle leased sites incur no fee.
- Does not charge daily spacecraft operating costs.
- Records purchased ground stations as one-time capital spending; they enter contact prediction only after registration.
- Credits a frozen image quote once on full downlink; capture, partial transfer, and deletion create no cash revenue.
- Allows a negative balance and marks it in the Summary cash metric while routine operations continue.
- Finance & Growth reports whole-run cash, net cash movement, realized revenue, operating costs, capital spending, net operating result, and a newest-first ledger with timestamp, category, source, and amount; it has no separate negative-balance warning bar.
- Reset restores the configured starting balance and clears ledger/cost history. BIZ-02 adds the standard spacecraft purchase flow, editable pre-launch orbit, live fleet views, and reset of purchased assets; see the [growth design](BIZ_02_GROWTH_DESIGN.md).

Later asset lifecycle rules may decide how decommissioned spacecraft and stations affect maintenance and contact fees. Current configured assets remain in operation for the prototype scenario.

## Verification results (2026-11-02)

Focused runtime coverage confirms that owned-site upkeep posts once per simulation day and is invariant to large versus irregular time advances; activation halfway through a day charges half of the daily rate at that day's boundary. Reset clears upkeep entries and restores starting cash. A leased station bills its assigned contact interval and receives no daily maintenance charge. Finance and procurement checks pass 12/12; runtime, operations/weather, power, and cell regression suites pass 57/57; the production build passes. RUN-01 still requires a funded browser walkthrough and longer one-/two-spacecraft baseline measurements.
