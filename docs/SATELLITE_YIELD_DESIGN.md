# Per-satellite yield on Summary

**Status: Implemented prototype (2026-11-02).** Per-satellite yield, collection outcome charts, and nominal/power-limited time charts are live in Summary. Anomaly and scheduled-downtime time remain labeled **Not modeled** until those systems exist. This also supplies outcome evidence for RUN-01 and a future challenge debrief.

## Player-facing design

Keep each satellite's current payload, battery, and next-contact readouts. Add a compact performance section beneath them, labeled **This run · since launch**. For the continuous prototype, a run means time since reset; a purchased satellite starts its own elapsed-time clock at registration.

| Metric | Definition |
| --- | --- |
| Paid clear yield | Collections with observed mean cloud cover **<=20%**, fully delivered, and positive credited revenue / all resolved collection attempts × 100. Display the fraction beside the percentage. |
| Total collections | Resolved collection attempts, including cloudy and other failed commands. Label the tile **Collection attempts** to avoid implying every attempt produced an image. |
| Total dollar yield | Actual downlink revenue credited to this satellite, in dollars. Label **Delivered revenue**; do not subtract shared station costs or include onboard potential value. |
| Deleted images | Unique images deleted before delivery, including storage-pressure deletion of a newly captured image. Partial transfers subsequently deleted still count once and earn nothing. |

The denominator includes executed capture commands resolved as success or failure, including power rejection at their original completion boundary. It excludes future plans, commands cancelled before execution, and the currently running capture until resolved. An interrupted capture that actually began must eventually receive an explicit failed outcome rather than disappear from the count. This makes the headline an operational attempt-to-income yield, not a weather-only success rate.

Use **— · no collections yet** for an empty denominator; use zero only after at least one resolved attempt. Total dollars and deletion counts can start at zero. A delayed downlink increases paid yield without increasing total attempts. Counts and percentages are cumulative for the run; keep the existing company three-day average distinct. Do not add rolling-window filters in the first slice, because deliveries may belong to captures outside the selected window.

### Collections chart

**Recommended:** A small doughnut with total attempts in its center and a text legend showing count and percentage for each outcome. A compact stacked bar can replace the doughnut on narrow cards. Text remains available without hover or color perception.

| Exclusive slice | Meaning |
| --- | --- |
| Successful · paid clear | An image with observed cover <=20%, fully delivered, with positive posted revenue. |
| Awaiting downlink | A usable image still onboard, including partial transfers. |
| Deleted | A usable image deleted before full delivery. |
| Cloud rejected | An executed collection rejected by the scenario's actual weather acceptance rule; no image is created. |
| Other failure | Power, geometry, timing, or another recorded execution failure. Expand the legend to see the reason counts. |
| Other delivered | A delivered image that did not meet paid-clear criteria: zero payout or unavailable observed-weather data. Show the breakdown rather than labeling it successful. |

Every resolved attempt belongs to exactly one slice. Successful capture initially enters awaiting downlink, then moves to delivered or deleted; those transitions never create another attempt. A cloud failure is not a deleted image. Hide zero-size wedges but retain useful zero counts in the legend. Show active collection separately below the chart. An optional deletion sublabel can show lost *potential* dollars, clearly distinct from delivered revenue.

Illustrative card values: **60% paid clear (60/100)**, **100 collection attempts**, **$6,200 delivered revenue**, **8 deleted**. Its doughnut could contain 60 paid clear, 12 pending, 8 deleted, 15 cloud rejected, and 5 other failures. These are layout examples, not measured balance targets.

### Cloud acceptance rule

The agreed acceptance rule and clear-quality metric use observed mean cover **<=20%**; exactly 20% qualifies and values above it fail. Use the observed time-weighted mean over collection, excluding slew, not the forecast displayed in Schedule or the monthly cloud map.

**Implemented:** `weather.ts` defaults to **<=20%** usable cover, and `OperationalLoop.executeCapture` records observed cloud, threshold, outcome reason, interval, and image identity. Forecast scheduling bands are <=20, <=40, <=60, and >60%; they guide scheduling but do not decide actual capture success.

This changes capture outcomes, cell recovery, planner expectations, and revenue balance. Record observed cover and the rule applied at capture so later configuration changes cannot rewrite past outcomes. Missing observations are never assumed clear: the prototype currently classifies a delivered image without observed weather under **Other delivered**. A dedicated unknown-weather count and provisional-yield indicator remain follow-up work. Retune forecast scheduling weights against the 20% acceptance rule, but the forecast must never decide actual capture success.

## Satellite-time chart

The implemented prototype doughnut is titled **Operational time**, with elapsed simulated hours since launch in the center. This measures availability constraints, not imaging utilization. Nominal can include productive work, standby, waiting for a station, eclipse with sufficient battery, and idle gaps in a TEL. None of those automatically means scheduled downtime.

| Exclusive state | Time counted |
| --- | --- |
| Anomaly | An active satellite anomaly explicitly restricts capability. A ground-station outage alone does not put the satellite in this state. |
| Scheduled downtime | An explicit planned suspension/maintenance interval for that satellite. |
| Power limited | Depleted recovery, a power-rejected capture's reserved slot, or a real downlink opportunity blocked by the energy guard. Low charge or eclipse alone is insufficient. |
| Nominal | All other operational time. |

Proposed overlap precedence is **anomaly → scheduled downtime → power limited → nominal**. A second cause may remain in detail, but the chart counts each second once. Label power limitation as a constraint on some work: capture may continue while downlink is held. This metric does not estimate opportunities the planner avoided for power reasons.

Accumulate simulated interval duration at domain transitions, including an open interval through the current simulation time. Do not sample animation frames or multiply the current status by total elapsed time. Global pause adds no time; time acceleration changes no proportions. Registration starts the denominator, reset clears it, and a future mission deadline freezes it. At zero elapsed time show an empty chart.

The prototype has measured operational-duration history for nominal and power-limited intervals. Satellite anomalies and explicit scheduled downtime are not modeled. The chart shows the measured categories and labels the others **Not modeled**, rather than presenting invented history or proven zero downtime. Enable their wedges when their owning systems emit intervals.

## Implementation plan

### YIELD-01 — Collection evidence and Summary metrics

1. Add a renderer-independent per-satellite outcome model, provisionally `src/simulation/satellitePerformance.ts`. Extend capture completion reporting with a typed reason, stable attempt/runtime action identity, satellite and command IDs, collection interval, observed mean cloud cover, applied threshold/comparison, completion time, and image ID when created. Existing `GroundOperations` events currently carry a success/failure kind and descriptive text; do not parse that text for statistics.
2. Record one resolved attempt in `OperationalLoop.executeCapture`, including power/geometry/timing failures. Preserve evidence before transient command bookkeeping is removed. Join image identity to `CellMarketState`'s existing onboard/delivered/deleted lifecycle. Handle immediate storage deletion as the same attempt and use idempotent identity for replayed notifications.
3. Attribute existing `downlink-revenue` ledger entries through `sourceId` (image ID) to the image's satellite. Sum integer cents from the ledger; never create another settlement path or sum floating-point estimates. Make clear-qualified revenue available in detail if it differs from the total.
4. Expose a read-only per-satellite snapshot and aggregate fleet totals. Fleet yield is total qualifying attempts / total attempts, not the average of satellite percentages. Tag developer preview captures separately so manual samples do not masquerade as live weather evidence; disclose preview/unattributed amounts when reconciling against the company ledger. Reset clears all history and new satellites begin with zero counts.
5. Extend `renderSummarySatelliteCards` using a focused UI helper with tiles, accessible legend, and a small SVG/CSS chart. Refresh derived metrics on outcome/lifecycle/ledger revisions rather than scanning all history each animation frame. Keep the existing compact cards and stack content in the split layout. No chart service or extra framework is needed.

**Implemented:** Structured per-attempt evidence joins capture outcomes to image delivery/deletion and the existing settlement amount. Summary counts resolved attempts, shows paid clear yield, delivered revenue, deletions, and mutually exclusive current outcomes. The live run now exposes the capture-failure counts that were missing from RUN-01 review.

### YIELD-02 — Measured operational time

The prototype integrates disjoint simulation intervals in the operational loop. It counts depleted recovery, a power-rejected capture's scheduled slot, and an available downlink held by the energy guard as power limited; other time is nominal. It does not sample animation frames. A satellite's clock begins at registration, pauses with simulation time, and resets with the run. Unit and operations checks cover irregular time advances and power-limited intervals. Anomaly and scheduled-downtime wedges remain explicitly not modeled until those systems emit real intervals.

### Acceptance scenarios for implementation

- A <=20% capture awaiting downlink increments attempts and pending, earns no revenue, and does not increase paid yield. Full positive-value settlement moves it once into paid clear.
- Cloud values just below, exactly at, and above 20% classify correctly: 19% and 20% are accepted; 21% fails. Unknown weather stays explicit.
- Cloud rejection, power rejection, geometry failure, and future planned commands remain distinguishable. Slice counts equal resolved attempts; repeated notifications cannot double-count them.
- Immediate storage eviction and deletion after partial downlink count one deleted image and zero revenue. A delivered zero-value image is delivered but not revenue-producing.
- Satellite revenue sums reconcile with the existing company ledger, with any preview/unattributed entries separately explained. Two satellites' counts and image lifecycles never leak into each other.
- Reset removes history; purchased satellites start at their registration time. Active captures and empty data render honestly. Text exposes counts/percentages without relying on chart colors.
- Time wedges sum to elapsed lifetime within numeric tolerance, and identical transitions yield identical durations regardless of time-step size, UI refresh rate, or acceleration.

## Suggested delivery order

YIELD-01 and the prototype slice of YIELD-02 are implemented. The RUN-01 baseline repeats under the <=20% rule are recorded in [CHALLENGE_RUNS.md](CHALLENGE_RUNS.md#20-cloud-rule-baseline-2026-11-02); they inform mission design but do not establish final balance. Extend time tracking when anomaly and maintenance systems are implemented.
