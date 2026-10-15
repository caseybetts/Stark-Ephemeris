# CLOUD-01 cloud, forecast, and capture design framework

**Status: prototype behavior approved 2026-10-14; deterministic simulation slice implemented, public NOAA baseline selected.** [Gameplay](GAMEPLAY.md#agreed-scheduling-behavior) remains the source of truth. The runtime still uses a temporary flat 50% baseline until the NOAA table is downloaded and processed; the source choice itself is resolved.

## Goal and boundaries

Give the capture loop a deterministic, spatially varying cloud condition and give the ground scheduler a separate, imperfect estimate of capture usability. The same scenario must replay identically across playback speeds, time partitions, and replanning. Actual weather is authoritative only when a capture executes; the planner must never inspect it.

Keep the model renderer-independent and local. There is no live weather service, account, or backend requirement. Clouds affect image usability, not satellite power, contact availability, geometric access, cell value, or downlink. Cloud graphics are optional presentation work and are not part of this task.

## Agreed behavior to preserve

- Use NOAA/NCEI's ISCCP-H HGM Basic monthly mean cloud amount as the seasonal baseline. Average matching months over 1984–2013 (30 complete years). HGM is already a global 1° equal-angle grid, so no spatial regridding is needed.
- Generate deterministic hourly actual cloud cover at 1° around the monthly baseline, then deterministic actual cover for a targeted ¼° cell around its parent 1° value. Clamp both values to [0, 1] and hold them for that hourly bucket.
- Keep forecast information separate and imperfect. A schedule may use estimated usable-capture probability; it may not read hidden actual conditions or reroll its forecast on every planning pass.
- An actual weather failure creates no image or revenue and does not reset cell VAM. These rules do not change the already-agreed quote-at-successful-capture and full-downlink settlement lifecycle.

The selected source is NOAA/NCEI's public [ISCCP-H Series](https://www.ncei.noaa.gov/products/international-satellite-cloud-climatology). Its Basic HGM files are CF-compliant NetCDF, 1° equal-angle monthly grids, available from the [direct download directory](https://www.ncei.noaa.gov/data/international-satellite-cloud-climate-project-isccp-h-series-data/access/isccp-basic/hgm/) or [THREDDS](https://www.ncei.noaa.gov/thredds/catalog/satellite/cdr-isccp-h.html); user registration is optional. Use the `cldamt` mean cloud amount variable in percent. The product covers July 1983 through June 2017, which supports the complete 1984–2013 averaging window. Preserve the dataset DOI, product version, variable, years, access date, checksum, and source citation in the derived asset manifest. NOAA states that data may be freely used and redistributed, and asks users to cite the dataset as specified on its page.

## Proposed system boundary

Use four small, pure interfaces:

1. **Baseline lookup:** get integer percentage points 0–100 from a versioned 12 × 180 × 360 table. It does no I/O during simulation.
2. **Actual weather:** get integer percentage points from the scenario seed, grid IDs, and hour key. It is stateless and order independent.
3. **Forecast:** return a coarse risk band and valid time for a cell and target interval from an hourly issuance. It does not expose actual weather.
4. **Capture evaluation:** return the integer cover percentage over collection time and compare it with an integer threshold at command completion.

Put the data-processing script and its manifest under a reproducible data/build path. Keep baseline loading and stateless actual/forecast calculations in Cesium-independent simulation modules. Let OperationalLoop obtain an actual-weather outcome at capture completion and let cellScheduler consume only a coarse forecast-risk category. The renderer may display a short failure reason, but must not own weather state.

## Proposed data and time model

The 1° weather grid has 180 latitude rows × 360 longitude columns and matches the Basic HGM source resolution. For each calendar month, equally average its 30 monthly `cldamt` values from 1984–2013. Confirm source axis order, latitude direction, longitude convention, units, fill values, and monthly coverage. Reorder the source's 0–360° longitude and south-to-north latitude axes to the runtime's expected grid order. Validate dimensions, range, all 360 source months, and known sample cells before writing the 777,600-byte month-major Uint8 table.

**Storage/precision proposal:** Store cover as integer percentage points from 0–100. The baseline is then 777,600 bytes (about 0.74 MiB), with a maximum quantization error of 0.5 percentage point. Quantize the monthly 30-year mean once during preprocessing. Use the same integer unit for actual cloud and forecast display/comparison; convert only at existing APIs that require a fraction. This is enough precision for a threshold-based whole-cell success rule and avoids retaining insignificant decimal digits.

The current runtime has elapsed seconds but no simulation calendar. **Proposal:** add an explicit UTC `simulationEpoch` to scenario configuration and derive weather month and hour as `simulationEpoch + simulationSeconds`; never consult the machine clock. The epoch should be serialized with a scenario/save if saves are introduced. Choose a default epoch before implementation, and define whether leap-day/calendar behavior follows ordinary UTC Gregorian time. If the first slice has no save format, the epoch still belongs in the scenario definition so every run is reproducible.

Use a fixed integer hash and approximate a bell-shaped draw by summing four hash bytes, rather than Math.random, a shared mutable stream, a lookup asset, or per-candidate Box–Muller calculations. Include scenario seed, layer, stable row/column IDs, and integer UTC hour in the key. The 1° draw key is shared by its children; the ¼° draw key is distinct per market cell. Spreads are integer percentage-point parameters. Clamp at each level. This is intentionally approximate and cheap; do not pursue high-precision fit.

For a stable broad pattern with hourly variation, **propose** splitting the parent draw into a shared low-frequency component and a smaller hourly component: one keyed by coarse weather region and a six-hour block, the other by 1° cell and hour. Their independent, approximately Gaussian components sum to an approximately Gaussian value centered on the seasonal baseline while nearby cells and adjacent hours share a persistent pattern. The child-level ¼° draw remains separate. This adds a small number of integer hash/lookup operations, uses no evolving weather state, and creates no hourly global field. Region size, component spreads, and whether this correlation is desirable remain open tuning choices. Preserve the overall parent variance when dividing its spread between components.

## Proposed actual capture behavior

Treat cloud failure as a whole-cell image-quality outcome, not a geometry or power interruption. A capture that passes geometry and power admission runs to its scheduled end. It consumes its admitted duration and capture energy even if the resulting image is unusable. At completion, compute the time-weighted mean cloud cover over the collection-only interval `[collectionStartsAtSeconds, completesAtSeconds)`, excluding slew, using the fields already returned by `evaluateCellCaptureOpportunity`. Compare it to one configured threshold; the proposed success rule is cover <= threshold. An exact end on an hour boundary has no exposure to the following hour. Power accounting still covers the combined slew/collection command under OPS-01B. This is a whole-cell gameplay quality proxy, not a reconstruction of unobscured image pixels.

If usable, follow the existing success path unchanged: create the image, freeze its capture-time payout/priority fields, and reset VAM. If unusable, record one cloud failure with the command ID, interval, observed cover, threshold, and weather-data/scenario identifiers; create no image, revenue, or VAM reset. Do not refund time or energy. Do not silently shift subsequent TEL times. This matches the existing fixed command-slot and power-accounting model.

**Retry proposal:** add no automatic retry mechanism or cooldown in this slice. Once the failed slot completes, existing scheduler refresh rules may reconsider the cell using the currently issued forecast and a later feasible opportunity. Preserve uploaded and committed work. Same-hour repeat suppression and the timing of ground knowledge of capture results remain open; do not infer permission to cancel an onboard command from a weather failure.

## Proposed forecast contract

Use an hourly forecast value per ¼° market cell. A forecast issued at a simulation-hour boundary remains fixed until the next hourly issuance; two-minute planner refreshes reuse it. **Review correction:** independent forecast noise around climatology has no information about the realized weather conditional on that climatology. The earlier prohibition on statistical coupling was too strong: the planner must not access truth, but the synthetic weather/forecast generator needs a shared signal to create forecast skill.

**Recommended low-cost model for review:** derive one coarse forecast signal from the same six-hour weather component plus separately keyed forecast error. Add more error for longer lead times. The actual hourly and quarter-degree draws keep their own keyed variation. The planner receives only a coarse forecast category and validity time; it has no API to query the latent component or actual value. A small fixed lookup maps forecast category, lead-time band, and threshold band to a coarse usable-capture weight. This gives the planner broad directional information without conditional Gaussian integration, per-candidate sampling, or claims of operational forecast accuracy. Keep it imperfect even at short lead. Error size and table weights are tuning values.

Return a coarse forecast-risk band and map it to a small integer scheduling weight (for example 0–4). For a multi-hour collection, choose the band from time-weighted forecast cover first, then apply the same table; do not sample outcomes in candidate loops. The table should be monotone with forecast cover and lead time, with a small set of fixtures. It is a scheduling heuristic, not a calibrated probability estimate. Score an opportunity as projected available priority times risk weight divided by scale; keep raw displayed priority and image payout unchanged. If playtests show the coarse weight does not improve choices, remove forecast weighting rather than adding a costly model.

The forecast may be shown to the player as a simple estimate or range, but a forecast UI is optional for the first implementation. If shown, label forecast separately from observed actual weather and explain forecast age/lead time. Do not reveal actual hourly values for locations without a completed capture.

## Integration and event ordering

Keep weather reads pure and lazy; do not generate/store a million-cell hourly weather cube. Generate only requested cell/hour values and memoize behind a bounded cache if profiling justifies it. Cache keys include all version/seed/time inputs.

At capture completion, resolve geometry and actual cloud outcomes through the shared operational path. The established order should preserve power admission and energy accounting, then settle the capture outcome: successful image lifecycle and VAM reset on usable weather; diagnostic-only failed capture on unusable weather. The planner receives forecast snapshots through its existing candidate input boundary. Replanning, UI refresh, and renderer frames cannot mutate actual conditions.

Weather failure reasons should appear with other capture diagnostics in the Spacecraft/operations view. Do not add cloud overlays, per-cell globe entities, or a new management tab as part of CLOUD-01.

## Implementation stages and verification

1. Acquire/build the baseline asset with a manifest, license attribution, checksum, units, coordinate orientation, and reproducible aggregation tool. Verify dimensions, range, missing values, dateline wrapping, and polar rows.
2. Add calendar mapping, scenario seed, stable hash/PRNG, actual hourly lookup, and tests proving key stability and order independence.
3. Add forecast lookup and tests proving forecast/actual separation, fixed forecast within its validity hour, deterministic refresh, and increasing uncertainty with lead time.
4. Integrate threshold/time-weighted completion into capture outcome and the existing planner score; preserve the current image/VAM/power/TEL invariants.
5. Add concise failure diagnostics and optional readout only if they fit the existing interface.

Acceptance should cover: data-product reproducibility and attribution; monthly/UTC boundary mapping; leap-day and hour transitions; same-seed replay across large, regular, and irregular advances; distinct seeds and cells; stable results when lookup order changes; clamp-edge behavior; a capture contained in one hour and one crossing an hour boundary; just-below/equal/above threshold; failure with no image/revenue/VAM reset but normal time/power consumption; success preserving capture-time quote behavior; forecast that is sometimes wrong and never reads actual outcomes; replan reuse within forecast validity; and identical planner/execution rules for power, geometry, and contact commitments. Keep renderer tests secondary to deterministic domain tests.

## Approved starter settings

### Approved lightweight starter package

These are proposed playtest knobs, not realism targets:

- Start the scenario at 2026-01-01 00:00 UTC and advance its calendar from simulation seconds.
- Store cloud cover as whole percentage points. Use a shared 5° region disturbance that persists for six hours, then smaller keyed hourly 1° variation and keyed ¼° variation. Suggested standard deviations are 12, 8, and 12 percentage points respectively; clamp the combined result to 0–100.
- Mark an image usable when time-weighted mean cloud over collection is at or below 60%.
- Use an imperfect forecast derived from the shared six-hour component with keyed lead-dependent noise. Map its result to four simple scheduling weights (4, 3, 2, 1 across clearer-to-cloudier bands); no probability integration or additional outcome branches.
- On weather failure, consume the scheduled time and admitted energy, create no image, and do not reset VAM. Add no retry or cooldown mechanism; later ordinary scheduling may consider the cell again.
- If the interface has a natural place, show a short risk band and forecast age beside the selected target; skip a weather map.

| Decision | Approved prototype setting | Status |
| --- | --- | --- |
| Simulation calendar | UTC epoch 2026-01-01 00:00 | Agreed |
| Actual cloud variability | 5° region pattern for six hours (12 pp), 1° hourly variation (8 pp), and ¼° child variation (12 pp) | Agreed |
| Usable image rule | Time-weighted collection cover <=60% | Agreed |
| Capture failure costs | Keep elapsed slot and admitted capture energy; no image, revenue, or VAM reset | Agreed |
| Forecast | Coarse shared six-hour signal with keyed lead-dependent error and four weights (4 to 1) | Agreed; bands/error spreads are tuning inputs |
| Planner scoring | Scale projected available priority by forecast weight; raw market priority and payout remain unchanged | Agreed |
| Retry | No automatic retry or cooldown; later ordinary planning may reconsider | Agreed |
| Player forecast display | Optional short risk band/age; no map required | Optional |

Before implementation, review the starter package and settle any changes to the calendar, spreads, threshold, failure behavior, and forecast weights. Keep validation at the level of deterministic replay, monotone weights, broad forecast direction, and responsive planning; high forecast accuracy is not a goal. The low-cost proposal avoids high-precision probability calculations.

## Feasibility, efficiency, and strategy review — 2026-10-14

**Assessment:** feasible for the static browser architecture, with a small data footprint and clean domain boundaries. Strategy quality depends on a useful low-cost directional signal and a clearly labeled planner approximation; high statistical accuracy is unnecessary. The framework is ready for design decisions, not implementation. No weather implementation or performance benchmark has been completed by this review.

### Findings requiring resolution

1. **High — forecast usefulness at low cost.** The original independent-noise forecast could not predict actual hourly deviations. The coarse shared-signal proposal gives broad directional information without costly probability integration. Check that risk weights are monotone, the forecast is sometimes right and sometimes wrong across fixed seeded scenarios, and changing the forecast can change a few scheduling choices. Do not optimize statistical accuracy or use Brier scores as an acceptance target. Reuse the hourly forecast category so repeated two-minute planning does not average away forecast error.
2. **High — projected VAM and inventory remain uncertain.** The current scheduler assumes each planned capture succeeds when projecting VAM and committed work. Keep that inexpensive all-success projection and label the weather-adjusted score as a heuristic. Do not create success/failure branches or fractional VAM timestamps for this feature. A later repeat after weather failure may be undervalued because failed imagery does not reset VAM; actual execution and later plan refreshes use real outcomes. No plan forecast may read actual future weather. Test that a failed capture leaves VAM unchanged and uploaded/committed work remains intact.
3. **Medium — slew and pointing.** Cloud exposure applies only to the collection interval, as corrected above. A cloud-failed collection still slewed to its target: retain its normal end pointing and original successor times. Power-rejected commands keep the existing distinct behavior. Preserve failure precedence: existing power/geometry/timing/market failures first, cloud quality next, successful image creation last. Record one terminal outcome per command.
4. **Medium — replan timing and retries.** At a forecast issuance, expose the new forecast before a same-time ground replan; coalesce it with the existing two-minute trigger. Freeze one issuance snapshot for the whole plan build, including predictions through upload and locked work; do not advance issuance into the future as the planning cursor advances. Forecast changes cannot edit active/next captures or upload again within an existing contact episode. The initial proposal's same-bucket retry ban is underspecified: completed-capture results may inform a ground revision, but cannot cancel an already-uploaded repeat. Prefer no added retry mechanism in this slice; define any suppression key, interval-overlap rule, and information availability before introducing a cooldown.
5. **Medium — baseline preprocessing.** The public NOAA source is selected and already uses the runtime's 1° resolution. Verify a real source sample, axis order, and direct download before declaring the asset pipeline ready. Missing/corrupt data must produce a visible unavailable state; never silently substitute clear skies. Keep test fixtures explicitly labeled synthetic. The official [NCEI ISCCP-H entry](https://www.ncei.noaa.gov/products/international-satellite-cloud-climatology) documents the HGM product and access options.
6. **Medium — observability.** Show a coarse forecast risk band, its issue/valid time, raw priority, and weather-weighted score in the existing chosen-target detail if that view can expose it cheaply. This is a proposed small UI addition; a map remains optional. Show observed cover only in completed-capture diagnostics, clearly labeled as observed.

### Efficiency and modeling limits

- A Uint8 baseline uses 777,600 bytes (about 0.74 MiB). Load it once as a typed array; a JSON object per cell is unnecessary. Stream historical months during preprocessing rather than loading 30 years globally into browser memory.
- Actual weather costs keyed integer hashes and table lookups only when a capture candidate or outcome requests a cell/hour. Parent values can be reused across child cells. A small bounded cache may help during plan builds, but deterministic results must not depend on cache hits. No hourly global sweep or new simulation loop is needed.
- Forecast scoring is integer lookup and multiplication. Apply it after geometric/power feasibility and deduplicate opportunities by forecast-weighted score. Keep raw priority as a tie-breaker where appropriate. Benchmark only to confirm plan generation stays responsive; avoid a general profiling framework for this feature.
- The shared six-hour component creates a broad persistent pattern; smaller hourly and ¼° draws retain local variation. Coarse region edges and calendar-month changes may still be visible. Accept those simple boundaries in the prototype unless they distort operations; continuous storm motion and detailed spatial smoothing are separate work.
- Using a weather calendar does not make the existing fixed-Sun orbit model seasonal. Keep that limitation explicit; changing solar/orbit behavior is outside CLOUD-01.

### Verification gate for the remaining data work

The gameplay settings and runtime slice are now approved and implemented. Remaining checks are HGM file aggregation, NOAA citation/version metadata, monthly and geographic indexing, and replacing the app fallback. Keep regression verification focused on deterministic replay, boundary outcomes, committed-work preservation, and responsive plan generation; high statistical accuracy and high-precision probability are outside scope.

## Current implementation handoff

The user approved the starter package above. Prototype forecast bands are <=40, 41–60, 61–80, and >80%; forecast error spreads are 12, 20, and 28 percentage points for lead through 6h, through 24h, and beyond. These are low-cost tuning inputs, not calibrated probabilities.

`src/simulation/weather.ts` now provides keyed integer cloud values, time-weighted collection exposure, and a separate deterministic forecast. `OperationalLoop` checks weather at the normal capture-completion boundary, and `cellScheduler` uses forecast-weighted priority. The model does not create an hourly world field.

The remaining prerequisite for full completion is the ISCCP-H HGM-derived climatology asset and its source manifest. The runtime's flat 50% baseline is a temporary playtest stand-in only. Replace it with the verified 12 × 180 × 360 monthly table before marking CLOUD-01 complete. The workspace shell could not reach the public host because its configured network proxy refused the connection; the data itself is public and does not require an API key.
