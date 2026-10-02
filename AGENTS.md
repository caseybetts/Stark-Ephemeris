# Agent guide

## Start here

Before making a change, read [`docs/README.md`](docs/README.md) and the document(s) relevant to the task. Treat those documents as the current project brief.

## Source of truth

- [`docs/VISION.md`](docs/VISION.md) defines the product intent and scope boundaries.
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) defines the player experience, simulation concepts, and agreed gameplay behavior.
- [`docs/TECHNICAL_STRATEGY.md`](docs/TECHNICAL_STRATEGY.md) defines implementation constraints and architecture decisions.
- If documents disagree, follow the more specific gameplay or technical document for its subject, then update the conflicting docs in the same change. Do not silently resolve a product decision by inventing a requirement.

## Working rules

- Preserve the operations-management focus. Graphics support the simulation; they are not the primary deliverable.
- Distinguish agreed decisions from proposals and open questions. Mark undecided details as open rather than presenting assumptions as requirements.
- Keep the simulation rules in a form that can be reasoned about independently of the interface.
- Update the relevant documentation when implementation changes an agreed behavior, architecture boundary, or product scope.
- Prefer small, reviewable changes. Do not add services, accounts, or other infrastructure without a product need documented first.
