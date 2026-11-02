# BIZ-02 company growth and procurement design

**Status: Implemented prototype; focused procurement checks, funded browser walkthrough, and production build pass.** Company finance accepts the approved -$50,000 starting cash and records affordability-checked capital procurement separately from operating costs. `OperationalLoop.registerSatellite` adds an initialized spacecraft to runtime, ground operations, storage, and power. Finance & Growth offers editable orbit inputs and immediate purchase/launch for Standard or Enhanced slew packages at $50,000,000 and $55,000,000, with $0 launch cost. Four additional inactive ground station options can be purchased or leased into the live network. The app updates fleet/station tables, globe markers, operational controls, and reset state. Growth balance remains open.

## Goal

**Direction update (2026-11-02):** This document describes implemented continuous-prototype procurement. The [challenge flow](GAMEPLAY.md#replayable-challenge-flow--agreed-direction-2026-11-02) now owns primary gameplay progression. Reuse its purchasing/capability mechanics for mission setup, but do not assume the existing free Asteria-1, -$50,000 opening cash, or mid-run purchases define challenge rules. Mission budgets, scoring, and procurement timing remain RUN-02 decisions in the [development plan](CHALLENGE_RUNS.md).

Make company growth a clear management choice: see what a purchase costs, whether it is affordable, and what operational capacity it adds. Keep the first step small enough to connect cleanly to the existing per-spacecraft simulation.

## Existing boundary

The app starts with Asteria-1. `SatelliteDefinition` carries per-spacecraft orbit and slew settings, and world snapshots are calculated independently. Launched spacecraft start with empty storage, an independent power state, and no uploaded TEL; the running loop and globe update without resetting existing assets.

The first BIZ-02 slice began with one standard package. FLEET-02B now adds a per-spacecraft Enhanced slew choice at procurement. Each launched asset keeps its purchased specification; its upgrade applies only to that spacecraft and never retrofits earlier launches.

## Implemented first playable slice

### Purchase choice

Offer a **Standard** or **Enhanced slew** package. Before each launch, the player chooses altitude, inclination, ascending node, phase, and slew package. Orbit fields begin with Asteria-1's current 550 km / 53° / 12° / 8° orbit and remain editable. Do not apply an automatic phase offset; the player can choose an orbit that repeats or spaces their fleet. Launch immediately after purchase. Allow repeat purchases when affordable; do not impose an arbitrary fleet cap.

Show spacecraft, upgrade, and launch prices, current cash and affordability, selected slew capability, and editable orbit before the player submits the launch. Keep package values configurable. Do not add financing, customer contracts, or hardware that has no modeled operational effect.

### Additional ground-station offers — prototype slice

Finance & Growth offers four additional sites: Honolulu, Madrid, Nairobi, and Tokyo. They are catalog entries only at startup and do not appear in the operational station table or contact prediction until purchased or leased. A **Show location** checkbox draws an explicitly labeled offer marker on the globe; preview markers never enter the operational network. Purchase requires sufficient cash, records an idempotent capital-spending entry, and registers an owned station in the running loop. Owned sites pay daily maintenance and no per-contact charge. Lease registers a leased station with no upfront charge or capital entry; the lease rate is charged per assigned contact minute. Both access choices refresh station views without resetting spacecraft, TELs, imagery, energy, or finance history. Reset removes added stations and returns to the original four-site network.

The configurable purchase prices are $10M, $12M, $14M, and $16M. Owned-site maintenance is $125, $175, $150, and $250 per day, respectively; lease rates are $110, $125, $140, and $150 per assigned contact minute. Catalog link rates vary by site: Honolulu 5/60 Mbps, Madrid 20/120 Mbps, Nairobi 10/75 Mbps, and Tokyo 25/150 Mbps (uplink/downlink). These are synthetic prototype inputs, not real-site costs/specifications or final balance.

Each offer shows predicted access minutes for the next 24 simulated hours using every spacecraft currently in the fleet. It also estimates minutes beyond the current sites' coverage for those same spacecraft. Estimates use current orbit geometry and the existing contact-radius model; pass time is summed across satellites, so simultaneous access may compete for one antenna. The displayed marginal value is geometric availability, not a promise of scheduled throughput. The estimates refresh by simulation day and fleet/orbit changes. Operational outages and construction delay are not modeled.

### Purchase and launch

Buying a package launches it immediately; skip manufacturing queues and launch windows. Show spacecraft, upgrade, and launch prices separately, then record them together as one idempotent procurement transaction. A successful transaction assigns a stable new spacecraft ID, snapshots its selected equipment, adds its definition to the fleet, and makes it available to the simulation. Failed affordability checks leave cash and fleet unchanged. Routine operations continue if ongoing expenses later push cash below zero; the agreed BIZ-01 warning remains in effect.

Treat spacecraft, upgrades, launch, and station purchases as capital spending, not operating costs. They reduce available cash and appear in the ledger, but remain separate from BIZ-01's ground-station contact-fee and net operating-result totals. Show total cash movement separately so balances reconcile.

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
- Make purchase a command at the current simulation time. Recheck cash, then validate the selected orbit and subsystem configuration before posting one procurement entry and registering the spacecraft. An unaffordable or invalid request leaves the fleet unchanged.
- `OperationalLoop.registerSatellite` adds registration to runtime, ground planning, imagery, and power. Do not reconstruct the running loop to add a spacecraft: that would risk losing existing TELs, partial transfers, energy, and settlement history. Refresh globe visuals on launch/reset, not on render frames.
- New spacecraft start with their own configured energy, empty storage, and no onboard TEL. Automatic planning prepares their ground TEL as soon as the shared market is available; upload still waits for contact. They have no activity or cost history before launch. Preserve existing spacecraft state and selection; the new row must be selectable and operational controls must target its ID.
- Reset restores the initial fleet, opening balance, empty ledger, initial subsystem state, and initial selection. Remove purchased spacecraft from every subsystem and the globe, clear pending commands, and restore deterministic ID allocation. Normal additions must not reset any existing spacecraft.
- Keep the shared cell market and exactly-once image settlement. Verify deterministic ordering of simultaneous captures across spacecraft rather than creating a private market or duplicate revenue path for each vehicle. Fleetwide scheduling coordination is a later feature; independent plans can target the same cell.

### Agreed integrated launch behavior (2026-10-15)

These clarifications close the BIZ-02 integration questions and are implemented in the prototype.

1. **Operating costs:** Spacecraft have no recurring daily charge. Owned station maintenance accrues per simulated day, including idle owned stations; leased stations instead incur their lease rate while an antenna is assigned. No daily charge applies to a lease.
2. **Orbit choice:** Altitude, inclination, ascending node, and phase at launch are editable in the pre-launch form. Suggested values use the current 550 km / 53° / 12° / 8° starter orbit. The player chooses each launch orbit; no automatic phase spacing is applied. The selected phase is converted to the epoch phase expected by the orbit propagator.
3. **Station access:** Each station antenna serves one spacecraft at a time. The earliest available pass holds it through that pass; on exit, the antenna hands off to the earliest waiting spacecraft still in view. Ties use spacecraft ID order. Waiting spacecraft cannot uplink or downlink through that antenna, and occupancy is visible in the station and spacecraft views. A spacecraft can use a different available station; imagery transfer still uses the fastest single active station link.

## Verification guide

- Run existing finance, operations, scheduler, power, and market regression suites plus the production build after integration. Add focused registration/procurement coverage to the existing test workflow.
- Opening balance is exactly -5,000,000 cents, displays a warning, and does not count as an expense. Normal downlink revenue and contact fees continue while cash is negative.
- Use an explicitly funded test scenario to exercise purchases without waiting for $50M of gameplay income. Exactly 5,000,000,000 cents buys one spacecraft and leaves zero; one cent less rejects without mutation. Do not alter the user's production economy for the test.
- One successful purchase produces one itemized capital entry, zero launch cost, and one registered spacecraft. Duplicate command delivery changes nothing; a second deliberate purchase works only if affordable. Invalid package state and injected preparation failure leave both finance and fleet unchanged.
- Launch immediately before, exactly at, and just after a day boundary. Check first full-charge timing, no historical costs, and large versus irregular time steps with purchases at the same timestamps.
- Launch after hours of existing operation. The new spacecraft starts at the quoted phase and configured charge, with no inherited imagery/TEL; existing charge, pointing, plans, partial downlink bytes, and cash history are preserved.
- Exercise two spacecraft in overlapping contacts: the earlier pass owns the antenna, the later waits, and a handoff occurs only if it remains in view; simultaneous starts use spacecraft ID order. Check automatic planning and independent uploads, power/imagery, shared-market capture ordering, and exactly-once settlement. Reset should remove all purchased entities.
- In the browser, inspect an unaffordable quote under normal starting funds, then an affordable purchase under the funded test fixture. Confirm the new row/marker/orbit, selection, automatic TEL planning, revenue/cost totals, and reset. Measure responsiveness with a small fleet; keep registration updates event-driven rather than rebuilding entities each frame.

**Development-only funded browser fixture (2026-11-02):** Run the local Vite app at `/?scenario=funded-procurement-test` to start with $70,000,000 and a visible `TEST FUNDS` status label. This flag is honored only in development builds and is ignored in production; the ordinary opening balance remains -$50,000. The fixture permits browser-level procurement and reset checks without changing the player economy. Reset through the Orders preview control returns the funded scenario to day 0, one spacecraft, and the original four stations.

## Economy and remaining scope

The chosen $50M growth price has not been balanced against current sample revenue. Starting at -$50,000 means earning at least $50,050,000 plus any station operating costs before the first purchase. Treat growth pacing as unverified and preserve these configurable prototype values; use funded fixtures for development. TUNE-01 owns eventual balancing.

The $50M Standard and $55M Enhanced prices remain intentionally unbalanced, and multi-spacecraft planning continues to use independent plans. Runtime antenna queues are shared, but future planner forecasts may need to account for contention. Owned-site daily maintenance and lease costs are also unbalanced prototype inputs. The Enhanced package is the first FLEET-02B slice; broader hardware selection remains later work.

## Completion check

An affordable purchase records capital costs once and adds a stable-ID spacecraft with the orbit selected before launch. An unaffordable purchase does not register a spacecraft. The player can inspect cost and orbit before launch; cash-flow and operating totals reconcile to the ledger. The production build passes; behavioral verification remains pending.
