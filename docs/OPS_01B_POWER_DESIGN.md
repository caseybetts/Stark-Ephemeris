# OPS-01B power design and verification

**Status: prototype implementation and verification complete 2026-10-14.** [Gameplay](GAMEPLAY.md#spacecraft-power--agreed-prototype-rules-ops-01b) owns the agreed rules and starter values. [Technical Strategy](TECHNICAL_STRATEGY.md#ops-01b-technical-boundary) owns the architectural boundary. Final balance and later subsystem effects remain open.

**Implemented and verified:** configurable battery state, simulation-time solar/load projection, eclipse and reserve boundaries, capture-start admission with fixed failed slots, power-gated downlink, depletion/restart, energy conservation diagnostics, a committed-work reserve guard, greedy capture feasibility, contact-episode forecast union, and a Spacecraft battery/power-flow/reason readout. `tests/power.test.mjs` verifies arithmetic, capture minima, energy ledger, guard/restart limits, depletion recovery, eclipse and step partition behavior, and reset. `tests/operationalLoop.test.mjs` verifies power-rejected queued work, contact-entry rules, active/next-capture protection, concurrent capture/downlink, exact final-byte cutoff, pause/resume with persistent bytes, planner reserve filtering/contact union, and irregular time advances.

**Live UI check:** local playback showed changing charge, capacity, reserve, power state, generation/load/net, and explanation in the Spacecraft tab under both sunlit and eclipse conditions. Exceptional capture and downlink states are verified through the shared simulation loop tests.

## Review findings and resolutions

| Gap in the first draft | Resolution in the revised proposal |
| --- | --- |
| Ending charge alone could hide depletion before sunlight returns. | Admission checks the minimum over the whole command, including eclipse transitions and battery saturation. |
| Housekeeping could drain through reserve with no defined zero-energy behavior. | Reserve limits discretionary work; zero triggers depletion, load shedding, and a separate restart threshold. |
| Downlink could starve a locked next capture or oscillate at reserve. | Implemented: protect active/next work with an energy guard and restart margin; predict guard crossings explicitly. |
| Capture decisions currently happen after runtime completion. | Implemented: start-time admission is remembered through the original completion boundary. |
| Rejected command load, pointing, timing, and retry behavior were unspecified. | Power rejection uses housekeeping only, keeps pointing and scheduled times, and cannot restart inside its slot. |
| Recovery during contact could accidentally permit another upload. | Implemented: downlink may resume; TEL upload remains limited to powered episode entry. |
| A new schedule could assume charge at the wrong simulation time. | Project existing onboard work and transfers from now through upload and locked work before planning the suffix. |
| Capture/downlink concurrency was incorrectly attributed to prior OPS-03 approval. | Gameplay records the power-specific concurrency behavior as an agreed prototype rule; prior approval covers uplink/downlink concurrency. |
| No starter values, test or UI contract existed. | Gameplay and this guide now define configurable synthetic values, quantitative fixtures, and the verification contract. |

## Scope and data contract

Implement one configured spacecraft through the existing shared `OperationalLoop`; keep storage keyed by spacecraft ID so power is never pooled across the fleet. No external services or additional infrastructure are needed.

Agreed prototype configuration: `capacityWh`, `initialEnergyWh`, `reserveWh`, `restartWh`, `downlinkRestartMarginWh`, `solarGenerationW`, `housekeepingW`, `captureAdditionalW`, and `downlinkAdditionalW`. Gameplay lists the starter values. All values must be finite; capacity and reserve must be positive; restart margin must be nonnegative; rates must be nonnegative; `0 <= initialEnergyWh <= capacityWh` and `0 < reserveWh < restartWh <= capacityWh`. A positive reserve keeps an admitted capture away from physical depletion. Zero generation or zero activity loads are valid fixtures. Negative time or invalid configuration must fail before mutating simulation state.

Dynamic state includes energy, normal/depleted state, radio running/paused state, the command's remembered admission result, and diagnostic totals for generated, consumed, and spilled energy. Initial energy zero starts depleted; positive initial energy starts normal, including configurations below reserve. Only depletion sets the restart latch. Reset restores all initial state, clears admission decisions and energy events, and resets market/runtime state through the existing reset path. There are no live power-hardware edits in this slice.

Expose generation, load, net W, Wh/capacity/percentage, reserve, and an explicit inhibition reason. Keep power state separate from TEL Standby and its existing reasons: an occupied failed-command slot is not an exhausted TEL. Distinguish low charge, waiting to protect committed work, and power depletion. Show a paused transfer's reason beside its persisted byte progress. Power events should describe state transitions and rejected commands, not log one event per UI frame.

## Shared energy calculation

For each interval with constant generation and active loads:

`deltaWh = (generationW - totalLoadW) * durationSeconds / 3600`

Load is housekeeping plus admitted capture load plus radio load only while transmitting bytes. In depletion all three are zero; solar charging remains available. The agreed prototype uses 100% charging/discharging efficiency. Battery bounds require splitting at saturation or depletion; do not merely clamp a long step and pretend loads ran after energy ran out. Record spilled surplus and keep `initial + generated - consumed - spilled = final` within numerical tolerance.

Use satellite illumination, not whether the ground target is sunlit. Existing `world.ts` supplies `isSatelliteEclipsed` and circular-orbit positions with a fixed inertial Sun. Predict illumination transitions independently of caller step size. Prefer analytic entry/exit for that circular orbit: eclipse is the portion where the position's projection onto the normalized Sun direction is less than `-sqrt(orbitRadiusKm^2 - earthRadiusKm^2)`. Handle no-eclipse and tangent cases explicitly. Test predicted intervals against `isSatelliteEclipsed`; do not reuse the 120-second contact scan as an energy integration step or sample only interval endpoints. If using numerical roots, use stable epoch-anchored brackets and a documented tolerance.

Capture admission uses the shared piecewise projection with housekeeping and capture load, clipping only surplus at capacity and tracking the minimum. Check at the scheduled command start, before spending any payload energy. A power failure is remembered until completion even if charge improves. No slew means the last pointing remains unchanged for a power-rejected command. For an admitted command, actual energy is consumed even if image creation later fails for geometry, weather, or missing market state. Existing geometric checks remain authoritative; power admission must not turn a geometrically invalid command into a success.

## Committed-work guard and radio allocation

The guard protects mandatory load through the active and locked next capture, including waits, with reserve maintained along that projected path. Compute the minimum feasible starting energy against capacity and known illumination. With no committed capture, guard equals reserve. Do not reserve energy for the entire tentative suffix; that would unintentionally block delivery.

A remembered power-rejected active slot contributes only housekeeping while powered, not capture load; it cannot acquire a new energy reservation by recharging mid-slot. The locked next target remains subject to its own future admission check.

A practical pure algorithm walks mandatory intervals backward from required terminal energy equal to reserve. For an interval with net rate `q = (generation - mandatoryLoad) / 3600`, required starting energy is `max(reserve, requiredEnd - q * duration)`. A requirement above capacity at any boundary means the committed sequence cannot currently be guaranteed. Split on all mandatory-load/illumination boundaries and account for the active command's remaining duration only. Forward-check the result against the same capped projection. The guard can vary within an interval, so a radio stop is an intersection between the energy trajectory and the guard trajectory, not just the fixed reserve.

When committed work is infeasible, pause downlink, expose the conflict, and retain the locked target. At its start, admit it if its own command is then feasible; otherwise report its failure in the original slot. Do not reject an otherwise feasible active capture solely because a later locked capture is infeasible. On completion/failure, promote commitments and recompute the guard.

The radio is either off or at the assigned station's full configured rate; the power model does not include fractional-rate control. Battery-funded transfer stops at the guard and restarts at guard plus margin. A sustainable solar surplus can permit transfer at the guard without waiting for the margin, but only if the combined energy trajectory preserves the changing guard. Predict the next guard/restart crossing and split there; never run a zero-duration toggle loop. This can naturally produce bounded charge/transfer cycles, which must be deterministic across step sizes.

Reuse OPS-01A's fastest single active link, FIFO inventory, fractional-byte accounting, deletion, and exactly-once settlement. Meter radio energy only for actual transmission time, including fractions of a second needed for the last byte of the final image. Stop radio load at delivery, contact exit, energy pause, or deletion of the final pending image. Do not invoke the old unrestricted downlink path in addition to the power-gated path. Reset the radio's energy-pause latch when there is no transferable inventory/contact; re-evaluate the guard before its next start.

## Event ordering and integration changes

`OperationalLoop` now owns the shared chronological boundary traversal for capture admission/completion, power, contact edges, and transfer. `GroundOperations` delegates advancement to that loop, preserving one authoritative clock and one transfer path. `SimulationRuntime` remains a generic action timeline rather than owning power policy.

Advance to the earliest action start/completion, contact edge, illumination transition, capacity/zero/guard/restart crossing, image completion, two-minute planning boundary, or caller endpoint. Integrate the previous half-open interval before applying events at its end. A caller endpoint is not itself a new admission, upload, or replan trigger.

At a shared timestamp:

1. Commit energy and eligible transfer bytes for the elapsed interval; settle fully transferred old images.
2. Complete captures/failed slots and apply image creation, storage eviction, and VAM changes. An image born here receives no bytes from the preceding interval.
3. Apply illumination and depletion/restart transitions, and contact edges grouped by spacecraft. Back-to-back/overlapping station windows remain one episode.
4. Coalesce due ground-planning triggers. Attempt one upload for a newly entered episode if powered, preserving active/next work.
5. Resolve action starts/admission, recompute committed energy and radio state, then advance again. Consume all same-time events once so no zero-progress loop occurs.

A recovery at the exact start of an episode permits its upload; recovery after the start does not. Record power-rejected commands as simulation diagnostics even while the spacecraft is depleted; those records do not imply radio transmission. Playback pause spends no energy. Energy advances even if the market/grid is not loaded, the UI tab changes, or automatic scheduling has not been enabled.

## Scheduler integration

Use a pure projection of power, current onboard actions, forecast contacts, and image inventory from the current timestamp to the proposed upload. Project preserved active/next work to the suffix start. Every candidate sequence then advances energy, pointing, projected captures, and VAM together. Candidate branches own copies of projected state; a rejected branch must not consume real energy or alter another candidate. The same energy admission and radio allocation rules apply in forecasts and execution.

Preserve the existing priority objective and two-minute planning segments. Wait commands consume housekeeping and may recharge; when no feasible collection exists, emit the existing idle continuation and try later opportunities rather than silently creating a capture. Ground refresh cannot alter current onboard energy demands until the authorized upload. Retain the previous plan if no future contact pair is forecast, as already agreed.

**Contact episode rule implemented:** forecasts merge each spacecraft's available windows by interval union (`next.start <= episode.end`, extending the end). The runtime preserves an episode already in progress so a later overlapping station cannot create another upload opportunity. Planning, runtime synchronization, and authored-plan forecasts share this interpretation. Chained-overlap and back-to-back regressions cover the approved OPS-03 rule.

Forecasts use deterministic orbit illumination, not weather, surface-cell sunlight, or renderer snapshots. Power projections that include future captures must use projected inventory for later radio load. Approximate capture success remains subject to the existing geometric model; execution always rechecks admission from actual charge.

Do not assume every preserved capture will succeed when seeding a suffix. A projected power rejection advances time and housekeeping but adds no image or VAM reset and leaves pointing unchanged. The following original command can consequently fail its existing slew/timing check; report that outcome rather than shifting its start or inventing a slew. Recompute the tentative suffix from the resulting projected state. Add a regression for a rejected capture followed by a previously scheduled target.

## Delivered implementation stages

1. Add validated power configuration/state and pure energy/illumination/guard projection with exact fixtures; keep it independent of rendering and market availability.
2. Add start-time admission and chronological power boundaries to `operationalLoop.ts`/`groundOperations.ts` without breaking runtime chronology, committed-prefix uploads, or capture settlement. Handle reset and depletion/restart.
3. Gate `imageryOperations.ts` transfer by powered intervals and actual bytes; verify energy and byte conservation together. Expose contact-entry upload availability from power state.
4. Reuse shared contact episodes and energy projection in `cellScheduler.ts` and the automatic continuation path. Test existing onboard work through upload before tentative suffixes.
5. Expose energy and reasons in the current Summary/Spacecraft UI and transfer status. Add a bounded readout, not a new management tab or player priority control.

These stages describe the implementation delivered. No save/load system, procurement, panel orientation, battery aging, thermal behavior, or random aborts are part of this slice.

## Verification matrix

Use exact illumination/contact fixtures for arithmetic and event ordering, plus separate real-world-model checks. Synthetic values below come from Gameplay and are not balance claims.

| Case | Required result |
| --- | --- |
| Sunlit idle, 400 Wh, 600 s | Gain 41.666667 Wh from 300 W generation minus 50 W housekeeping. |
| Eclipse idle, 400 Wh, 600 s | Lose 8.333333 Wh. |
| Capacity saturation mid-interval | Charge stops at 500 Wh; surplus is accounted as spill, not carried into later eclipse. |
| 45 s eclipse capture at 104/102 Wh | 104 admits and ends at 100.25 Wh; 102 rejects, ends at 101.375 Wh from housekeeping only, and creates no image/VAM/pointing change. |
| Eclipse dip followed by sunlight | Reject if any intermediate charge falls below reserve even when the final charge would exceed it. |
| Power rejection followed by recharge | One failure at the original completion; no retry inside the slot and no change to following command start times. |
| Admitted capture later fails imaging | No image/recovery reset; actual consumed energy is retained. |
| Capture and downlink together | Sum active loads once; radio pauses before threatening active or locked next work, including its wait. |
| No inventory/down station/no contact | No radio load or transfer. Housekeeping and generation still integrate. |
| Final image completes mid-contact | Exact eligible bytes/cash once; stop radio energy at the same completion time. |
| Guard/restart crossings | No negative energy or chatter; threshold transitions and bytes match across step sizes. Test guard-plus-margin above capacity. |
| Depletion and recovery | Housekeeping reaches zero without negative charge; loads shed; from zero under uninterrupted 300 W sunlight restart at 150 Wh after 1,800 s. |
| Recovery inside an episode | Downlink can resume; no delayed TEL upload. Exact-entry recovery permits one upload. |
| Committed target becomes infeasible | Target identity and command times remain; explicit failure if still infeasible at start, then continuation refresh. |
| Scheduler across upload/segments | Carries projected charge, inventory, and commitments rather than starting full; no mutation of real state by rejected candidates. |
| Chained overlapping/touching station windows | One episode in both planner and executor; pending revision waits for the next episode. |
| Large, regular, irregular, exact-boundary advances | Same admissions/outcomes/uploads/settlements, near-equal energy/bytes, and the same reset/replay result. |
| Market absent, auto-plan disabled, playback paused | Power remains independent of market and planning; pause advances neither time nor energy. |
| Invalid/zero-rate configurations | Validation is atomic; zero generation cannot magically recover, and zero discretionary loads do not divide by zero. |

Use a documented energy tolerance (suggested `1e-6 Wh`) and eclipse-boundary tolerance (suggested `1e-6 s`); ensure numeric error does not flip semantic admission at equality. Keep full precision internally and round only UI values. Reuse existing fractional-byte conservation rules. Do not compare progress-event counts as a substitute for energy/byte totals.

**Verification completed 2026-10-14:** `npm run test:runtime` (4), `npm run test:operations` (28), `npm run test:cells` (5), `node --test --test-isolation=none tests/cellEconomy.test.mjs tests/cellMarketState.test.mjs` (10), `npm run test:power` (12), and `npm run build` all pass. The browser showed the changing spacecraft readout in sun and eclipse; renderer-independent tests exercised rejected captures, power-paused and resumed transfer, and reset. The production build reports only the existing large Cesium chunk advisory.

## Readiness

The policy, integrated prototype, deterministic verification, and local GUI walkthrough are complete. Balance tuning and deferred physical systems remain separate work.
