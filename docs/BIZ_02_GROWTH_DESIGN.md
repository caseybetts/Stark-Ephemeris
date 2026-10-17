# BIZ-02 company growth and procurement design

**Status: Implemented prototype; TypeScript and production build pass.** Company finance accepts the approved -$50,000 starting cash and records affordability-checked capital procurement separately from operating costs. `OperationalLoop.registerSatellite` adds an initialized spacecraft to runtime, ground operations, storage, and power. Finance & Growth offers editable orbit inputs and immediate purchase/launch for Standard or Enhanced slew packages at $50,000,000 and $55,000,000, with $0 launch cost. The app updates spacecraft rows, globe markers/orbit paths, operational controls, and reset state. Focused behavioral review remains pending; growth values are configurable and unbalanced.

## Goal

Make company growth a clear management choice: see what a purchase costs, whether it is affordable, and what operational capacity it adds. Keep the first step small enough to connect cleanly to the existing per-spacecraft simulation.

## Existing boundary

The app starts with Asteria-1. `SatelliteDefinition` carries per-spacecraft orbit and slew settings, and world snapshots are calculated independently. Launched spacecraft start with empty storage, an independent power state, and no uploaded TEL; the running loop and globe update without resetting existing assets.

The first BIZ-02 slice began with one standard package. FLEET-02B now adds a per-spacecraft Enhanced slew choice at procurement. Each launched asset keeps its purchased specification; its upgrade applies only to that spacecraft and never retrofits earlier launches.

## Implemented first playable slice

### Purchase choice

Offer a **Standard** or **Enhanced slew** package. Before each launch, the player chooses altitude, inclination, ascending node, phase, and slew package. Orbit fields begin with Asteria-1's current 550 km / 53° / 12° / 8° orbit and remain editable. Do not apply an automatic phase offset; the player can choose an orbit that repeats or spaces their fleet. Launch immediately after purchase. Allow repeat purchases when affordable; do not impose an arbitrary fleet cap.

Show spacecraft, upgrade, and launch prices, the recurring spacecraft cost, current cash and affordability, selected slew capability, and editable orbit before the player submits the launch. Keep package values configurable. Do not add financing, customer contracts, ground-station construction, or hardware that has no modeled operational effect.

### Purchase and launch

Buying a package launches it immediately; skip manufacturing queues and launch windows. Show spacecraft, upgrade, and launch prices separately, then record them together as one idempotent procurement transaction. A successful transaction assigns a stable new spacecraft ID, snapshots its selected equipment, adds its definition to the fleet, and makes it available to the simulation. Failed affordability checks leave cash and fleet unchanged. Routine operations continue if ongoing expenses later push cash below zero; the agreed BIZ-01 warning remains in effect.

Treat spacecraft, upgrades, and launch as capital spending, not operating costs. They reduce available cash and appear as separate line items in one ledger entry, but remain separate from BIZ-01's recurring operating-cost and net operating-result totals. Show total cash movement separately so balances reconcile.

### Finance & Growth view

Extend the existing view with the available package, cost breakdown, current affordability, and a purchase action. Add a capital-spending procurement category with spacecraft and launch line items. Show the new spacecraft in the existing fleet and orbit views, and include the fleet count in Summary. Derive all values from company and fleet state; do not maintain separate UI-only balances.

## Implementation slices

1. **Implemented:** Accept the signed opening balance and provide affordability-checked capital accounting with spacecraft and launch line items.
2. **Implemented:** Register a spacecraft across runtime, ground planning, imagery capacity, and power; reset restores the initial fleet.
3. **Implemented:** Connect the editable orbit choice to procurement and launch a stable-ID spacecraft immediately.
4. **Implemented:** Refresh spacecraft rows, orbit rendering, operational controls, station occupancy, and reset after launch.

## Implementation handoff and review gates

The user's standard-package choice explicitly leaves upgrades for later. FLEET-02B is a follow-on task, not an approval dependency for BIZ-02. Financing, growth unlocks, maneuvering, and a hardware builder are also outside this slice.

### Required implementation details

- `CompanyFinance` now accepts signed starting cash while keeping revenue and purchase-price validation non-negative. The opening balance is neither revenue nor an operating expense. Use safe integer cents throughout: the spacecraft costs 5,000,000,000 cents, so do not use 32-bit integer coercion.
- Preserve the one-spacecraft start with Asteria-1. Opening cash does not buy or charge for that existing spacecraft. The negative starting balance is a balance value, with no implied loan interest or repayment mechanic.
- Reconcile cash as opening balance + realized revenue - operating costs - capital spending. `CompanyFinance.recordSpacecraftProcurement` records one procurement entry with spacecraft/launch line items and the new spacecraft ID; zero launch price is valid. Capital spending and net cash movement appear separately from operating totals. Classify totals by entry kind, not amount sign.
- Make purchase a command at the current simulation time. Process existing due costs through that instant, recheck cash, then validate the selected orbit and subsystem configuration before posting one procurement entry and registering the spacecraft. An unaffordable or invalid request leaves the fleet unchanged.
- `OperationalLoop.registerSatellite` adds registration to runtime, ground planning, imagery, and power. Do not reconstruct the running loop to add a spacecraft: that would risk losing existing TELs, partial transfers, energy, and settlement history. Refresh globe visuals on launch/reset, not on render frames.
- New spacecraft start with their own configured energy, empty storage, and no onboard TEL. Automatic planning prepares their ground TEL as soon as the shared market is available; upload still waits for contact. They have no activity or cost history before launch. Preserve existing spacecraft state and selection; the new row must be selectable and operational controls must target its ID.
- Reset restores the initial fleet, opening balance, empty ledger, initial subsystem state, and initial selection. Remove purchased spacecraft from every subsystem and the globe, clear pending commands, and restore deterministic ID allocation. Normal additions must not reset any existing spacecraft.
- Keep the shared cell market and exactly-once image settlement. Verify deterministic ordering of simultaneous captures across spacecraft rather than creating a private market or duplicate revenue path for each vehicle. Fleetwide scheduling coordination is a later feature; independent plans can target the same cell.

### Agreed integrated launch behavior (2026-10-15)

These clarifications close the BIZ-02 integration questions and are implemented in the prototype.

1. **Daily charge:** The $100 spacecraft-day sample represents general mission operations. A new spacecraft joins full daily charges at the first simulation-day boundary after launch; there is no proration or back-charge. At a boundary, existing assets' charges are posted before a purchase at that timestamp.
2. **Orbit choice:** Altitude, inclination, ascending node, and phase at launch are editable in the pre-launch form. Suggested values use the current 550 km / 53° / 12° / 8° starter orbit. The player chooses each launch orbit; no automatic phase spacing is applied. The selected phase is converted to the epoch phase expected by the orbit propagator.
3. **Station access:** Each station antenna serves one spacecraft at a time. The earliest available pass holds it through that pass; on exit, the antenna hands off to the earliest waiting spacecraft still in view. Ties use spacecraft ID order. Waiting spacecraft cannot uplink or downlink through that antenna, and occupancy is visible in the station and spacecraft views. A spacecraft can use a different available station; imagery transfer still uses the fastest single active station link.

## Verification guide

- Run existing finance, operations, scheduler, power, and market regression suites plus the production build after integration. Add focused registration/procurement coverage to the existing test workflow.
- Opening balance is exactly -5,000,000 cents, displays a warning, and does not count as an expense. Normal downlink revenue and daily costs still work while cash is negative.
- Use an explicitly funded test scenario to exercise purchases without waiting for $50M of gameplay income. Exactly 5,000,000,000 cents buys one spacecraft and leaves zero; one cent less rejects without mutation. Do not alter the user's production economy for the test.
- One successful purchase produces one itemized capital entry, zero launch cost, and one registered spacecraft. Duplicate command delivery changes nothing; a second deliberate purchase works only if affordable. Invalid package state and injected preparation failure leave both finance and fleet unchanged.
- Launch immediately before, exactly at, and just after a day boundary. Check first full-charge timing, no historical costs, and large versus irregular time steps with purchases at the same timestamps.
- Launch after hours of existing operation. The new spacecraft starts at the quoted phase and configured charge, with no inherited imagery/TEL; existing charge, pointing, plans, partial downlink bytes, and cash history are preserved.
- Exercise two spacecraft in overlapping contacts: the earlier pass owns the antenna, the later waits, and a handoff occurs only if it remains in view; simultaneous starts use spacecraft ID order. Check automatic planning and independent uploads, power/imagery, shared-market capture ordering, and exactly-once settlement. Reset should remove all purchased entities.
- In the browser, inspect an unaffordable quote under normal starting funds, then an affordable purchase under the funded test fixture. Confirm the new row/marker/orbit, selection, automatic TEL planning, revenue/cost totals, and reset. Measure responsiveness with a small fleet; keep registration updates event-driven rather than rebuilding entities each frame.

## Economy and remaining scope

The chosen $50M growth price has not been balanced against current sample revenue. Starting at -$50,000 means earning at least $50,050,000 net of operating costs before the first purchase. Treat growth pacing as unverified and preserve these approved values; use funded fixtures for development. TUNE-01 owns eventual balancing.

The $50M Standard and $55M Enhanced prices remain intentionally unbalanced, and multi-spacecraft planning continues to use independent plans. Runtime antenna queues are shared, but future planner forecasts may need to account for contention. The Enhanced package is the first FLEET-02B slice; broader hardware selection remains later work.

## Completion check

An affordable purchase records capital costs once and adds a stable-ID spacecraft with the orbit selected before launch. An unaffordable purchase does not register a spacecraft. The player can inspect cost and orbit before launch; cash-flow and operating totals reconcile to the ledger. The production build passes; behavioral verification remains pending.
