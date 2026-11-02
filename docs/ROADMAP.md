# Development roadmap

This roadmap captures the current high-level planning sequence for project development. It is design context, not a detailed task list or a commitment that every item is fully specified. The [Pending Changes](PENDING_CHANGES.md) document remains the on-deck menu for selectable implementation work.

**Direction update (2026-11-02):** The next playable target is one complete replayable challenge. The feature layers below remain an inventory of the simulation foundation, not a requirement to finish every subsystem before playable levels. The [challenge development plan](CHALLENGE_RUNS.md) records evidence, dependencies, and open decisions; [Suggested starting order](PENDING_CHANGES.md#suggested-starting-order) is the current selectable queue.

## Next playable milestones

1. **RUN-01: Baseline review and measurement.** Close the pending purchase/capability/reset checks, exercise shared antennas, and measure revenue, costs, bottlenecks, and real session duration. Fix observed blockers.
2. **RUN-02: First mission design.** Set a budget, allowed setup, deadline, scoring rule, controls, and retry conditions using those measurements.
3. **RUN-03: Complete one challenge.** Deliver setup, bounded simulation, result/debrief, and retry using the existing domain systems.
4. **RUN-04 with TUNE-01/UI-04: Playtest and vary.** Improve pacing and explanations, then add a contrasting mission. Introduce dynamic outages or market events when a mission needs them.

This sequence is a development recommendation. Product direction is agreed; unselected scoring rules, numeric values, and event mechanics remain open.

## Layer 1 — Core experience (mostly finished)

- GUI and visualizations
- Global Order Deck
- Scheduling behavior

## Layer 2 — Operational simulation depth

- Ground contact dynamics
- Basic Revenue Generation
- Spacecraft subsystems

## Layer 3 — Company growth and feature expansion

- Company finances
- Spacecraft building and launching
- Outages, Errors and Anamolies

The [reviewed Layer 3 plan](LAYER_3_PLAN.md) records implemented purchase, antenna, and slew-option mechanics plus the proposed outage scenario. Its historical feature order is superseded by the playable milestones above; its unresolved mechanics remain open.

## Layer 4 — Tuning and refinement

- Fine-tuning playable attributes and revenue generation
- GUI refinement
