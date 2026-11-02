# Replayable challenges: development plan

**Updated 2026-11-02.** The [Gameplay brief](GAMEPLAY.md#replayable-challenge-flow--agreed-direction-2026-11-02) owns the approved player experience. This document records implementation evidence and recommended development work. Proposed mechanics and numeric values below are not approved gameplay rules.

## Current foundation and gaps

| Area | Current evidence | Work needed |
| --- | --- | --- |
| Simulation | `src/simulation/operationalLoop.ts` advances contacts, capture, resources, transfer, and settlement independently of rendering. | A run lifecycle and authoritative deadline; every time-advance path must respect it. |
| Setup | `src/simulation/spacecraftCatalog.ts` quotes and purchases Standard/Enhanced equipment; `src/main.ts` exposes orbit selection for live launches. | Draft configuration before time starts, validation, and initialization from the chosen mission/setup. |
| Accounting | `src/simulation/companyFinance.ts` separates cash, revenue, contact costs, and capital spending. | A specified victory metric derived from this ledger, with setup costs and budget treatment explicit. |
| Retry | Domain reset exists; `src/main.ts` restores the initial fleet and hard-coded form defaults. Weather configuration includes a fixed seed. | Retry a selected mission with a chosen setup; verify complete reset of market, finances, imagery, plans, power, IDs, and event state. Existing reset is not a finished mission retry flow. |
| Feedback | Existing finance, schedule, spacecraft, and market views expose pieces of the outcome. | A bounded debrief with consistent totals and evidence for the main bottlenecks. |
| Content | Station availability is static; market trends and the drafted outage response are not implemented. | Add one new constraint at a time after the first mission is playable. |

**Early RUN-01 progress (2026-11-02; historical):** Four inactive station offers and their purchase lifecycle are implemented; lease access, per-site link/rate variety, and globe-only location previews are included. Focused checks cover station purchase affordability, idempotent capital accounting, activation/reset, spacecraft Enhanced-slew procurement/reset, and shared antenna handoff. At 300×, an earlier short one-spacecraft sample reached T+03:29:24, showing $795.41 realized revenue, $1,132.74 in station contact fees, cash of -$50,337.33, and one image aboard at the observed instant. This sample predates the station-economy change and is not a balance conclusion. The Orders review confirmed the market table, filters, sorting, map layers, selected-cell detail, and “Focus on globe” behavior; see the review below. The local UI confirmed the four offers start outside the operational network, the original four stations remain active, the default 550 km procurement orbit is valid, and “Show location” draws an offer marker.

**Station accounting verification (2026-11-02):** Runtime tests now verify owned-site daily upkeep, one full charge per day across large and irregular advances, first-day proration after mid-day activation, reset clearing, and lease contact billing without daily upkeep. The finance/procurement and station tests pass 12/12; runtime, operations/weather, power, and cell suites pass 57/57; the production build passes. The 20% cloud-rule baseline below reruns the revenue/cost measurement with the current station accounting.

**Orders review (2026-11-02):** The live view showed the sample market table, category controls, filters, sorting, paginated eligible-cell list, and selected-cell detail panel. Selecting a cell populated its geography, mapped attributes, cloud baseline, available/maximum payout, priority, and category breakdown; “Focus on globe” moved the selected cell into view and outlined it. This confirms the visible readout and focus interaction, not the accuracy of underlying sample market balance.

**Funded browser procurement (2026-11-02):** Added a development-only `?scenario=funded-procurement-test` fixture that visibly starts with $70,000,000; the normal route still opens at -$50,000. In the browser, purchased and launched Asteria-2 with Enhanced slew ($55M), then purchased Honolulu Relay ($10M). Finance showed $65M capital spending and $5M cash; the fleet count became two, Asteria-2 showed its 550 km / 53° orbit and Enhanced slew, the active station network became 5/5, and Honolulu appeared in the network table. Reset returned to day 0, $70M cash, one spacecraft, and the original four stations with no preview imagery. This also exposed and fixed the narrow-screen operating-cost label, which had incorrectly said “CONTACT · $/min” while displaying daily maintenance.

**One-day live-run samples (2026-11-02):** Both runs used the default market/weather seed, four owned stations, Asteria-1 Standard at 550 km / 53° / 12° / 8°, automatic planning, no manual policy changes, and 300× playback. The single-spacecraft run started with the normal -$50,000 balance and stopped at T+24:21:39: $6,191.37 delivered revenue, $550.00 daily station upkeep, $0 capital spending, +$5,641.37 operating result, and one 10 MiB image still onboard. The funded two-spacecraft run started with $70,000,000 through the development fixture, added Asteria-2 Standard at 550 km / 53° / 12° / 188° for $50M, and stopped at T+24:34:44: $8,599.48 delivered revenue, $550.00 upkeep, $50M capital spending, +$8,049.48 operating result before capital, and no imagery onboard. Revenue was credited to both spacecraft. Each run took about five minutes of wall time at 300×. These representative samples are not repeated trials; their slight duration overshoot and different initial balances/setup mean they are not a controlled profitability comparison. They used the former <=60% cloud rule and do not predict the new <=20% economy.

### 20% cloud-rule baseline (2026-11-02)

The single-spacecraft run was repeated twice from reset with the same default market/weather seed, -$50,000 opening cash, four owned stations, Asteria-1 Standard at 550 km / 53° / 12° / 8°, automatic planning, no manual policy changes, and 300× playback. The funded comparison used the same seed and four stations, started with the development fixture's $70M, was paused at T+00:03:49 for setup, and purchased Asteria-2 Standard at 550 km / 53° / 12° / 188° for $50M before resuming playback. All runs used the implemented <=20% collection rule.

| Run | Elapsed simulation time | Delivered revenue | Operating costs | Capital spending | Operating result | Collection outcomes | Imagery remaining |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Single-spacecraft A | 25:14:59 | $2,509.77 | $550.00 | $0 | +$1,959.77 | 17 attempts: 1 paid clear, 15 cloud rejected, 1 other failure | None; 1 delivered, 0 deleted |
| Single-spacecraft B | 25:39:39 | $2,509.77 | $550.00 | $0 | +$1,959.77 | 12 attempts: 1 paid clear, 9 cloud rejected, 2 other failures | None; 1 delivered, 0 deleted |
| Funded two-spacecraft | 24:24:48 | $806.47 | $550.00 | $50,000,000 | +$256.47 before capital | 25 attempts: 1 paid clear, 20 cloud rejected, 3 other failures, 1 awaiting downlink | 1 onboard 10 MiB image; 1 delivered, 0 deleted |

Both single-spacecraft runs ended with -$48,040.23 cash. The funded run ended with $20,000,256.47 cash after the $50M purchase; Asteria-2 earned $806.47 and Asteria-1 had one image still onboard. Fleet paid-clear yield was 1/25 (4%): Asteria-1 had 0/14 paid clear, 12 cloud rejections, 1 other failure, and 1 pending image; Asteria-2 had 1/11 paid clear, 8 cloud rejections, and 2 other failures. Revenue and operating costs matched across the two single-spacecraft runs, but their attempt/failure counts differed. The runs overshot 24 hours by 1:15–1:40, so this is evidence of repeat revenue and ledger behavior, not an exact replay-consistency result or a controlled capture-rate estimate. Each run took approximately 4½–5 minutes of wall time at 300×. Owned-station costs were daily maintenance; no lease contact fees or recurring spacecraft costs were charged. Maintenance crossed two simulation-day boundaries in each sample.

**Yield instrumentation (2026-11-02):** The accepted <=20% threshold is implemented. Summary reports resolved collection attempts, paid-clear yield, delivered revenue, deletions, weather/other failures, and measured nominal/power-limited time for each satellite. Anomaly and scheduled downtime remain marked not modeled. The historical one-day runs above used the former 60% rule; the new baseline below is the current evidence.

**RUN-01 finding:** Baseline measurement and the funded procurement walkthrough are complete. The Summary exposes per-satellite yield and failure counts; finance reconciles realized downlink revenue, maintenance, capital spending, and cash. The same-seed single-spacecraft runs match delivered revenue and costs, while the different stop times prevent claiming identical operational replay. Use these as prototype observations, not balance targets. RUN-02 still needs explicit mission budget, duration, objective, and retry decisions. Exact mission deadlines belong to the future run controller.

The first operations-suite run exposed that authored captures skipped weather checks when no automatic-planning grid was attached, despite having a valid cell market. Capture execution now gets the stable cell ID from the market snapshot; all 36 operations/weather checks pass.

The RUN-01 measurements and operations checks are recorded above. Current build passes. Local UI review confirmed lease prices, daily upkeep, varied link speeds, aggregate access estimates, and the globe preview checkbox; visual review of Orders confirmed the sample market table, filters, sorting, and map layers are present. The globe uses luminous, borderless spacecraft orbs and antenna-style station beacons, with distinct colors for owned, leased, and preview locations. Funded procurement, the 20% baseline repeats, and per-satellite failure visibility are complete. Exact operational replay remains unverified because the manual runs stopped at different simulated times; the run controller needed for exact mission deadlines is future RUN-03 work.

## Recommended development sequence

### RUN-01 — Establish a trustworthy baseline

**Baseline slice complete (2026-11-02).** Funded purchase, activation, finance reporting, reset, shared-antenna behavior, and per-satellite yield/failure reporting have been reviewed. The 20% rule was measured in two same-seed single-spacecraft runs and one funded two-spacecraft run. The repeated single-satellite revenue and costs matched, while the manual stopping times and attempt counts differed; do not claim exact operational replay from these samples. Include the existing map/readout review only where it affects understanding of these actions.

The recorded sample set covers two repeated single-spacecraft runs and one funded two-spacecraft case, with setup, seed, duration, policy, revenue, costs, capital, remaining imagery, outcomes, and approximate wall time. It does not isolate hardware/orbit effects; use comparable independent runs for those questions. No balance values were changed as part of the measurement.

**Finding:** These samples provide a first observed revenue/cost range for RUN-02, but they do not establish a balanced economy or a guaranteed attainable objective. Do not silently rebalance the existing prototype or declare profitability from potential imagery value. Exact deadline enforcement belongs to RUN-03.

### RUN-02 — Define the first mission

**Status: Draft recommendation informed by RUN-01; no mission-specific values are approved yet.** The first mission should reuse the current market, weather, spacecraft, and finance systems. It should test satellite setup and ground-side policy in one short attempt, without adding dynamic events or a campaign economy.

#### M01 — First Delivery (proposed)

| Brief item | Draft proposal | Basis or implementation note |
| --- | --- | --- |
| Setup allowance | $55,120,000 starting mission cash. | Fits either current package plus $20,000 for four station setup fees: Standard at $50M leaves $5.1M; Enhanced at $55M leaves $100,000 for operations. A proposal, not a balance decision. |
| Fleet | Buy and configure exactly one Standard or Enhanced-slew spacecraft before the clock starts. Hardware and orbit lock for the attempt. | Existing packages cost $50M/$55M and launch is free. This keeps the first mission focused; later missions can offer multiple spacecraft. |
| Orbit and access | Choose altitude, inclination, ascending node, and phase. Show predicted aggregate station access minutes per day and the resulting station coverage before launch. | Orbit choice and location matter to contact opportunity. The current access preview is available for additional station offers; an aggregate view for the mission's active network is still needed. |
| Ground network | Use the four starter stations. Charge a **$5,000 one-time setup fee per station** at mission setup ($20,000 total), then account for daily maintenance separately. No station purchases, leases, outages, or geopolitical events in M01. | User-requested nominal fee. It is separate from recurring maintenance and makes setup visible without materially competing with spacecraft package cost. Reset/retry restores the same mission balance and charges the setup fee again. |
| Market and weather | Use the current sample market and default deterministic weather seed; retain the accepted <=20% cloud rule. | The single-spacecraft baseline produced $2,509.77 twice under this seed; it is evidence for a candidate, not an economy guarantee. |
| Objective | Deliver at least **$2,000 in realized downlink revenue** by the deadline. Count ledgered delivery revenue only; do not count capture potential, starting cash, or unused setup funds. Show operating costs, capital spending, and ending cash separately in the debrief. | Both repeated single-spacecraft samples delivered $2,509.77, but stopped after 25 hours. The target is a testable candidate, not yet verified at an exact 24-hour boundary. It tests the user's stated “make money” goal without implying short-mission recovery of spacecraft capital. |
| Duration | **24 simulation hours**, with 300× as the proposed default playback rate and pause/rate controls available. Target roughly 4–5 minutes of wall time. | Recent samples took about 4½–5 minutes but overshot the day by 1:15–1:40; a mission controller must enforce the exact deadline before the duration is approved. |
| Live controls | Allow the player to adjust category priorities on the ground and pause or change playback speed. Keep installed hardware, orbit, and spacecraft count fixed after start. Revised ground plans take effect only on contact upload. | Reuses current ground-side planning and contact behavior; excludes mid-run procurement and maneuvers from this first brief. |
| Evaluation | Evaluate at the 24-hour deadline. Include revenue settlements completed exactly at the deadline; do not credit partial downlinks or potential image value. Stop all simulation advancement at the deadline. Report any onboard image or in-flight work separately. | Aligns evaluation with existing exactly-once full-delivery settlement. RUN-03 must implement the deadline boundary; the current continuous run can overshoot during manual pause. |
| Retry | Retry starts from the same mission cash, fleet baseline, market, and weather seed; the player may change the setup and ground priorities. No permanent loss. | Makes attempts comparable while preserving the try-and-adjust loop. Exact outcome replay still depends on identical player action times. |
| Progression | Completing M01 advances to a follow-on brief. Cash/fleet carryover between levels is not needed for M01 and remains open. | User-approved direction supports levels and new per-round setup; campaign persistence can follow the first playable loop. |

The candidate $2,000 revenue target and $55.1M allowance need review together. If the intended lesson is operating profitability instead of delivered sales, define the win condition as ledgered revenue minus operating costs and retune the target from exact-deadline samples. Do not silently switch between revenue, operating result, and post-capital cash change.

#### RUN-02 decisions still open

- Approve or revise the proposed $55.12M allowance, the $5,000 per-station setup fee, the Standard/Enhanced choice, and the one-spacecraft limit.
- Approve delivered revenue as the victory metric and the $2,000 target, or choose operating result/post-capital cash instead.
- Confirm the 24-hour simulation duration after the controller can stop exactly at its boundary; confirm whether 300× is a suitable default for a roughly five-minute attempt.
- Confirm that the $20,000 total station setup fee and daily maintenance are paid from the challenge budget; the draft shows both separately from revenue and capital spacecraft purchases.
- Set permitted orbit bounds and confirm the required aggregate access preview; keep orbit geometry a meaningful setup choice.
- Confirm category priorities as the only live policy control for M01; station procurement, satellite procurement, and maneuvers stay pre-launch in this proposal.
- Keep same-seed retry behavior for M01 or allow an explicit weather/market variant; decide cross-level cash/fleet carryover later.

**Done when:** The brief, numeric inputs, victory metric, deadline behavior, setup/intervention rules, and retry conditions are explicitly approved; one plausible setup can meet the objective at an exact deadline; and a failed attempt still explains its result. Later-level carryover and unlocks can remain open.

#### M01 implementation handoff (RUN-03)

- Setup is a draft state: show the $55.12M allowance, four $5,000 station setup charges, one chosen spacecraft package, editable orbit, initial ground priorities, and the resulting remaining setup cash before the player starts time. Reject an invalid or over-budget setup without changing the clock or finance ledger.
- Calculate and display the selected orbit's aggregate access minutes per day through the four active stations. Explain that simultaneous access windows can compete for a station antenna. This readout is a planning estimate, not guaranteed collection/downlink throughput.
- On mission start, initialize a clean attempt with the approved budget, one purchased satellite, the fixed station network, scenario market/weather state, and run-scoped performance history. Post each station setup charge once for that attempt, separate from daily upkeep and spacecraft capital spending. Retrying creates a fresh attempt and charges setup again from the reset budget.
- During the run, category-priority edits remain ground-side until the next valid contact upload. Pause and playback controls do not alter simulation outcomes. No station/spacecraft purchases or orbital maneuvers occur after start in M01.
- At exactly 24 simulation hours, process each event with a completion timestamp at or before the deadline once, then stop advancement. A settlement completed at the deadline counts; a partial transfer does not. Any unfinished image or operation appears in the debrief without being credited as revenue.
- Evaluate only ledgered downlink revenue against the proposed $2,000 target. Show the target and outcome, delivered revenue, setup fees, daily operating costs, spacecraft capital, ending cash, per-satellite yield, and onboard/deleted imagery as separate values. Never add starting cash, unused budget, or potential image value to earned revenue.
- Retry restores the same mission market, weather seed, initial budget, station network, fleet baseline, and empty operational history while allowing a new package/orbit and new priority policy. It must not reuse any prior attempt's ledger entries, images, commands, or capture statistics.

### RUN-03 — Deliver one complete challenge

**Blocked on RUN-02 design decisions, not selected for implementation by this documentation change.** Build the smallest end-to-end setup → run → debrief → retry path using the existing simulation.

**Proposed implementation boundary:** A renderer-independent mission definition holds the budget, permitted setup, environment/seed, duration, and objective. A run controller owns lifecycle and deadline enforcement; all playback and explicit advances route through it. Reuse the existing operational loop, capability validation, and finance ledger. Initialize a clean attempt from a validated setup; do not simulate setup by launching while the clock is already running.

The first debrief should show target/result, delivered revenue, operating costs, capital spending, and remaining/deleted imagery with clearly labeled value. Add a small number of observed failure/wait explanations supported by available data. Identify any missing instrumentation rather than inventing precise lost-revenue estimates. Return directly to editable setup for a retry.

**Acceptance handoff:** Validate invalid/unaffordable setup without starting time; identical inputs/actions replay consistently; pause and all playback speeds obey the deadline; a large step cannot earn income beyond it; repeated finish/evaluation cannot duplicate settlement; partial transfers follow the chosen cutoff; retry clears prior operational/financial state; the result is understandable in the browser. Preserve existing simulation regression coverage.

### RUN-04 — Tune, then add a contrasting mission

**Needs playtest evidence.** Use TUNE-01/UI-04 to address observed pacing, dominant strategies, confusing results, and retry friction. Add a second mission with one clear constraint after the first loop is enjoyable. A fixed degraded station or a second satellite can test variety before implementing dynamic events.

Dynamic outages then reuse OPS-02 after reviewing notice timing, repair terms, and restoration/upload behavior. Market-change missions need explicit category price timing, player notice, and interaction with existing frozen capture-time quotes. Neither broad approval of levels nor this plan approves the older outage's $100 repair or 30-minute duration.

## Work that can wait

- Full climatology acquisition remains valid CLOUD-01 work, but the deterministic interim baseline supports an initial mission if its lack of seasonality is disclosed.
- FLEET-03 maneuvers, broad hardware catalogs, and additional anomaly types should follow a demonstrated mission need.
- Save/load becomes more valuable if measured sessions are long; campaign progress persistence and saving an active attempt are separate design needs.
- Publishing remains independent release work. New services or accounts are unnecessary.
- Cross-level fleet/cash carryover, unlocks, medals, branching campaigns, and sandbox availability remain open expansion choices.
