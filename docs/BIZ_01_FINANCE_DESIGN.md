# BIZ-01 company finances design

**Status: Prototype slice implemented 2026-10-15; BIZ-02 purchase flow integrated.** Company cash, revenue, operating expenses, capital procurement, and the approved opening funds flow through one auditable ledger and Finance & Growth view. Opening cash is -$50,000.

## Goal

Connect operational results to company cash so the player can understand what earned money, what cost money, and the current balance. Keep this layer independent of UI and make it the only place that aggregates company income and expense.

## Existing boundary

Previously, `CellMarketState.downlinkImage` settled an image and updated its own cash counters. BIZ-01 moves cash ownership into `CompanyFinance`; image settlement now creates the single financial revenue entry while preserving the exactly-once full-delivery trigger. Capture quotes, onboard potential value, and deleted-image losses never enter cash.

## Proposed first-slice model

### Ledger and balance

Use an append-only sequence of financial entries. Each entry has a stable ID, simulation timestamp, type/category, signed amount, and a short source reference (for example, image ID, spacecraft ID, or station ID). Cash is the configured starting balance plus the sum of entries. Identical repeated IDs are idempotent; conflicting duplicate IDs are rejected so replaying a settlement or cost event cannot change cash twice.

Record revenue from the existing `image-downlinked` event using its frozen capture-time quote. Record costs as separate entries. Keep starting cash as a scenario input rather than choosing a balance here. Retain image lifecycle history as the operational source; the finance ledger references settlement IDs instead of creating a second payment path.

### Operating costs — proposal

For an initial playable economy, charge simple recurring operating costs daily, with configurable rates for each configured spacecraft and ground station. Generate entries at exact day boundaries as time advances so large and small time steps produce the same ledger. These costs are placeholders for balance and should be visible as their own categories. The sample rates are $100 per spacecraft-day for general mission operations and $25 per station-day; they are intentionally simple values, not real-world operating costs. The spacecraft charge does not consume propellant or affect performance. Also charge each station's independently configured per-minute rate while its antenna is assigned to a spacecraft; the current sample rate is $100 per contact minute.

Allow cash to fall below zero and show a clear low/negative-cash warning. Do not stop routine operations or downlink settlement because of a negative balance. Purchases and other discretionary spending can still validate affordability in BIZ-02.

Leave launch/purchase costs, financing, salaries, taxes, customer contracts, and costs for unmodeled services to BIZ-02 or later design. Do not charge for imagined infrastructure or add a cost category without an explicit gameplay purpose.

### Finance & Growth view

Show current cash, cumulative realized revenue, cumulative operating costs, and net operating result for the whole run. A compact ledger table should list time, category, source, and amount. The Summary view may surface current cash and a small attention indicator for low or negative cash. Growth purchases belong to BIZ-02, not this slice.

## Technical shape

- Keep finance state and accrual rules in a renderer-independent simulation module.
- Consume operational settlement events once; do not let both imagery and finance independently credit cash.
- Process recurring charges at known simulation-time boundaries, preserving chronological event order with operations.
- Derive displayed totals from the ledger, or cache them only with a single tested update path.
- Reset should restore scenario starting cash and clear finance entries along with the operational scenario.
- Keep amounts in integer cents or another explicitly defined money unit to avoid floating-point drift; the chosen representation should remain consistent with the current dollar quote interface.

## Implemented prototype behavior

- Charges $100 per configured spacecraft-day and $25 per configured ground-station-day at exact simulation-day boundaries. Rates are centralized, integer-cent configuration values and remain sample balance inputs.
- Charges each station's configured contact rate for antenna-assigned contact intervals. Cumulative sub-cent fractions are rounded to the nearest cent; current stations use $100 per contact minute.
- Credits a frozen image quote once on full downlink; capture, partial transfer, and deletion create no cash revenue.
- Allows a negative balance and shows a warning while routine operations continue.
- Finance & Growth reports whole-run cash, net cash movement, realized revenue, operating costs, capital spending, net operating result, and a newest-first ledger with timestamp, category, source, and amount.
- Reset restores the configured starting balance and clears ledger/cost history. BIZ-02 adds the standard spacecraft purchase flow, editable pre-launch orbit, live fleet views, and reset of purchased assets; see the [growth design](BIZ_02_GROWTH_DESIGN.md).

Later asset lifecycle rules may decide how decommissioned spacecraft and stations affect future charges. Current configured assets remain in operation for the prototype scenario.
