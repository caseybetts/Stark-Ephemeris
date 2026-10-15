# FLEET-03 orbit maneuvers

**Status: Design proposal.** The user has agreed that orbit burns should be an active gameplay system, with automatic safety/maintenance maneuvers and player-directed altitude/inclination changes. Physics may be approximate, but fuel use, visibility, and elapsed transfer time should be clear. Propellant mass is the preferred fuel representation; starter values and formulas can stay simple.

## Goal and current boundary

Give the player control over the long-term orbit tradeoff while making spacecraft safety and upkeep visible. Keep the implementation renderer-independent and reuse one orbit-state query for the globe, contacts, sunlight, capture opportunities, power, and planning.

Today, `OrbitDefinition` describes one circular path from altitude, inclination, ascending node, and initial phase. `satellitePositionInertial` propagates that fixed circle from elapsed time. This is a helpful boundary: downstream systems already ask for spacecraft position through the shared world model. Dynamic burns require that model to represent a maneuver timeline instead of one immutable orbit.

## Agreed gameplay direction

- Players may request a new target altitude and inclination.
- Before submission, show the estimated fuel cost and how long until the new orbit is reached.
- Burn fuel is a limited spacecraft resource.
- Collision avoidance and orbital maintenance can run automatically. The player can see what happened, why, when, and how much fuel it used.
- Maneuvers are allowed to use a simplified transfer model; a high-fidelity, continuously integrated trajectory is not a goal.

## Proposed prototype model

### Player-directed change

Use a maneuver preview in the selected spacecraft's Orbit detail. The player chooses target altitude and inclination; the preview shows current and target values, fuel remaining after the change, burn/transfer phases, and the expected completion time. Reject targets outside the spacecraft's configured envelope or above its available fuel.

For altitude changes, use a two-burn Hohmann transfer between circular orbits. The transfer coast takes half the period of the transfer ellipse; a NASA/JPL reference gives this as `π × sqrt(a_transfer³ / μ)`. For inclination changes, wait for the next suitable orbital node and use a plane-change burn. Where practical, combine the plane change with the transfer's second burn to save fuel. This gives a believable wait without simulating thrust continuously. [NASA/JPL orbital mechanics reference](https://spsweb.fltops.jpl.nasa.gov/portaldataops/mpg/MPG%20Book/Release/Chapter7-OrbitalMechanics.pdf)

Represent the sequence as simulation events: command accepted, first burn, transfer coast, insertion/plane-change burn, and orbit change complete. Give burns a short configured duration; the transfer coast supplies most of the elapsed time. The propagator can switch between the current orbit, a simple transfer arc, and the target orbit at those event boundaries. Preserve position at each transition; exact finite-thrust motion is out of scope.

Estimate delta-v from the ideal circular-orbit transfer and plane-change formulas, then convert it to propellant using configurable spacecraft mass and engine specific impulse. Keep the equations and units in one pure simulation module so the UI preview and execution charge the same amount. Starter engine and mass values are prototype settings, not real spacecraft specifications.

### Automatic maintenance

For the first prototype, maintenance may be represented as a small, configurable propellant deduction at a regular interval in simulation time. Record each upkeep event with its time and fuel cost so the player sees where the fuel went. A later tuning pass can replace the interval rule with altitude decay, a restoration threshold, and explicit correction burns if that adds useful gameplay.

### Automatic collision avoidance

Collision avoidance needs predicted nearby-object trajectories and close-approach timing. No such object catalogue currently exists in the project. For a first playable slice, evaluate a small configurable chance once per game day that a spacecraft needs a COLA maneuver. Use the seeded simulation RNG so runs remain reproducible, and label generated conjunctions as scenario events rather than real surveillance data. When one occurs, schedule a simple avoidance maneuver, spend fuel, and record the event, time, and outcome. A future public catalogue can replace the scenario generator without changing the maneuver interface. NASA's operational conjunction process screens predicted trajectories and then evaluates mitigation, so even this simplified event/response split is useful. [NASA conjunction event prediction](https://www.nasa.gov/cara/step-1-conjunction-event-prediction/) · [NASA collision-avoidance mitigation](https://www.nasa.gov/cara/step-3-close-approach-risk-mitigation/)

## Effects on existing gameplay

After a maneuver changes the orbit, the existing contact predictor, capture scheduler, eclipse/power logic, and displayed track all receive the new propagated state. Refresh the tentative ground plan from its locked prefix. If an automatic safety burn conflicts with a locked command, log the cause and outcome and make the resulting command failure/replan visible; never quietly rewrite a locked target.

Keep maneuver history in simulation events so the Spacecraft view can show upcoming burns, recent maintenance/avoidance actions, fuel, and the reason for each action. A compact list is enough; this does not need a new management tab.

## Suggested implementation slices

1. Add maneuver-aware orbit state and deterministic position/velocity queries at simulation time; preserve the current circular orbit as the default.
2. Add player-planned altitude/inclination transfer previews, fuel validation, execution phases, and an orbit detail interface.
3. Add regular-interval maintenance fuel deductions using the same maneuver/fuel event history.
4. Add seeded once-per-game-day COLA checks and visible scenario events, with automatic avoidance and planner refresh.

## Open choices

- The target altitude/inclination limits, initial fuel reserve, engine burn duration, and whether combined plane-change transfers are supported in the first player-facing slice.
- Whether a player maneuver waits for the next contact for upload, and the policy when an automatic safety burn conflicts with active or locked work.
- The regular maintenance interval and fuel deduction, and the once-per-day COLA chance and maneuver cost. Keep these prototype balance values configurable.
- Whether later versions should use a public conjunction-data source. Do not add an API, account, or external service for the prototype.

This design does not require high-precision orbit perturbations, a live debris catalogue, or a continuously integrated finite-thrust model. The transfer-time estimate is approximate and should be presented as a game estimate.
