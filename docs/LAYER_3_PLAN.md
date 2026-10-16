# Layer 3 implementation plan and readiness review

Reviewed 2026-10-15 after BIZ-02 launch integration; FLEET-02B prototype designed and implemented 2026-10-16. The purchase flow, antenna allocation, and configurable slew option are implemented. The production build passes; focused behavior review remains. OPS-02 is the following bounded design task. The user's near-term priority is beginning playtesting; additional hardware detail can wait, and neither task is a prerequisite for trying the existing one-spacecraft revenue loop.

## Sequence

| Step | Deliverable | Readiness |
| --- | --- | --- |
| BIZ-01 | Company accounting, downlink income, recurring costs | Implemented; retain its regression tests during growth work. |
| BIZ-02 | Signed opening cash, capital spending, pre-launch orbit selection, immediate purchase, live fleet registration, reset, antenna sharing | Implemented prototype; production build passes. Behavioral verification remains pending. Decisions are recorded in the [growth guide](BIZ_02_GROWTH_DESIGN.md). |
| FLEET-02B | Paid slew capability for new spacecraft | Implemented prototype; production build passes. Focused behavioral verification remains pending. |
| OPS-02 | One understandable outage and response loop | Design a bounded scenario before adding randomness, repair costs, or degradation. |
| Layer 4 handoff | Balance and usability observations | Record growth pacing and fleet performance evidence; preserve approved economic values until tuning is requested. |

FLEET-03 orbital maneuvers remain a separately selectable task. Neither it, cloud-data acquisition, save/load, nor new infrastructure is required to start this Layer 3 slice. Deferred weather acquisition remains deferred.

## FLEET-02B design brief

**Status:** Prototype implementation completed 2026-10-16; TypeScript and production build pass. Focused behavioral acceptance checks remain pending. The user accepted the proposed first upgrade and prioritized adjustable functionality over further satellite-detail design.

**Agreed boundary:** Installed hardware and its designed capabilities are fixed after launch. All upgrades equip new spacecraft; existing spacecraft cannot be retrofitted. Procurement snapshots the selected capability at launch, and planning and execution use that spacecraft's capability. A broad selection of new-spacecraft upgrades is wanted later. The first planned slice remains one slew improvement. Operational state, command updates, and the separately agreed maneuver direction are governed by their own rules.

### Player choice

Finance & Growth offers a **Slew capability** choice in the new-spacecraft form: **Standard** or **Enhanced slew**. Standard is the initial selection. The player's orbit choice remains alongside it. Each launch buys its selected equipment; selecting Enhanced does not unlock or change the equipment on later purchases. Charge the surcharge on each equipped spacecraft, with no separate research purchase or recurring upgrade fee.

| Attribute | Standard | Enhanced slew (approved starter values) |
| --- | --- | --- |
| Slew rate | 1 degree/second | 2 degrees/second |
| Settling time after a non-zero slew | 2 seconds | 2 seconds |
| Base spacecraft price | $50,000,000 | $50,000,000 |
| Upgrade surcharge per spacecraft | $0 | $5,000,000 |
| Launch price | $0 | $0 |
| Total purchase price | $50,000,000 | $55,000,000 |
| Daily mission operating charge | $100 | $100 |

The catalog lives in `src/simulation/spacecraftCatalog.ts`. The enhanced values are configurable prototype inputs, not real spacecraft specifications or final economy balance. A 10% surcharge gives the first comparison a simple starting point; its value has not been measured against game revenue. Storage, power configuration, image size, collection duration, access limits, and other installed capabilities stay at standard package values for this slice. Further hardware options and their tradeoffs belong to later design work.

### Why this choice matters

The existing retarget calculation is angular distance divided by slew rate, plus settling time for a non-zero move. For an illustrative 30-degree retarget, Standard takes 32 seconds and Enhanced takes 17 seconds. With the current 45-second collection duration, the combined command takes 77 versus 62 seconds. This is arithmetic for a fixed angular move, not a measured orbital scenario or a promise of twice as many images.

Faster retargeting may fit more captures into an access window. Clouds, energy, storage, antenna contention, and downlink can still limit delivered income. The tradeoff is spending another $5M now versus keeping that cash for later capacity. Existing power rules already charge the capture load throughout the combined retarget/collection interval, so shorter commands also consume less capture-load energy per otherwise equivalent command. The proposal adds no separate slew power model; overall energy use still depends on the resulting schedule.

### Purchase and fleet readout

Show the selected slew rate, settling time, base price, upgrade surcharge, launch cost, total, and projected cash after purchase before the launch action. Recompute affordability when the equipment selection or company cash changes. Use a short explanation: “Turns toward the next target faster. Installed on this new spacecraft at launch.”

After launch, show the installed slew option and numeric capability in spacecraft details so the player can compare older and newer assets. Keep those values as the purchased specification even if catalog defaults change later. Preserve the draft selection after a successful launch so repeat purchases are deliberate and visible; reset returns the form to Standard and restores the original fleet.

### Implementation boundary

- `src/simulation/spacecraftCatalog.ts` owns stable package IDs, configurable cent prices, and slew capabilities for Standard and Enhanced slew. Quote and purchase functions resolve the package for both the UI and future behavioral checks.
- The purchase command validates the orbit and spacecraft registration, applies due costs, rechecks affordability, records one capital transaction, and registers the spacecraft. Procurement exposes spacecraft, upgrade, and launch components, as well as the selected equipment ID, for reconciliation and duplicate-command checks.
- Each spacecraft stores its own equipment option ID and copied slew configuration. The existing shared retarget function consumes that spacecraft's configuration for both planning and execution. The catalog can expand later without turning this slice into a general hardware builder.

### Behavioral acceptance handoff (pending)

1. With a funded scenario, exactly $55M buys one Enhanced spacecraft and leaves zero; one cent less rejects with no fleet or ledger change. Standard still costs $50M. Invalid option IDs, invalid orbit/configuration, and registration preparation failures leave cash and fleet unchanged.
2. One purchase records the base, upgrade, and launch amounts once. Replaying the same command adds no cost or spacecraft; a new deliberate command may buy another if affordable. Changing option contents under a reused command ID is rejected.
3. Launch Standard, Enhanced, then Standard again. Confirm each retains its chosen rate and settling time, and Asteria-1 keeps its original capability. Changing the form or catalog must not change launched hardware, active TELs, imagery, or battery state.
4. Check the 30-degree retarget arithmetic through the shared helper and a bounded scenario where the shorter retarget admits a capture the Standard option misses. Planning and execution must agree on timing and use each spacecraft's own capability. Compare equivalent scenarios independently to avoid shared-cell recovery obscuring the hardware effect; separately check mixed-fleet integration.
5. Exercise the purchase UI, cost breakdown, capability readout, first daily charge, and reset. Retain the BIZ-02 acceptance checks for stable registration, shared antenna handoff, existing operational state, and time-step consistency; its behavioral review is still pending.

### Approved scope and later tuning

**Approved 2026-10-16:** Charge **+$5M per Enhanced spacecraft**, use **2 degrees/second**, retain **2 seconds settling time**, and retain the standard package's other subsystem settings and daily operating cost. Keep price and capability values configurable for later adjustment. The broad upgrade catalog remains deferred; profitability and growth pacing remain TUNE-01 work, informed by playtesting.

## OPS-02 design brief

**Agreed:** Anomalies need understandable symptoms and consequential responses. Ground outages and missed contacts are within Layer 3; static station configuration alone does not implement them.

**Recommended first design:** Start with a temporary outage at one ground station. Use an authored, deterministic event in development before adding a seeded random occurrence rule. Show the affected station, start time, operational impact, and recovery status in Summary and Ground Stations. Propose a choice between waiting for scheduled recovery and paying to expedite repair; both timing and price need a design decision. Do not silently use a display-only acknowledgement as the required consequential response.

**Decisions required:** Whether this station-outage scenario is the first anomaly, when the player learns about it, outage/repair durations and price, whether repair may drive cash negative, and what restoring availability during an existing geometric pass means for TEL upload. Do not silently treat recovery as a new upload opportunity under the existing contact-episode rule.

**Implementation boundary:** One simulation-owned availability timeline must feed contact eligibility, execution, planning knowledge, and UI. Do not reveal unannounced future outages to the planner. Split time advancement at outage/recovery boundaries; stop transfer during an outage while preserving partial bytes and onboard TEL. Existing TEL continues until exhausted; show the outage as the reason for unavailable contact rather than changing capture rules. Multiple spacecraft using the station see the same outage. Replanning follows the approved refresh/locked-capture policies.

**Handoff checks:** Outage at contact entry, mid-transfer, and recovery during a pass; alternate-station availability; exhausted TEL; no data/revenue duplication; selected intervention costs/timing; negative-cash behavior; two affected spacecraft; reset and large/irregular-step equivalence. Verify one complete visible event/response/recovery journey before adding more anomaly types.

Continuous health decay, permanent spacecraft loss, hidden diagnosis, cascading faults, repair inventories, and an extensive exception-management interface remain later design work. The first outage is a bounded prototype milestone, not completion of all health/degradation concepts.

## Review findings resolved in the plan

- BIZ-02's initial standard-package scope left upgrades for a later slice; the user has since approved the FLEET-02B Enhanced slew option recorded above.
- Current finance supports the negative opening balance and separates capital spending from operating costs.
- Dynamic spacecraft registration, reset, orbit selection, and live renderer updates are implemented under BIZ-02.
- The $100 spacecraft operating charge, pre-launch orbit selection, and exclusive antenna queue are agreed and recorded in Gameplay and the growth guide.
- The approved economy may produce a very long growth interval. Funded test fixtures make procurement verifiable without changing the player's chosen economy or claiming it is balanced.
- Upgrade and anomaly tasks now have bounded proposed scope, decision lists, dependencies, and acceptance journeys rather than broad feature headings.
