# OPS-04 implementation and verification guide

**Status:** Completed 2026-10-14 — runtime repair, shared orchestration, deterministic integration coverage, production build, and live contact/capture/downlink walkthrough are complete. The brief partial-transfer interval was verified in deterministic tests but was too short to sample visually at 300× playback. This guide specifies verification work, not approved game balance. The [task](PENDING_CHANGES.md#ops-04--verify-the-integrated-operational-loop) records the outcome; [Technical Strategy](TECHNICAL_STRATEGY.md#ops-04-integration-verification) owns the architecture boundary. Gameplay rules remain in [Gameplay](GAMEPLAY.md).

## 1. Baseline and first work

Review on 2026-10-13 found two concrete starting issues:

- On Node v24.19.0, `npm run test:runtime` passes three tests and fails the existing step-size invariance test. A single 10-second advance omits `downlink-a` completion at second 8. `SimulationRuntime.advanceBy` gathers completions from actions already active before processing starts; a queued action can start and finish within the same advance. Fix this against the existing assertion before adding integration behavior. Do not weaken the assertion or require callers to use tiny steps.
- Directly importing `groundOperations.ts` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` because its constructor uses a parameter property. `imageryOperations.ts` uses the same syntax; several transitive runtime imports also omit `.ts`. The existing test convention is Node's native TypeScript support. The proposed minimal setup is explicit field declarations/constructor assignments and `.ts` extensions in the imported domain graph, as the market modules already use. `tsconfig.json` permits these extensions. Confirm imports and the production build after the change; a new test framework is not needed for this scope.

These were implementation prerequisites inside OPS-04, not missing product decisions. Both have been fixed: `advanceBy` now processes newly-started actions that also complete before the requested endpoint, and the direct Node TypeScript import graph works with the existing runtime. `npm run test:runtime` passes 4/4. The rest of this guide records the implementation and remaining verification boundary.

## 2. Exercise production orchestration

| Current code | Responsibility and integration concern |
| --- | --- |
| `src/simulation/runtime.ts` | Clock and sequential actions; must process all intervening completions. |
| `src/simulation/contacts.ts`, `groundOperations.ts` | Predict contact edges, upload ground plans, track onboard commands and Standby. |
| `src/simulation/cellCapture.ts`, `slew.ts` | Shared access, duration, pointing, and retarget calculations. |
| `src/simulation/cellMarketState.ts` | Image identity, recovery, transfer state, deletion, and settlement. |
| `src/simulation/imageryOperations.ts` | Capacity enforcement and contact-limited transfer. |
| `src/simulation/operationalLoop.ts` | Shared renderer-independent coordinator owns capture metadata, pointing, capture creation, capacity, downlink, chronological advancement, and reset. |
| `src/main.ts` | UI and wall-clock playback call the coordinator; rendering, selection, and draft state stay in the app. |

The coordinator extraction is implemented. The browser and tests call the same code to revise plans, advance time, and reset execution. Rendering, DOM updates, selection, and wall-clock playback remain in the app. No test-only copy of capture/transfer orchestration is used.

The chronology defect was reproduced and corrected: transfer now advances through each contact/action interval before boundary effects are applied. The regression test confirms an earlier image delivers before a later capture applies storage pressure, even in one large advance.

Use event boundaries to advance the composed system: transfer up to the next contact/action boundary using the inventory and link valid during that elapsed interval, then apply the boundary's state changes before advancing farther. Account for full delivery occurring inside an interval. A new image receives no pre-capture transfer time; an image deleted later must still receive any valid earlier transfer. Do not hide ordering defects by always advancing in one-second increments.

Retain the runtime's completion-before-next-start convention. No positive transfer duration exists at a single timestamp: an image captured exactly at contact exit cannot transfer on that expired pass. Record any genuinely unresolved simultaneous replacement policy under CELL-04B; OPS-04 does not decide how an active/locked command is replaced by a new TEL.

## 3. Fixtures and independent expected results

Create fresh runtime, ground, market, imagery, and coordinator instances per run. Use fixed IDs and simulation times, no wall clock, randomness, network, Cesium, or full geography download. Use authored TELs for the core scenarios so greedy search is not needed to reproduce failures.

Use a small **real `CellGrid`**, with a helper constructing valid schema-v4 packed data: 12-byte header, 40-byte records, ascending valid cell IDs, matching metadata, and empty places. Follow `cells.ts` for offsets. Configure one exposure category explicitly through `CellMarketState`'s definitions argument; zero unrelated attributes. Do not fake the market lifecycle or replace capture completion with the manual instant-delivery preview.

Suggested arithmetic fixture: two never-collected cells with exposures 4 and 8, price $5/unit, priority 3 points/unit, cadence 1,000 seconds, and $100 starting cash. Initial quotes are $20/$40 and priorities 12/24. Use explicitly labeled test values of 10,000,000 bytes/image and 8 Mbps (1,000,000 bytes/second); these are decimal bytes, distinct from the app's MiB defaults. Vary capacity for retention cases.

Use two complementary contact fixtures:

- **Exact intervals for chronology:** Add a narrow contact-prediction dependency to ground operations, defaulting to the real predictor. The test provider returns deterministic windows clipped to each requested range, with correct continuation flags, and filters down stations. All subsequent upload, runtime, capture, transfer, and settlement handling stays real. It must handle starting inside a contact without generating another logical entry/upload on every step.
- **Real predictor integration:** Run at least one case with the default orbit/contact predictor and a configured station. Use a fixed horizon and targets safely within access, not threshold-grazing targets. Check contact edges against `createWorldSnapshot` range/availability samples. Keep static availability variants; dynamic outages are OPS-02 work. The exact fixture alone cannot prove the real predictor filters down stations correctly.

For real captures, author targets near the spacecraft path and compute command durations with the shared feasibility helper, checking a comfortable access margin. Verify successful and impossible target cases. Arithmetic expectations for revenue, bytes, and counts must be independently specified, not computed by calling the function being asserted.

For an isolated transfer arithmetic check, an image captured at second 20 with contacts `[10,25)` and `[40,50)` must have 5,000,000 bytes at 25, unchanged bytes at 40, and finish at 45. Cash stays $100 until delivery, then becomes $120. This small component case supports, but does not replace, a capture executed from an uploaded TEL.

## 4. Required scenario matrix

Implement focused cases sharing fixture helpers, rather than one giant scenario with ambiguous failures.

| Case | Evidence required |
| --- | --- |
| Upload and exhaustion | Ground version changes outside contact while onboard version/commands remain unchanged; upload at available entry; each command completes once; exhausted TEL reports Standby. Later contact must not replay an unchanged plan. |
| Down station and no contact | Real prediction yields no available exchange for a down station. No upload, transferred bytes, or revenue outside available contact. Missing TEL reports the existing no-upload cause. |
| Successful and failed capture | Real uploaded commands exercise shared feasibility. Success creates one identified image and resets recovery without cash. Impossible access/timing creates no image, cash, or reset, and records a failure reason. |
| Partial transfer and resumption | Check the arithmetic example above, a gap between contacts, and repeated advancement after delivery. Exactly one settlement per image. |
| Capacity and retention | Store two images with unequal priorities in one-image capacity outside contact. Lower priority is deleted, including when the incoming image is lower priority. Deleted imagery never settles; its successful capture still reset recovery. Cover prototype oldest-capture/ID ties separately. Partial bytes do not reduce the full-size storage charge under the current prototype policy. |
| Capture during contact | Assert zero bytes from before capture and no extra bytes at contact exit. Upload and transfer of previously stored imagery can occur on the same pass. |
| Earlier delivery versus later eviction | During one long contact, image A has enough time to fully deliver before image B is captured, with capacity for only one image. A must earn revenue and free capacity before B arrives. Multiple captures in a large advance must match small advances. |
| Ground revision with work onboard | Revise the ground plan between contacts and ensure already uploaded captures still execute with their original metadata. The integration suite changes player priority after upload and confirms the onboard version and image payout remain unchanged while retention priority uses the updated rate. Use a later upload after prior work finishes; active/locked replacement policy remains outside this task. |
| Repeat/reset | Extra advances cannot duplicate capture, delivery, or deletion effects. Reset clears pending capture metadata, pointing, clock, plans, inventory, and cash back to the supplied scenario; rerunning reproduces the business outcomes. |
| Greedy-plan smoke case | Once authored cases pass, generate one plan with CELL-04B and run it through the same upload/execution path. No automatic replanning or search changes are required. |

Run temporal cases from fresh identical state with one large advance, regular small advances, and irregular fractional advances that sum to the same duration. Also split exactly at contact/capture/delivery boundaries. User edits must occur at the same absolute simulation times in every run; split the large advance at those external inputs so the compared scenarios remain identical.

## 5. Comparison and tolerance rules

- With exact contact fixtures, require the same image/command identities, plan versions, outcomes, capture/deletion/settlement counts, recovery state, inventory status, bytes, and cash at matching checkpoints. Cash must reconcile as starting cash plus the unique delivered-image quotes. Require semantic lifecycle order; assertions must catch effects applied out of time order, not merely sort a bad log into passing order.
- `image-transfer-progressed` events are emitted per transfer call. Small steps can legitimately produce more progress records, and the sequence-based lifecycle event IDs can therefore differ. Compare irreversible events by kind and image/command identity, and compare progress via checkpoint bytes. Do not require equal raw event arrays, global event IDs, or total diagnostic event counts across step sizes. Within each run, event identities must remain unique and no duplicate business effect is allowed.
- Fractional intervals can expose `Math.floor` loss in per-call byte budgets. Use whole-byte arithmetic cases first, then fractional partitions. A growing partition-dependent loss is a defect to fix, for example by carrying fractional transfer capacity, not by increasing a tolerance for each call. Float comparison tolerance must be small, named, and justified; it must never permit missing captures or duplicate revenue.
- Keep contact geometry approximation separate from event integration. The real predictor currently refines to about one second and ground operations scans every 120 seconds; request boundaries can shift sampling. Document the configured tolerance and check each predicted edge against range samples around it. For two independent runs, derive allowed timing/byte differences from their boundary-error bounds and link rate, not a blanket percentage. Select ample-margin fixtures so this cannot change success, deletion, or settlement counts. A missed whole pass or extra upload is not rounding noise.
- Close-approach passes shorter than the coarse scan can be missed; OPS-04 must state the tested geometry limits and report newly discovered failures. Proving all possible contact/access geometry or continuous whole-cell visibility is beyond this slice.

## 6. Delivery sequence and checks

1. Record the baseline failures above; repair the existing runtime regression and make the domain import graph compatible with the existing Node test approach.
2. Extract the shared coordinator with a small exact-contact smoke fixture. Route both playback and manual time advance through it. Keep reset on the same state owner.
3. Add the scenario matrix incrementally; reproduce and fix chronology, identity, or transfer defects against the documented rules. Keep fixes reviewable and avoid unrelated simulation redesign.
4. Add the real-contact and greedy-plan cases, run the relevant suite and production build, and inspect the browser flow below.

The implemented entry is `tests/operationalLoop.test.mjs`, using `node:test` and `node:assert/strict`; run:

```powershell
npm run test:runtime
npm run test:operations
node --test --test-isolation=none tests/cellEconomy.test.mjs tests/cellMarketState.test.mjs
npm run test:cells
npm run build
```

The operational suite is self-contained. The market/geography tests use checked-in `public/data/cells` assets. Current passing checks: runtime 4/4, operations 11/11, market tests 10/10, cell tests 5/5, and production build. `git diff --check` passes. The regression coverage includes both directions of capacity eviction, fractional transfer partitions, real contact prediction, reset/replay, priority edits that preserve onboard TEL and payout, and a greedy-plan smoke case.

For the browser walkthrough, reset and pause; create an authored or greedy ground TEL; advance through upload, capture, and settlement; inspect ground/onboard versions, capture outcome, inventory, and revenue in Spacecraft/Orders. Change priorities between contacts and confirm the onboard plan remains stable. Resume/pause and switch tabs to confirm state persists. The Orders instant-settlement shortcut is not evidence for live downlink. The live dev-browser run generated ground TEL V1, observed its upload and onboard execution, then observed a successful capture for cell `C0627880` with `$88.54` value potential and no capture-time cash. After subsequent available contacts, the TEL exhausted and entered Standby. At simulation time T+12:09:42 the Orders view showed `$5,607.37` realized revenue, zero onboard images, zero partial downlinks, and `$0.00` value lost to deletion. Partial transfer is asserted by the deterministic integration suite; its brief in-flight state was not visible at 300× playback. Fixture-only retention cases are covered in domain tests without a new debug panel.

The tested prototype path is verified. Limits remain: the live browser run did not visually sample partial transfer at its brief default-rate duration, and geometry is approximate (120-second contact scan with approximately one-second edge refinement), so this does not prove every possible short pass. Neither limit prevents beginning the next implementation task; contact geometry improvements remain separate work.
