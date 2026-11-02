# Big Idea

## The game

Build and operate earth-imagery satellite fleets through replayable, time-limited challenges. The player chooses spacecraft and orbits within a mission budget, runs the operation, and adjusts ground-side priorities to meet a financial target by a deadline. Failed attempts provide information for a better setup and another try.

**Agreed direction (2026-11-02):** Begin with standalone mission briefs and develop a sequence of levels with increasingly demanding operational constraints. The existing continuous startup simulation is the implementation foundation; level setup, objectives, debriefs, and progression are not implemented yet. A continuing company story and cross-level asset/cash carryover remain open, rather than prerequisites for the first challenge.

The central appeal is watching a carefully configured operation produce useful imagery and income, then stepping in when capacity, equipment, or business priorities come into conflict.

## Intended experience

- **Operations first:** The player understands what each satellite can do and why it is succeeding or struggling.
- **Set up, observe, intervene:** Routine activity can run with standing priorities. The player’s attention goes to exceptions and consequential choices.
- **Learn through retries:** A clear brief, understandable outcome, and quick return to setup make experimentation rewarding.
- **Challenges change the job:** Early levels focus on one spacecraft; later levels can introduce larger fleets, constrained ground capacity, and changing markets.
- **Tradeoffs are visible:** Storage, energy, downlink capacity, reliability, money, and customer commitments constrain one another.
- **A readable living system:** The interface makes fleet state, operations, and business health easy to scan. A visual orbital view gives context without needing to be a high-fidelity aerospace visualization.

## Product priorities

1. Make the operations and business simulation coherent and interesting.
2. Make the state of the fleet and the causes of problems understandable.
3. Add enough visual context to make satellites and their work feel tangible.
4. Expand into deeper graphics or realism only when it improves the decisions the player makes.

## Scope boundaries for the initial build

- Target a single-player browser experience.
- Focus the first playable build on a small number of satellites and a readable set of status panels.
- Use simplified orbital and environmental behavior where it supports gameplay.
- Treat online accounts, multiplayer, persistent hosted worlds, and scientifically exact orbital mechanics as out of scope unless later adopted as explicit goals.

## North-star question

Can the player look at the operation, understand what is earning money or causing risk, and make a satisfying decision about what to do next?
