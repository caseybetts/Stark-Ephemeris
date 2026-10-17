# OPS-02 — Temporary ground-station outage

**Status: Design drafted 2026-10-17; proposed rules, not implemented or approved.**

This is the next bounded design step in [Layer 3](LAYER_3_PLAN.md). It gives the player one understandable operational exception while preserving the existing single-spacecraft revenue loop. Playtesting that loop can begin before this feature is implemented.

## Existing agreements

- Exceptions should show their cause, operational effect, and a consequential response.
- Ground contact is required for TEL uploads and imagery delivery. Captures alone earn no revenue; partially delivered imagery retains its bytes and pays only at full delivery.
- Spacecraft execute their onboard TEL between contacts and enter Standby when it is exhausted. Ground revisions preserve current/next commitments and do not silently change onboard work.
- Each station serves one spacecraft at a time, ordered by pass start and then spacecraft ID. Installed spacecraft hardware remains fixed after launch.
- Opening cash is -$50,000. Routine operations continue with negative cash; procurement requires affordability. Repair affordability has not yet been agreed.

## Proposed player experience

A station goes offline and an exception appears in Summary. It states which station failed, when normal service returns, which spacecraft currently lose service, and whether an upload or imagery transfer is blocked. Existing onboard work continues. Another available station can still serve the spacecraft under the normal antenna rules.

The player can leave **Wait for recovery** selected or choose **Expedite repair**. Waiting requires no acknowledgement and adds no repair charge. Expediting pays a one-time fee and brings recovery forward. Show both recovery times and the proposed cash balance before the action; show a receipt and the revised time afterward. Do not automatically pause the simulation or require a modal response.

At recovery, show “Station service restored” and explain whether service resumes now or awaits a later pass. Restoration does not guarantee immediate revenue: geometry, antenna availability, power, and stored imagery still matter.

### Proposed starter settings

| Setting | Proposal |
| --- | --- |
| Occurrence | One authored station outage in an explicitly selected outage scenario; no random failures in the default run yet |
| Player notification | At outage onset; normal planning cannot see the future event beforehand |
| Normal outage duration | 30 simulation minutes |
| Expedited recovery | 2 simulation minutes after the accepted request |
| Expedited fee | $100 (10,000 integer cents), charged once on acceptance |
| Affordability | Cash must cover the entire fee after charges already due at that time; repair cannot create new debt |
| Default response | Wait; normal recovery is automatic and free |

These values are configurable playtest inputs, not balance conclusions. The negative opening balance means the initial company cannot buy expedited repair. Free recovery prevents that from blocking play; a separate funded fixture exercises the paid choice without changing the agreed opening economy. Assess price and outage length during TUNE-01.

Disable expediting once purchased, after recovery, or when two minutes from now would be no earlier than normal recovery. Explain the reason inline. Reject a stale action atomically if its terms or affordability have changed. No cancellation, refund, stacked repair, or recurring fee in this slice. Ordinary station operating charges continue during the outage.

## Proposed contact and execution rules

### Separate visibility, station service, and antenna ownership

Retain geometric passes while the station is offline. The outage removes service and antenna ownership; it does not move the spacecraft or end its physical pass. On recovery, allocate the antenna to the earliest original pass start still in view, then spacecraft ID. Do not reserve it for the former owner or reset waiting-pass start times. One shared station state affects every spacecraft.

Stop the affected imagery link at outage onset. Preserve completed transfer bytes, image identity, stored quote, and onboard commands. Use another allocated station's link if available, following the existing fastest-single-link rule. Resume interrupted FIFO transfer when a usable link returns, subject to the existing power guard. Outages do not abort captures or directly delete imagery; ongoing collection can still cause ordinary storage eviction.

### TEL uploads across an interrupted pass

**Proposed extension requiring review:** For this outage slice, retain an upload latch across a geometric contact episode: the union of overlapping/back-to-back passes at normally serviceable stations, ignoring temporary outage gaps. Exclude stations configured permanently down. Reset the latch only after every pass in that episode closes.

- Attempt upload on the first allocated, operational link in that episode. Waiting for an antenna or for service restoration before any such link exists does not consume the opportunity.
- If the station was down at entry and recovers mid-pass, that first usable link may upload the latest ground plan.
- If an upload opportunity already occurred before the outage, restoration in the same episode cannot upload a revision. Downlink can resume. This also applies if another station provided the earlier opportunity.
- A power-depleted spacecraft consumes the opportunity when its first usable station link begins, matching the existing no-retry-on-power-recovery rule.

This explicitly defines new behavior at dynamic availability gaps. The current implementation tracks allocated contact starts; it must gain an independent episode latch rather than accidentally treating every service restoration as a fresh upload. Confirm this extension before implementation; existing agreed rules remain authoritative until then.

When a missed upload leaves the TEL exhausted, show “Standby — awaiting plan upload” with the affected station and next eligible opportunity, if known. Never synthesize an onboard plan to bridge the gap. If no opportunity exists in the existing prediction horizon, show that limit and retain the pending ground plan.

### Event timing and planning knowledge

Process outages and recoveries at simulation timestamps, independent of playback speed. Integrate the interval ending at a boundary using its prior state, including any image finishing exactly there. Then apply station availability and simultaneous geometric edges together, allocate antennas, and evaluate upload opportunities. A pass ending exactly at recovery receives no extra service; a pass beginning exactly at outage onset cannot upload.

Before announcement, ground forecasts use nominal station availability. After onset, they can use the announced recovery time; after accepted repair, use the revised time. Keep the authored hidden event schedule outside planner inputs. Refresh ground planning on those knowledge changes using the existing coalesced triggers and committed-prefix rules. Display expected contact changes as forecasts, not promises of an uncontested antenna.

## Proposed interface

- **Summary:** One exception card with station/location, cause (“Station communications outage”), time remaining, current impact, and the two response choices. Waiting is the default. Show the paid option's fee, recovery time, projected cash, and disabled reason when applicable.
- **Ground Stations:** Outage/recovering status, restoration time, and the same response controls beside the station. Ownership and waiting lists remain visible with service loss explained.
- **Spacecraft:** Distinguish out of view, antenna occupied, station offline, power-limited transfer, and awaiting TEL. Show actual effects, not an outage warning on every spacecraft regardless of contact.
- **Finance & Growth:** Add an identified station-repair expense to the existing ledger and operating-cost total. Do not classify it as spacecraft capital spending or reduce realized revenue.
- **Recovery history:** Retain onset, accepted intervention, and recovery events for inspection until reset. Acknowledge/dismiss only affects presentation.

## Implementation handoff

1. Add a simulation-owned station availability timeline and an outage state record: stable event/station IDs, onset, normal/current recovery times, announcement state, and optional accepted repair command. Keep configurable scenario data separate from renderer code. Reject invalid intervals and overlapping events for one station in this first slice.
2. Integrate availability boundaries with `GroundOperations` and `OperationalLoop`: preserve geometry, release/reassign antennas, add the episode upload latch, and interrupt/resume transfer without changing settlement identities. Planning and execution consume the same availability rules, with planning restricted to announced knowledge.
3. Extend `CompanyFinance` with a station-repair expense. An accepted response atomically posts the fee and updates recovery. Replaying its command ID returns the original result; a second ID cannot buy the same repair twice. Check due recurring costs first. Reject reused IDs with conflicting contents.
4. Connect Summary, station details, spacecraft explanations, and finance reporting to domain snapshots. Reset clears outages, repair transactions, notification history, and upload latches along with the existing run state, then restores the selected scenario.
5. Exercise the acceptance journeys below before enabling random failures or expanding anomaly types.

## Acceptance handoff — pending implementation

- **Visible journey:** In an authored short-contact fixture, interrupt an active partial downlink, show its cause, choose a response, recover, resume delivery, and credit the image exactly once. Arrange a pass lasting beyond expedited recovery so the paid choice visibly matters. Compare the wait branch over the same simulation interval.
- **Contact edges:** Outage at entry and during transfer; restoration within a pass, at pass end, and before a later pass; back-to-back and overlapping station windows; no duplicate upload after restoration. Also exercise restoration before the first usable link and the power-depleted first-opportunity case.
- **Alternate service and fleet:** Another station can serve unaffected traffic. Two spacecraft lose the same station, queue by original pass start, and recover without duplicate owners. Check simultaneous starts by ID.
- **Onboard continuity:** Captures continue under ordinary access/weather/power rules, partial bytes remain, storage eviction still works, and an exhausted TEL enters explained Standby. Ground changes remain pending until an eligible upload.
- **Repair accounting:** Exactly $100 permits repair; one cent less and negative cash reject without changing the event or ledger. Repeated clicks/IDs, conflicting IDs, already recovered events, and requests too late to save time produce no duplicate fee or state change. Due daily costs affect affordability.
- **Forecast knowledge:** No pre-onset planner knowledge of the authored outage; announced recovery and paid revision change ground forecasts without changing onboard commitments or assuming future antenna ownership.
- **Replay and reset:** Equivalent large and irregular time steps produce the same links, uploads, bytes, imagery, cash, power, and event state. Include outage/recovery coincident with capture completion, image delivery, and daily operating charges. Reset restores a clean scenario.

## Review boundary and later work

The concrete proposal is ready for review: one temporary station outage, 30-minute normal recovery, a $100 two-minute repair requiring cash, and the upload-latch extension above. None of these new terms is recorded as user-approved yet.

Defer random incidence/frequency, health decay, permanent loss, spacecraft repair, hidden diagnosis, cascading faults, inventory, multiple simultaneous outages, and additional repair options. The existing nominal game remains available for first revenue playtests. A broad upgrade catalog and orbital maneuver implementation are separate work.
