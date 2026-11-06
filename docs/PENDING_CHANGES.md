# Your work list

This is the place to steer the game by what you want to experience. Reorder, change, or remove these ideas as you learn from playing. Add session observations and requests to the [playtest notes](PLAYTEST_NOTES.md); agents use them to propose and maintain action items here, so you do not need to turn every note into a prompt. Select an outcome here when you want an agent to carry its supporting implementation and technical checks through to something you can try. The [AI implementation plan](AI_IMPLEMENTATION_PLAN.md) holds task IDs and dependencies; you do not need to choose those steps.

## Ready for you

AI maintains this list when new feedback arrives or relevant work starts or finishes. You own its priorities and choices. Completed and superseded items leave the active list; their evidence stays in the playtest notes and AI plan. Reviews remain here only when there is a specific unresolved question for you.

The [first M01 playthrough](PLAYTEST_NOTES.md#2026-11-04--first-m01-playthrough) was successful; its map defaults, station rings, and collection metrics requests are implemented. The [second playthrough](PLAYTEST_NOTES.md#2026-11-05--second-playthrough) also succeeded; its onboard-image/TEL readout and downlink-count explanation are addressed, and the default orbit was confirmed to include eclipses. The [third playthrough](PLAYTEST_NOTES.md#2026-11-06--third-playthrough) succeeded. Its flashing moving orbit line has been replaced, at your direction, with a toggleable 24-hour projected ground track that updates at simulation UTC 00:00 and 12:00. Scheduled-cell visibility was traced to the Planning layer selection, and the scheduler now samples collection opportunities twice as often. Scheduled-cell outlines remain a selectable Planning mode; Current priority remains the Orders default requested earlier.

| Experience | What to try or decide | State |
| --- | --- | --- |
| **Review what the app explains** | While playing, note any point where you cannot tell why a satellite stopped, missed income, lost imagery, or chose a target. Describe the question you had at that moment. | Open for feedback. Agents can trace causes and fix reproducible defects; broader presentation changes follow observed issues. [UI-04](AI_IMPLEMENTATION_PLAN.md#ui-04--refine-operational-management-views). |

## Later choices

| Experience | Choice for you | State |
| --- | --- | --- |
| **Adjust the first mission** | Decide which observed pacing, difficulty, or explanation issue matters most. Prototype numbers remain provisional. | The third playthrough asked for more collections; candidate timing opportunities now use a 30-second sample instead of 60 seconds. This is a provisional pacing adjustment, not broad balance approval. [TUNE-01](AI_IMPLEMENTATION_PLAN.md#tune-01--tune-playable-attributes-and-revenue). |
| **Review the mission menu constraints** | After trying the new menu, decide whether reduced downlink and strict cloud tolerance make useful challenges, and whether a later fleet mission should use multiple spacecraft. The displayed values are provisional examples. | Open for later review; detailed mission briefs and values were intentionally deferred. Multi-spacecraft challenge setup is tracked as [FLEET-04](AI_IMPLEMENTATION_PLAN.md#fleet-04--add-multi-spacecraft-challenge-setup-and-fleet-evaluation). [Challenge plan](CHALLENGE_RUNS.md#run-04--human-playtest-tune-only-from-evidence-then-add-a-contrasting-mission). |
| **Explore a station outage** | Decide whether advance warning, response choices, and recovery would make a good challenge. | Later proposal; timing, repair terms, and recovery rules need review. [OPS-02](OPS_02_STATION_OUTAGE_DESIGN.md). |
| **Explore thermal limits and variable link speed** | Review whether satellites should save thermal capacity for later work and whether stronger station passes should deliver more imagery. | A combined proposal is ready in [OPS-01C/D/E](AI_IMPLEMENTATION_PLAN.md#ops-01c--design-satellite-thermal-pacing-and-variable-downlink). Thermal interruption behavior, link forecasts, and any delivery-preparation control remain open for review. |
| **Consider attitude momentum** | Revisit whether repeated satellite retargeting should build reaction-wheel momentum and occasionally require a propellant-using desaturation maneuver. | Later satellite-systems idea; possible effects on planning, fuel, and interrupted work need consideration before design. |
| **Consider onboard processing** | Revisit whether satellites should compress or process imagery before downlink, trading energy and processing time against onboard storage and transfer time. | Later satellite-systems idea; processing options and any effect on delivered imagery need consideration before design. |
| **Consider radiation and recovery** | Revisit whether orbital radiation exposure should cause occasional spacecraft faults, and what recovery should look like. | Later satellite-systems idea; event frequency, severity, and player response need consideration before design. |
| **Review growth and map behavior** | If you use purchases or Orders during a play session, note anything surprising about fleet changes, antenna sharing, or map updates. | Optional feedback. Scheduled-cell outlines are shown by selecting Scheduled cells in the Planning control; the Orders default remains Current priority. Further map feedback can guide focused fixes. |
| **Choose when saving or publishing matters** | Tell us when you want a run to survive a reload or want a public build to share. | Later choice; save behavior and publication timing are open. [PLATFORM-01/02](AI_IMPLEMENTATION_PLAN.md#persistence-and-deployment). |

## Feedback notes

Add observations in [Playtest notes](PLAYTEST_NOTES.md) in your own words. Agents should check new notes when starting project work and connect actionable feedback to a human-readable outcome here, then track technical steps in the AI plan.
