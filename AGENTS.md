# Agent guide

## Start here

Before making a change, read [`docs/README.md`](docs/README.md) and the document(s) relevant to the task. Treat those documents as the current project brief.

## Source of truth

- [`docs/VISION.md`](docs/VISION.md) defines the product intent and scope boundaries.
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) defines the player experience, simulation concepts, and agreed gameplay behavior.
- [`docs/TECHNICAL_STRATEGY.md`](docs/TECHNICAL_STRATEGY.md) defines implementation constraints and architecture decisions.
- If documents disagree, follow the more specific gameplay or technical document for its subject, then update the conflicting docs in the same change. Do not silently resolve a product decision by inventing a requirement.

## Human and AI work

- [`docs/PENDING_CHANGES.md`](docs/PENDING_CHANGES.md) is human-focused and AI-maintained. The human owns priorities and decisions; agents own keeping the list current. The human judges pacing, clarity, comfort, fun, and gameplay tradeoffs. Record that feedback in plain language without turning it into an implementation prescription.
- Reconcile the human list when starting relevant work, receiving new playtest notes or completion reports, and finishing implementation. Use the conversation, playtest notes, and implementation plan as evidence. Remove completed or superseded tasks from the active list, merge duplicates, and update stale dependencies without asking for routine maintenance approval. Keep completion evidence in the AI plan or source notes. Implementation alone does not establish human acceptance: retain a specific review item only when an unresolved experience question needs it. Preserve human priorities and open choices; do not create a fresh playtest obligation for every completed feature.
- [`docs/PLAYTEST_NOTES.md`](docs/PLAYTEST_NOTES.md) is the running source for human playtest observations and requests. Check it when beginning project work; translate actionable new notes into outcomes in `PENDING_CHANGES.md` and supporting tasks in `AI_IMPLEMENTATION_PLAN.md`, preserving the human's wording and leaving unresolved gameplay choices open.
- [`docs/AI_IMPLEMENTATION_PLAN.md`](docs/AI_IMPLEMENTATION_PLAN.md) is the AI implementation plan. It owns task IDs, technical dependencies, status, and verification handoffs. Keep it synchronized with the human list without making the human manage technical steps.
- A user-selected outcome authorizes the necessary design preparation, implementation, documentation, and technical verification within that outcome. Work through its supporting tasks as a coherent chunk. A backlog entry alone does not authorize unrelated feature work, new product rules, publishing, or external infrastructure.
- When choosing the next work, keep advancing through the AI implementation plan even when a human task is next on the agenda. Look ahead through at least the next four or five relevant tasks and select the earliest AI task that can be completed independently with current approvals and inputs. Defer a human task only when it is necessary to the AI work, or when skipping it would compromise the effectiveness or quality of that work. Do not stop while an independently completable AI task is available in that lookahead; stop only when none of the next four or five relevant steps can be completed independently. Respect explicit human priorities and open gameplay decisions while applying this rule.
- Ask the human when a choice changes the intended player experience, scope, or an open gameplay rule. Use provisional, configurable values where the brief already permits them. Agents own technical behavior, hidden state, boundary cases, and reproducible defects; the human owns experience playtesting and final tuning choices.
- In every response, state whether any human task was skipped and whether any AI implementation-plan step was skipped. Briefly identify skipped steps and why; say explicitly when neither was skipped. Keep detailed technical evidence in the AI plan or focused design document so the human need not read a task-by-task work summary.

## Working rules

- This is a fun side project. Keep responses light, encouraging, and brief; summarize work conceptually instead of listing every step or detail.
- Explain design details when they help with a decision, but favor practical prototype solutions over commercial-grade process or unnecessary precision.
- Preserve the operations-management focus. Graphics support the simulation; they are not the primary deliverable.
- Distinguish agreed decisions from proposals and open questions. Mark undecided details as open rather than presenting assumptions as requirements.
- Keep the simulation rules in a form that can be reasoned about independently of the interface.
- Update the relevant documentation when implementation changes an agreed behavior, architecture boundary, or product scope.
- Prefer small, reviewable changes. Do not add services, accounts, or other infrastructure without a product need documented first.
- **Playtesting and tuning:** Leave most player-experience playtesting to the human. Agents should verify technical behavior, hidden state transitions, boundary cases, and clear, reproducible defects. Do not spend time tuning gameplay parameters or balance while the framework and core loop are still being built; keep prototype values configurable and label them provisional. Recommend tuning only when a concrete issue is supported by implementation evidence or the human's playtest feedback.
