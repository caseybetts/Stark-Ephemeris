# OPS-01C thermal pacing and variable downlink design

**Status: Proposed design for review; no new gameplay rule is approved by this document.** The user selected thermal limits and variable link speed as promising satellite systems on 2026-11-05. OPS-01C prepares a coherent, bounded prototype direction before OPS-01D or OPS-01E implementation begins.

## Player-facing goal

Make satellite readiness and contact quality affect whether collected imagery becomes delivered revenue. Players should be able to understand why a spacecraft is resting, why one contact delivers more data than another, and what collection or delivery opportunity was traded away. Routine thermal and radio behavior should remain automatic; the player should continue to focus on setup and consequential exceptions.

## Existing rules this design preserves

- A satellite has one authoritative simulation timeline. Runtime execution and scheduler projections share resource rules; neither depends on renderer frames.
- Ground plans reach the satellite only at contact upload. Active and locked next captures remain protected through replanning.
- Power reserve protection has priority over downlink. Downlink may pause and resume while retaining partial bytes.
- Imagery transfers FIFO, settles only once on full delivery, and earns no revenue if deleted before delivery.
- Ground stations retain their current antenna ownership and one-link transfer rules. Overlapping contacts do not combine their rates.
- RUN-02 currently selects category priorities as the only live player policy control. A new mid-run delivery-preparation setting would need an explicit gameplay decision before implementation.

## Proposed thermal behavior

**Proposed model:** Track one thermal load per spacecraft. Imaging and active transmission add heat; passive cooling reduces it over simulation time. A small number of thresholds distinguish normal operation, an approaching limit, and cooldown. A cool spacecraft can sustain longer work before reaching a limit.

The scheduler should avoid knowingly starting work that would cross the safe operating limit. At a thermal limit, discretionary imaging and radio activity pause while housekeeping continues and the spacecraft cools. Work resumes after a lower recovery threshold, preventing rapid pause/resume flicker. Existing command timing and power rules remain authoritative. The implementation design must decide how to handle a thermal threshold reached inside an already-started capture, since the current capture is one non-interruptible command.

Heat generation should initially reflect payload and radio activity, with a coarse environmental term only if needed to make orbit/eclipse conditions understandable. Full component temperatures, radiator geometry, panel orientation, permanent thermal damage, and random faults are outside this prototype direction.

## Proposed variable downlink behavior

**Proposed model:** A station's configured downlink rate remains its best-case rate. As a satellite crosses a pass, the achieved rate moves through a few stable quality levels based on the strength of the geometric link. Favorable portions of a pass deliver more bytes; weak portions deliver fewer. This is an adaptive radio abstraction, not a new source of random packet loss.

Initially, derive quality within the existing predicted contact interval rather than changing the contact footprint, antenna ownership, or station availability rules. The preferred physical cue is spacecraft elevation as seen from the station, since the existing effective-distance contact rule is only an approximation. Rate changes should be coarse and bounded, with the same projected profile used by the scheduler and the executed transfer. Partial bytes carry across quality changes and contact episodes as they do now.

Keep transmitter power fixed in the first slice. Rate-dependent power demand, retransmissions, atmospheric weather, antenna pointing, and new physical horizon/contact rules can be reviewed later if a concrete gameplay need appears.

## Player choices and information

The first implementation should keep thermal response and link adaptation automatic. The player-facing choice comes from existing decisions: satellite package and orbit at setup, category priorities during operation, and whether to accept the risk of collecting more imagery than later passes can deliver. The UI should explain current thermal state, expected cooling/readiness, current link quality, and delivered data during a pass. A simple forecast may compare expected delivered data across the next contact opportunities.

An explicit "prepare for delivery" policy could create a clear capture-versus-delivery choice, but it conflicts with RUN-02's current live-control boundary. Keep that policy as an open product decision. If approved later, it should alter only tentative planning and must respect uploaded TELs and locked work.

## Compute and simulation limits

- Use a single thermal state per spacecraft and a small fixed set of link-quality bands.
- Advance both states only at known simulation boundaries, not on render frames.
- Share thermal feasibility and the projected link-rate profile between scheduler forecasts and runtime execution.
- Keep scheduler search bounded and evaluate resource feasibility as part of the existing candidate path.
- Reuse existing contact windows and event chronology; do not create a separate thermal or radio simulation loop.
- Keep initial values configurable and provisional. Make an acceptance scenario with enough onboard imagery and a constrained pass so that a weak versus strong link produces a visible delivery difference.

## Open decisions before implementation

1. Should sunlight/eclipses affect thermal load, or should the first model represent only activity heat and passive cooling?
2. Should the thermal threshold prevent starting a capture, pause downlink, or both? How should the non-interruptible capture behave if a limit is reached during execution?
3. Which pass geometry should define link quality, and how many quality levels are enough to be legible?
4. Should the player receive a forecast of link quality, and if so, how far ahead and with what uncertainty?
5. Is there a player-selectable delivery-preparation policy, or should preparation remain automatic until a later mission explicitly introduces it?
6. Which mission configuration creates a real delivery bottleneck without relying on unreviewed changes to the existing image-size and station-rate assumptions?

## Acceptance scenarios for the implementation briefs

- Sustained capture/transmit activity approaches the thermal limit; the satellite pauses discretionary work, cools, and resumes predictably.
- A scheduler forecast avoids a thermally infeasible capture while execution reaches the same result from the same state.
- A single contact changes through weak and strong link quality; transferred bytes follow the profile, partial transfer persists, and settlement still occurs exactly once.
- Power reserve pauses downlink even when thermal capacity and link quality would permit it; thermal recovery does not bypass power protection.
- Same scenario and simulation time yield the same thermal and transfer state across different time-advance sizes and accelerated playback.
- The bounded delivery scenario makes pass quality visible in delivered imagery without adding unbounded planning work.

Implementation slices and dependencies are tracked as OPS-01D and OPS-01E in the [AI implementation plan](AI_IMPLEMENTATION_PLAN.md#ops-01c--design-satellite-thermal-pacing-and-variable-downlink).
