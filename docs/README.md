# Project documentation

This folder contains the shared brief for product, gameplay, and implementation work. Read this index and [`../AGENTS.md`](../AGENTS.md) before starting an agent task.

## Documents

| Document | Use it for |
| --- | --- |
| [Vision](VISION.md) | The game’s premise, intended experience, priorities, and scope boundaries |
| [Gameplay](GAMEPLAY.md) | Player loop, simulation systems, interface needs, and unresolved design questions |
| [Replayable challenge development](CHALLENGE_RUNS.md) | Current implementation foundation, recommended next steps, first-mission decisions, and acceptance handoff |
| [Satellite yield design](SATELLITE_YIELD_DESIGN.md) | Implemented per-satellite Summary metrics, collection outcomes, operational-time charts, and remaining follow-up |
| [Technical strategy](TECHNICAL_STRATEGY.md) | Browser/deployment constraints, architecture direction, data and persistence approach |
| [Cell grid data](CELL_DATA.md) | Implemented geographic layers, provenance, limitations, data format, and rebuilding the cell grid |
| [Cell visualization design](CELL_VISUALIZATION_DESIGN.md) | Orders-map color scales, schedule overlays, active imaging visualization, and interpretation limits |
| [Implementation outline](IMPLEMENTATION_OUTLINE.md) | Code boundaries, coordinate and orbit calculations, candidate first slice, and gaps an implementation agent must resolve |
| [OPS-04 verification guide](OPS_04_VERIFICATION.md) | Starting baseline, shared operational orchestration, deterministic fixtures, acceptance scenarios, and implementation checks |
| [OPS-01B power design and verification](OPS_01B_POWER_DESIGN.md) | Agreed prototype rules, implementation boundaries, starter fixtures, and completed acceptance results |
| [OPS-01C thermal and link design](OPS_01C_THERMAL_LINK_DESIGN.md) | Proposed thermal pacing and variable downlink behavior, existing-rule compatibility, open player choices, and acceptance scenarios |
| [OPS-02 station outage design](OPS_02_STATION_OUTAGE_DESIGN.md) | Proposed outage/repair journey, recovery and TEL rules, implementation boundaries, and acceptance handoff |
| [CLOUD-01 design framework](CLOUD_01_DESIGN.md) | Approved cloud behavior, deterministic model, and reproducible 2004–2013 NOAA climatology asset |
| [CELL-04C bounded scheduler design](CELL_04C_DESIGN.md) | Implemented bounded search, fallback behavior, and verification slice |
| [FLEET-03 orbit maneuver design](FLEET_03_ORBIT_MANEUVER_DESIGN.md) | Player orbit changes, automated safety/maintenance burns, fuel, timing, and implementation slices |
| [BIZ-01 finance design](BIZ_01_FINANCE_DESIGN.md) | Implemented company ledger, approved opening funds, settlement revenue, operating costs, and Finance & Growth reporting |
| [BIZ-02 growth design](BIZ_02_GROWTH_DESIGN.md) | Agreed package/economy, pre-launch orbit choice, and implemented fleet purchase/antenna behavior |
| [Layer 3 implementation plan](LAYER_3_PLAN.md) | Reviewed work sequence and bounded upgrade/outage design briefs |
| [Your work list](PENDING_CHANGES.md) | Player experiences to try, prioritize, change, or remove; feedback and choices for the human |
| [Playtest notes](PLAYTEST_NOTES.md) | Running log of playtest observations and requests; agents use new notes to propose actionable work |
| [AI implementation plan](AI_IMPLEMENTATION_PLAN.md) | Technical task IDs, dependencies, statuses, and verification handoffs for agents |
| [Development roadmap](ROADMAP.md) | High-level planning sequence for building out the project |

## Keeping the brief useful

- Put a decision in the document that owns that topic; avoid duplicating detailed rules across documents.
- Use **Agreed**, **Proposed**, and **Open** labels when status is not obvious.
- When a decision changes, update its source document and any short cross-reference affected by it in the same change.
- Keep task-specific implementation notes in code or focused design documents, not in the vision statement.
