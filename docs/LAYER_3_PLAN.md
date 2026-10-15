# Layer 3 implementation plan and readiness review

Reviewed 2026-10-15 after BIZ-02 launch integration. The standard-package purchase flow and antenna allocation are implemented, and the production build passes. The next Layer 3 design item is FLEET-02B; OPS-02 remains a second bounded design task.

## Sequence

| Step | Deliverable | Readiness |
| --- | --- | --- |
| BIZ-01 | Company accounting, downlink income, recurring costs | Implemented; retain its regression tests during growth work. |
| BIZ-02 | Signed opening cash, capital spending, pre-launch orbit selection, immediate purchase, live fleet registration, reset, antenna sharing | Implemented prototype; production build passes. Behavioral verification remains pending. Decisions are recorded in the [growth guide](BIZ_02_GROWTH_DESIGN.md). |
| FLEET-02B | Paid slew capability for future launches | Next design task; no blocker for standard-package launches. |
| OPS-02 | One understandable outage and response loop | Design a bounded scenario before adding randomness, repair costs, or degradation. |
| Layer 4 handoff | Balance and usability observations | Record growth pacing and fleet performance evidence; preserve approved economic values until tuning is requested. |

FLEET-03 orbital maneuvers remain a separately selectable task. Neither it, cloud-data acquisition, save/load, nor new infrastructure is required to start this Layer 3 slice. Deferred weather acquisition remains deferred.

## FLEET-02B design brief

**Agreed:** Buying a slew upgrade affects later launches and leaves existing spacecraft unchanged. Procurement must snapshot the capability at launch; planners and execution use that spacecraft's immutable capability.

**Recommended first design:** One company-wide upgrade purchased once, inherited by all subsequent standard packages. Show the price and before/after slew capability, with no retrofit or recurring upgrade charge. This is a proposal; the agreement does not yet settle whether payment is company-wide or per spacecraft.

**Decisions required:** Purchase ownership (one-time company upgrade versus per-launch option), price, improved slew rate, and whether settling time changes. Avoid adding levels or an unlock tree until the single upgrade works.

**Handoff checks:** Reject insufficient funds without changing configuration; record upgrade spending once as capital spending; snapshot the improved capability only on later launches. Verify mixed old/new fleets in both planning and execution, repeat-click handling, reset, and visible capability differences. Use the BIZ-02 transaction machinery rather than a separate balance.

## OPS-02 design brief

**Agreed:** Anomalies need understandable symptoms and consequential responses. Ground outages and missed contacts are within Layer 3; static station configuration alone does not implement them.

**Recommended first design:** Start with a temporary outage at one ground station. Use an authored, deterministic event in development before adding a seeded random occurrence rule. Show the affected station, start time, operational impact, and recovery status in Summary and Ground Stations. Propose a choice between waiting for scheduled recovery and paying to expedite repair; both timing and price need a design decision. Do not silently use a display-only acknowledgement as the required consequential response.

**Decisions required:** Whether this station-outage scenario is the first anomaly, when the player learns about it, outage/repair durations and price, whether repair may drive cash negative, and what restoring availability during an existing geometric pass means for TEL upload. Do not silently treat recovery as a new upload opportunity under the existing contact-episode rule.

**Implementation boundary:** One simulation-owned availability timeline must feed contact eligibility, execution, planning knowledge, and UI. Do not reveal unannounced future outages to the planner. Split time advancement at outage/recovery boundaries; stop transfer during an outage while preserving partial bytes and onboard TEL. Existing TEL continues until exhausted; show the outage as the reason for unavailable contact rather than changing capture rules. Multiple spacecraft using the station see the same outage. Replanning follows the approved refresh/locked-capture policies.

**Handoff checks:** Outage at contact entry, mid-transfer, and recovery during a pass; alternate-station availability; exhausted TEL; no data/revenue duplication; selected intervention costs/timing; negative-cash behavior; two affected spacecraft; reset and large/irregular-step equivalence. Verify one complete visible event/response/recovery journey before adding more anomaly types.

Continuous health decay, permanent spacecraft loss, hidden diagnosis, cascading faults, repair inventories, and an extensive exception-management interface remain later design work. The first outage is a bounded prototype milestone, not completion of all health/degradation concepts.

## Review findings resolved in the plan

- The standard-package choice already defers upgrades; another approval to defer FLEET-02B is unnecessary.
- Current finance supports the negative opening balance and separates capital spending from operating costs.
- Dynamic spacecraft registration, reset, orbit selection, and live renderer updates are implemented under BIZ-02.
- The $100 spacecraft operating charge, pre-launch orbit selection, and exclusive antenna queue are agreed and recorded in Gameplay and the growth guide.
- The approved economy may produce a very long growth interval. Funded test fixtures make procurement verifiable without changing the player's chosen economy or claiming it is balanced.
- Upgrade and anomaly tasks now have bounded proposed scope, decision lists, dependencies, and acceptance journeys rather than broad feature headings.
