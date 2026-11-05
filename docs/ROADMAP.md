# Development roadmap

This roadmap captures the current high-level planning sequence for project development. It is design context, not a detailed task list or a commitment that every item is fully specified. [Your work list](PENDING_CHANGES.md) holds selectable experiences and decisions; the [AI implementation plan](AI_IMPLEMENTATION_PLAN.md) holds technical work.

**Direction update (2026-11-03):** The next playable target is one complete replayable challenge. RUN-01 is complete, RUN-02's core rules are agreed, and RUN-03 technical acceptance is complete. The technical mobile pass is complete; player-experience judgment and balance feedback belong to the human. The feature layers below remain an inventory of the simulation foundation, not a requirement to finish every subsystem before playable levels. The [challenge development plan](CHALLENGE_RUNS.md) records evidence, dependencies, and open decisions; the [technical sequence](AI_IMPLEMENTATION_PLAN.md#suggested-starting-order) guides agents within a selected outcome.

## Next playable milestones

1. **RUN-01: Baseline review and measurement — complete.** Use its recorded revenue, cost, and yield samples as provisional context, not balance targets.
2. **RUN-02: First mission design — core rules agreed.** M01's scoring meaning, setup/control boundary, and retry seed are decided; numeric values remain provisional.
3. **RUN-03: Complete one challenge — technical acceptance complete.** Controller boundaries and exact-cutoff settlement pass; browser review confirmed the debrief and complete retry reset.
4. **UX-05 with UI-04: Make the core flow mobile-friendly — technical pass complete.** Setup, operations, debrief, and retry were checked at phone and tablet widths. The human reviews comfort and real-device usability during RUN-04.
5. **RUN-04: Human playtest M01.** You lead player-experience testing. Agents focus on technical behavior, hidden state transitions, boundary cases, and clear defects. Record pacing, clarity, and strategy feedback without broad parameter changes.
6. **TUNE-01: Tune only from evidence, then vary.** Address specific issues from implementation evidence or human feedback, then add one contrasting mission. Introduce outages or market events only when a mission needs them.

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
