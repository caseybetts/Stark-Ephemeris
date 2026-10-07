# Project documentation

This folder contains the shared brief for product, gameplay, and implementation work. Read this index and [`../AGENTS.md`](../AGENTS.md) before starting an agent task.

## Documents

| Document | Use it for |
| --- | --- |
| [Vision](VISION.md) | The game’s premise, intended experience, priorities, and scope boundaries |
| [Gameplay](GAMEPLAY.md) | Player loop, simulation systems, interface needs, and unresolved design questions |
| [Technical strategy](TECHNICAL_STRATEGY.md) | Browser/deployment constraints, architecture direction, data and persistence approach |
| [Cell grid data](CELL_DATA.md) | Implemented geographic layers, provenance, limitations, data format, and rebuilding the cell grid |
| [Implementation outline](IMPLEMENTATION_OUTLINE.md) | Code boundaries, coordinate and orbit calculations, candidate first slice, and gaps an implementation agent must resolve |
| [Pending Changes](PENDING_CHANGES.md) | User-selectable implementation work items, dependencies, and open design decisions |

## Keeping the brief useful

- Put a decision in the document that owns that topic; avoid duplicating detailed rules across documents.
- Use **Agreed**, **Proposed**, and **Open** labels when status is not obvious.
- When a decision changes, update its source document and any short cross-reference affected by it in the same change.
- Keep task-specific implementation notes in code or focused design documents, not in the vision statement.
