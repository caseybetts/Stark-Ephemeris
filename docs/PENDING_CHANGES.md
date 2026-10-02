# Pending Changes

This is the project's on-deck menu of implementation work. It turns discussed features into bounded work items an agent can pick up after the user selects them.

## How to use this list

- The user selects work by ID, for example: **Work on UI-01**.
- Agents must not start an item solely because it appears here. Work only on the item the user selects, and check its dependencies and source documents first.
- Keep each change within its listed scope. If implementation requires an open gameplay or technical decision, surface that decision instead of silently turning a proposal into a requirement.
- Update an item's status here when the user selects it or when the work is completed. Mark completed items with a short note and date; keep this menu focused on work that remains.
- Read [`README.md`](README.md), [`GAMEPLAY.md`](GAMEPLAY.md), and [`TECHNICAL_STRATEGY.md`](TECHNICAL_STRATEGY.md) before implementation. Read [`IMPLEMENTATION_OUTLINE.md`](IMPLEMENTATION_OUTLINE.md) for the current world model and code boundaries.

## Status key

- **Ready:** The first implementation slice is sufficiently described.
- **Needs design:** The direction is agreed, but important rules or data sources need user decisions before the full feature can be implemented.

## Already implemented

Do not select these as pending work unless a new defect is reported:

- Browser app scaffold using TypeScript, Vite, and CesiumJS.
- Static Earth globe with Natural Earth II imagery and sample ground locations.
- One circular satellite orbit, moving satellite marker, optional orbit track, pause, and simulation speed controls.
- Prototype sunlight, satellite eclipse, sub-satellite coordinates, and approximate ground-station range calculations with status readouts.
- Orbit-track flicker fix and Earth occlusion for satellite and surface markers.
- UI-01 management tabs and Summary view completed 2026-10-02: the globe sits above Summary, Spacecraft, Orders, Ground Stations, and Finance & Growth; switching tabs leaves the running simulation intact.

## Ready for a bounded first slice

### UI-02 — Build the Ground Stations table

**Status:** Ready  
**Agreed:** Ground Stations is a tab, and tables are preferred for station lists.

**Work:** Show the existing station definitions and live range calculations in a table. Include station name, geographic location, current range/contact state, and distance from the satellite. Keep the table driven by domain state, not hard-coded rendered rows.

**Done when:** The configured stations appear in a readable table and their state updates with simulation time. Selecting a station identifies it on the globe if the shared row-to-globe interaction is available.

**Dependencies/open choices:** Station capacity, antenna/link limits, contact scheduling, and bulk station operations are not defined. Leave those fields out until their rules exist.

## Order and imaging system

### ORD-01 — Define order and acquisition records

**Status:** Needs design  
**Agreed:** Orders are point targets and are separate from images collected. The nominal ground image footprint is 20 km by 20 km. Order attributes include value, cloud-cover tolerance, maximum off-nadir angle, and minimum Sun elevation.

**Work:** Add Cesium-independent domain types for an order, an acquisition record, and their lifecycle. Keep order demand distinct from the image event that may satisfy it. An acquisition should be able to record satellite, simulation time, aimpoint, footprint, and observed conditions.

**Done when:** Domain data can represent orders and captures without importing UI or Cesium types, and an order can be associated with a qualifying acquisition through an isolated rule function.

**Open choices:** Point-in-footprint tolerance, deadlines/expiry, delivery steps and payout timing, cloud model, whether one acquisition can fulfill multiple orders, and how off-nadir changes the ground footprint. Use configurable prototype values only after those choices are recorded.

### ORD-02 — Add a configurable order distribution system

**Status:** Needs design  
**Agreed:** Order generation must be changeable and able to evolve during a scenario. Distribution controls include weights for urban/rural, continent, and coastal/inland locations. A seeded scenario stream and profiles that affect future orders are proposed implementation choices in the technical strategy.

**Work:** Isolate order generation behind a distribution-profile interface. Keep generated orders independent of the renderer and preserve the terms on already-issued orders when future distribution settings change. Add a small prototype deck only after suitable sample classifications or an approved data source are available.

**Done when:** A profile can specify the distribution strategy and weights separately from order creation, and a profile change can affect future order generation without rewriting existing orders.

**Open choices:** Data source and licensing for population, continent, and coastal classifications; how weights combine and normalize; generation rate, active-order cap, profile-transition timing, and whether the player receives notice of shifts.

### ORD-03 — Implement imaging opportunity evaluation and capture feedback

**Status:** Needs design  
**Agreed:** Orders are points; imaging is nominally a 20 km by 20 km ground footprint; orders can specify cloud, Sun-elevation, and off-nadir tolerances. A temporary line from satellite to aimpoint is desired during imaging; a footprint outline is an optional visual cue.

**Work:** Add an imaging-opportunity calculation that evaluates reachable order targets at simulation opportunities, creates an acquisition record when collection succeeds, and gives visible feedback with a satellite-to-target line. Keep the calculation in the simulation layer and the line/footprint in the visualization layer.

**Done when:** A valid opportunity can be evaluated without checking every order on every render frame; successful capture creates a separate acquisition event; the line appears only during the capture event and is occluded by Earth when appropriate.

**Open choices:** Off-nadir access/quality formula, fixed versus distorted footprint, cloud sampling, Sun-angle quality effects, pointing constraints, and order matching. Avoid implementing detailed attitude dynamics unless separately selected.

### ORD-04 — Add the Orders table and detail view

**Status:** Needs design  
**Agreed:** Orders has a tab with a searchable, filterable, sortable list and order details.

**Work:** Present the active order deck in a table with target location, value, status, and agreed collection constraints. Add search, filters, sorting, and a detail view. Selecting an order should identify its point on the globe when feasible.

**Done when:** The list is generated from order domain state; sort/filter behavior is clear; order selection links the row, detail, and map selection without duplicating business rules in the UI.

**Open choices:** Final columns, default sort, statuses, expiry treatment, paging/virtualization threshold, and order capacity.

**Dependency:** ORD-01.

### ORD-05 — Draw the order-density heat map

**Status:** Needs design  
**Agreed:** The globe should have a toggleable cell-based heat map with selectable active-order count or aggregate potential order value. Potential value must be labeled as uncollected demand, not earned revenue.

**Work:** Aggregate orders by geographic cell and render a clear-to-red layer. Keep aggregation independent from Cesium and let the visualization convert cell values to rendered shapes/colors. Do not add one Cesium entity per order.

**Done when:** The layer can be toggled; users can switch between order count and potential value; cells update when the active order deck changes; map rendering remains separate from order generation.

**Open choices:** Cell size, count/value color normalization, selected-cell details, and behavior at different zoom levels.

**Dependencies:** ORD-01 and ORD-02.

## Fleet, operations, and company systems

### FLEET-01 — Build the Spacecraft table and selection view

**Status:** Needs design  
**Agreed:** Spacecraft is a tab intended to support a large fleet, with tables used wherever practical. Satellite state should include explicit operating attributes rather than values embedded in UI components.

**Work:** Add a fleet collection to simulation state and show one row per satellite. Provide a detail view for the selected spacecraft and connect selection to its globe marker/orbit. Start with attributes that have actual simulation rules; do not create decorative values for unimplemented systems.

**Done when:** Multiple satellite definitions can be represented and selected independently; table and detail views derive from the same domain state; adding spacecraft does not require new UI markup per satellite.

**Open choices:** Initial table columns, satellite classes, fleet policies, and which attributes are implemented in each subsequent feature.

### FLEET-02 — Add slew speed and future-launch upgrades

**Status:** Needs design  
**Agreed:** Slew speed is a satellite capability. A paid upgrade affects satellites launched afterward.

**Work:** Add slew speed to satellite capability data and make imaging scheduling account for the time needed to retarget between targets. Model upgrade purchases as company configuration applied to future launches, not retroactive changes to existing spacecraft.

**Done when:** Different slew capabilities can change retarget time and opportunity throughput; newly launched satellites receive the selected upgrade level; existing satellite specifications remain stable.

**Open choices:** Units, starting values, upgrade cost and progression, whether slew speed is distinct from pointing-angle limits, and how satellite design/launch purchasing is represented.

### OPS-01 — Model onboard storage, power, and downlink operations

**Status:** Needs design  
**Agreed:** Operations should connect image capture, onboard data retention, energy, eclipse, downlink opportunities, and station service. Routine operation should eventually be manageable through standing priorities.

**Work:** Design and then implement explicit simulation state for generated image data, storage capacity, power generation/storage/use, and downlink. Keep time-step processing independent from the interface. The existing sunlight/eclipse and station-range calculations can provide inputs but do not yet change battery or data state.

**Done when:** A capture consumes defined resources and occupies storage; downlink transfers data under explicit availability/capacity rules; sunlight/eclipse affects energy according to documented rules; state is visible in the Spacecraft and Ground Stations views.

**Open choices:** Storage units and data sizes, battery/solar behavior, power consumption, data retention/deletion, station bandwidth/scheduling, and tick size.

### OPS-02 — Add health, degradation, and anomaly response

**Status:** Needs design  
**Agreed:** Satellites can degrade or encounter anomalies; players should see understandable symptoms and make consequential intervention choices.

**Work:** Define health state, degradation causes, anomaly events, and the information exposed before/after diagnosis. Add an exception queue to Summary and relevant spacecraft details once the rules are settled.

**Done when:** At least one anomaly has a legible cause/effect and player response path; the event changes simulation capability or risk and is reflected in fleet status.

**Open choices:** Failure rates, hidden versus visible information, diagnosis process, repair costs, intervention choices, and whether anomalies can permanently disable a satellite.

### BIZ-01 — Add order revenue and customer satisfaction

**Status:** Needs design  
**Agreed:** Customer work has monetary value, service expectations, revenue outcomes, and satisfaction consequences. Potential order value remains separate from earned revenue.

**Work:** Track order acceptance, capture, delivery, payment, and service outcome as distinct states. Show potential value separately from revenue recognized by the company. Add satisfaction changes only after service rules are documented.

**Done when:** A delivered order produces a traceable revenue event; missed or failed commitments have explicit outcomes; company totals can be reconciled from order events.

**Open choices:** Contracts versus open orders, deadlines, partial payment, penalties, customer retention, satisfaction formula, and service-level rules.

### BIZ-02 — Add Finance & Growth view and satellite procurement

**Status:** Needs design  
**Agreed:** Money constrains hardware, launches, operations, and business growth. Finance & Growth is a management tab.

**Work:** Show company cash, income, costs, and available growth decisions from explicit company state. Later connect spending to satellite design, slew upgrades for future launches, launch cadence, and ground capacity.

**Done when:** Every displayed financial figure is derived from recorded company/order events; purchases validate affordability and change the intended future capability or capacity.

**Open choices:** Starting funds, prices, recurring costs, launch cadence, financing, satellite design options, and whether growth unlocks are time- or milestone-based.

## Persistence and deployment

### PLATFORM-01 — Add local save and load

**Status:** Needs design  
**Agreed:** The prototype is a static single-player browser app; local browser persistence is the provisional direction if saves are added.

**Work:** Save and restore the versioned simulation state locally, including game time and company/fleet/order state as those systems are implemented. Add migration handling before changing a released save schema.

**Done when:** A player can reload without losing a saved run; invalid or older data is handled without silently corrupting a save.

**Open choices:** When saving enters the first playable build, autosave/manual-save behavior, save slots, and the initial schema version.

### PLATFORM-02 — Configure GitHub Pages publishing

**Status:** Ready  
**Agreed:** GitHub Pages is the target static host; no game server is required for the initial build.

**Work:** Add a GitHub Actions workflow that installs dependencies, builds the Vite app with the repository base path, and prepares the static output for Pages. Document any repository Pages setting that must be enabled.

**Done when:** A clean checkout builds in CI and the workflow prepares the Pages artifact with Cesium assets resolving at the configured project path. A live public deployment is a separate step.

**Open choices:** Public publication timing and required asset/data attributions. Preparing the workflow does not authorize an agent to push changes or enable public publishing; handle those as separate user-approved actions.

## Suggested starting order

This is a dependency guide, not a commitment to start work automatically:

1. **UI-02** and **FLEET-01** fill out the management tables, with fleet modeling needed for multiple spacecraft.
2. **ORD-01** defines the order/acquisition boundary; **ORD-02** can then produce a configurable deck.
3. **ORD-03**, **ORD-04**, and **ORD-05** add collection behavior, list management, and map aggregation.
4. **OPS-01**, **FLEET-02**, **BIZ-01**, and **BIZ-02** make operations and growth consequential as their rules are decided.
5. **OPS-02**, **PLATFORM-01**, and **PLATFORM-02** can be selected when their dependencies and release timing are clear.
