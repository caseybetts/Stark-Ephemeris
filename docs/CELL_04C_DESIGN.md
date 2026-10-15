# CELL-04C bounded scheduler design

**Status: Implemented prototype (2026-10-15).** This is a lightweight improvement to the greedy scheduler. It does not change capture, market, power, weather, or contact rules.

## Goal and boundary

Find better short sequences of feasible captures than choosing the best next cell greedily, while keeping planning deterministic and cheap. Search runs in the simulation layer and reuses the current opportunity, slew, priority, power, and forecast calculations. It does not coordinate spacecraft or claim a globally optimal schedule.

The existing greedy schedule remains the immediate feasible baseline and fallback. Search considers only tentative work after the locked current and next captures. A search result reaches the spacecraft only through the existing contact upload flow.

## Implemented search

1. Build the greedy continuation using the same simulation inputs and retain it as the fallback.
2. Search forward one existing two-minute optimization segment at a time. A partial path records its next time, pointing, projected energy, projected cell freshness, and selected commands. Each extension uses the existing feasibility checks and advances that projected state.
3. Rank the segment's initially feasible opportunities, retain a pool of at most 16 distinct cells, and reconsider at most eight feasible next-cell candidates per partial path. Keep candidates in a stable order: higher projected available priority first, then earlier feasible start, then cell ID. Deduplicate a cell within a segment.
4. Keep at most six partial paths at each depth and expand no more than 48 shortlisted candidates per segment. The shared opportunity sampler screens geometry and resources before an extension counts against this beam budget. If a limit is reached, use the best complete segment path found so far.
5. Rank paths by total projected available priority in the segment, including the existing coarse cloud weight when a forecast is configured. Use less idle/slew time, then stable cell-ID order, as deterministic tie-breakers. Compare the resulting whole continuation to the greedy whole continuation under the same snapshot; adopt it only when its score is strictly higher. Do not use payout as a separate objective.

These small limits are prototype defaults, not player-facing rules. Named constants allow later tuning. The 48-extension cap bounds beam expansion per segment. The initial candidate scan uses the existing local cell lookup; later branches revisit only the 16-cell pool, so representative long horizons should be profiled before increasing the limits.

## Replacing tentative work safely

Treat the committed current and next captures as fixed inputs. The automatic planner rebuilds the entire tentative suffix after that prefix, rather than splicing a new segment into retained following commands. Each new segment starts from the previous segment's projected completion state, so its entry and following transition use the same feasibility checks. The complete searched suffix replaces its fresh greedy fallback only when strictly higher-scoring; ties retain greedy. When the contact forecast has no next contact pair, the existing ground plan remains intact.

The candidate search and greedy fallback share geometry, slew, power, market, and forecast checks. Every chosen command is built forward from its preceding projected state; partial paths never become an uploaded TEL. Locked work is never silently rewritten; if execution reports it infeasible, the existing replan flow responds.

## Determinism and explanation

The same simulation timestamp, market snapshot, spacecraft state, forecast, and configuration must produce the same commands and tie-breaks. Search must not use renderer frames, wall-clock time, random draws, or mutable shared search state. Keep the current selected-target explanation and expose the reason an alternative won (for example, higher total priority over the segment sequence) plus a few notable skipped alternatives where the existing UI supports them.

## Verification slice

- A small fixture proves search finds a higher-scoring two-or-more-capture sequence than greedy.
- Repeated runs and equivalent large/partitioned simulation advances produce identical plans.
- Every returned command passes the same geometry, slew, power, and segment-transition feasibility checks as greedy.
- A forced budget cutoff returns a complete feasible search result or the greedy fallback, never a partial command list.
- Lower-scoring searched plans and exact-score ties retain the greedy continuation.
- Locked current/next work stays unchanged; the tentative suffix is rebuilt forward from it.
- Candidate and extension counters prove the documented limits are honored.

## Exclusions and remaining questions

Fleet coordination, global optimality, new UI, revised market scoring, and changes to contact or capture behavior are out of scope. The limits can be tuned after profiling representative scenarios.
