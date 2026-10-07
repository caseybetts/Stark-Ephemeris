# Implementation outline

## Purpose and status

This document translates the current product and technical discussions into a code-oriented outline. It is intended to help an implementation agent start a small browser prototype without turning unresolved design ideas into hidden requirements.

**This is not a final architecture specification.** A first world-model prototype is now present. Its implementation choices and scenario constants are provisional; full orbital realism, geospatial data, and gameplay rules remain open. Concrete choices below are labeled **Agreed**, **Provisional**, **Candidate**, or **Open**.

Read [`README.md`](README.md), [`VISION.md`](VISION.md), [`GAMEPLAY.md`](GAMEPLAY.md), and [`TECHNICAL_STRATEGY.md`](TECHNICAL_STRATEGY.md) with this outline. If they conflict, those source documents take precedence; update this outline when an underlying decision changes.

## 1. Product slice this outline supports

### Agreed product direction

- The game is a single-player browser experience intended for static hosting on GitHub Pages.
- The player operates an earth-imagery satellite startup. Operations, business state, and status panels are more important than high-end graphics.
- The world view should show a realistic-scale Earth and satellites. The globe remains stationary while satellites move relative to its surface.
- Satellite altitude should not be exaggerated in the visualization. A glowing point can make a satellite visible; a 3D orbital path is optional.
- Designers and content authors should specify locations with named latitude/longitude values. Conversion to renderer coordinates is an implementation detail.
- Initial satellites may share one nominal altitude. The data model should leave room for different altitudes later.
- Ground-station contact may initially use a constant distance threshold as a gameplay approximation. Exact line-of-sight or elevation-angle modeling can come later.
- Later fleet, operations, and revenue panels are part of the intended game, but their detailed design is not yet specified.

### Candidate first technical slice

The smallest useful world-model prototype would display one Earth, one moving satellite, and several surface objects such as ground stations or city targets. It would expose the satellite's computed location and show simple states for surface sunlight, satellite eclipse, and station contact. A small status panel can make those calculations inspectable.

This is a recommended first increment, not a locked milestone or complete game scope.

## 2. Platform, language, and libraries

| Area | Current status | Implementation note |
| --- | --- | --- |
| Runtime | **Agreed:** Browser, single player | Initial game logic can run client-side. |
| Hosting | **Agreed:** GitHub Pages is the target | The deployed artifact must be static; no server-side game service is assumed. |
| Globe library | **Provisional:** CesiumJS | Used for the globe, surface entities, and geographic conversions; simulation code does not depend on it. |
| Language | **Provisional:** TypeScript | Used for app and simulation source. |
| UI framework | **Provisional:** Plain DOM + CSS | No component framework is used in the first slice. |
| Build tool/package manager | **Provisional:** Vite + npm | Vite creates static output for local development and GitHub Pages. Dependencies are local to the project; no global install is needed. |
| Cesium static files | **Provisional:** copied by a Node script | Workers, ThirdParty, Assets, and Widgets are copied from the local Cesium package to `public/cesium/` before dev/build. |
| Earth imagery/terrain | **Provisional:** bundled Natural Earth II | The first globe uses Cesium's bundled low-resolution Natural Earth II texture and ellipsoid terrain, with no ion token. Detailed/satellite imagery and data licensing remain open. |
| Persistence | **Open for first slice** | Local browser saves are a later option; save format and timing are not defined. |

These choices are active for the prototype, but should not be reported as final product decisions.

## 3. Proposed code boundaries

These are logical responsibilities, not required directory names.

### Simulation/domain

Own simulation time, satellite orbit parameters, surface-object definitions, calculated positions, contact results, daylight/eclipsed states, and future operations/business rules. This layer should not import Cesium or depend on DOM components.

### Geography and frame conversion

Own named geographic input types and conversions among designer-facing coordinates, simulation coordinates, and renderer coordinates. Keep unit conversion and axis conventions at this boundary.

### Visualization

Create the globe, surface markers, satellite markers, and optional orbital paths from simulation output. It may use Cesium-specific objects internally, but those types should not become the game state format.

### Interface

Show time controls and status panels. Later panels may cover satellite state, operations, revenue, and company growth. The interface requests simulation actions and displays results; it does not independently calculate orbital or business rules.

### Persistence

Not required by the first world-model slice. If added later, own browser save/load and a versioned save schema.

## 4. Data concepts and coordinate conventions

### Designer-facing geography

Use named fields, not positional number arrays, at authoring boundaries. A conceptual location record is:

```text
GeographicLocation
  latitude: number
  longitude: number
  altitude/height: number (optional for surface objects)
```

**Provisional conventions:** latitude/longitude are named decimal-degree fields (`latitudeDeg`, `longitudeDeg`); domain altitude and Cartesian vectors use kilometers. Cesium receives longitude first and values in meters. WGS84 is used for Cesium display conversion; simulation geometry uses a 6,371 km sphere. Do not silently pass unnamed `[x, y, z]` values into UI or authored content.

Cities and ground stations can be represented as points. Country or other area targets eventually need boundaries/polygons; their source data, file format, and target-coverage behavior are not decided.

### Satellite data

The first model needs an identity and enough orbit information to calculate a position at a requested game time. A common initial altitude is agreed as a prototype default, but orbit parameters belong to each spacecraft. Keep orbit configuration/state independent per satellite and call a propagation boundary with `(orbitDefinition, simulationTime)` to get its propagated state. The starter implementation can use a circular-orbit propagator; later propagators may support different altitudes, inclinations, eccentricities, or other orbit classes without changing fleet tables, cell-market logic, or renderer-facing satellite identity. Do not assume one shared altitude or phase in fleet-level APIs. Exact orbit types and fidelity remain open. Additional attributes such as storage, power, camera, health, or customer value should be added as explicit fields/components when their gameplay rules are designed; no final extensible attribute schema has been chosen.

### Coordinate spaces

The following separation is implemented as the current prototype model:

1. **Geographic authoring space:** latitude, longitude, and optional height for stationary Earth locations.
2. **Earth-centered orbital space:** a time-based satellite orbit in an inertial-like frame, so the orbit is not tied to the rotating surface.
3. **Earth-fixed display space:** coordinates fixed to the globe's surface, suitable for placing positions on a stationary globe.
4. **Renderer space:** Cesium-specific Cartesian positions, if CesiumJS is selected.

The renderer adapter converts between these spaces. The simulation remains the authority for position and elapsed time. The implementation uses an Earth-centered inertial-like axis aligned with the Earth-fixed axes at elapsed time zero; exact astronomical epoch and high-precision frame conventions are not modeled.

## 5. Calculations and algorithms

The geometry requirements below are known at a conceptual level. The specific formulas are implementation proposals until explicitly adopted.

### 5.1 Geographic location to rendered surface position

Given latitude, longitude, and optional height, convert the point to Earth-centered Cartesian coordinates on the selected ellipsoid. If CesiumJS is used, its geographic conversion helper is a candidate for the renderer boundary. Wrap it in a game-owned function that accepts named values and explicit units; do not make Cesium's longitude-first argument order the game-wide API.

Open choices: WGS84 versus a spherical gameplay Earth, height reference, and meters-versus-kilometers at the adapter.

### 5.2 Satellite orbit and position

The satellite position must be a deterministic function of simulation time and its orbit data. A stationary globe with a moving satellite requires transforming the orbit position into the Earth-fixed display frame as time advances.

**Provisional starter orbit:** a circular orbit at 550 km altitude and 53° inclination, with 12° ascending-node orientation and 8° initial phase. Calculate period from altitude and Earth's gravitational parameter, propagate phase from elapsed simulation seconds, calculate the inertial Cartesian position, then rotate about Earth's polar axis by the 24-hour prototype Earth-rotation angle to obtain an Earth-fixed position. Transform that position to Cesium coordinates only when drawing.

**Extensibility requirement:** store these values in the selected spacecraft's orbit definition rather than global constants. Keep the current circular propagator behind an orbit propagation module/interface. Position snapshots, orbit drawing, station access, and future imaging calculations consume per-spacecraft propagated state or orbit definition; none encode the assumption that every spacecraft follows Asteria-1's path. Adding another propagator is future work, not a requirement for high-fidelity orbital mechanics now.

This is a low-complexity prototype model, not a final orbit-system decision. Time speed options are 1×, 60×, and 300×, initially 60×. The project does not model perturbations, precession, high-precision ephemerides, or a real-world epoch.

### 5.3 Orbit path versus ground track

- A **3D orbit path** is a loop in orbital space. It can be shown as a line around Earth and should move relative to the fixed globe as Earth rotation advances.
- A **ground track** is the projection of a satellite's path onto Earth's surface. Earth rotation makes it drift over the surface; it is not the same curve as the 3D orbit.

The 3D orbit path is the current candidate for the optional line. A ground-track display is not required yet.

### 5.4 Surface sunlight

Longitude alone is not enough to classify an object as sunlit. The calculation also depends on latitude and the Sun's direction at the current simulation time.

**Candidate simple rule:** calculate the outward normal of a surface point and compare it with the Sun direction in the same coordinate frame. A positive dot product means the point faces the Sun; a non-positive value means night. The Sun direction should be generated from the simulation clock and transformed consistently with Earth rotation.

Prototype choices: a spherical Earth normal, Sun direction fixed along inertial +X, one 24-hour cycle, and no twilight, axial tilt, or seasons. These are scenario defaults, not long-term design decisions.

### 5.5 Satellite eclipse

Satellite eclipse is a 3D shadow/occlusion condition, not a test of the satellite's longitude. It depends on the satellite's position and the Sun direction and whether Earth lies between them.

**Candidate simple rule:** use a cylindrical Earth shadow. A satellite is eclipsed when it is on the anti-solar side of Earth and its perpendicular distance from the Earth-to-Sun axis is less than Earth's radius. A ray/ellipsoid intersection could replace this if more accurate shadow geometry becomes useful.

Prototype choices: cylindrical shadow and a spherical 6,371 km Earth; atmosphere and penumbra are ignored. Eclipse is displayed as state only and does not yet change a battery or other gameplay attribute.

### 5.6 Ground-station contact

The agreed first approximation is a fixed distance threshold for the initial common-altitude fleet.

**Provisional definition:** calculate the sub-satellite point, measure spherical great-circle surface distance from it to each station, and mark the station in range within 1,800 km. This avoids a full radio/antenna model. It is an effective contact rule, not exact line of sight.

Later choices: whether the threshold should vary by altitude/class and whether contact should also require a minimum elevation, station capacity, antenna geometry, or radio budget.

### 5.7 Relationships between satellites and surface objects

The coordinate model should make it possible to calculate distance and visibility between a satellite and any surface object. The meaning of a relationship must be chosen per mechanic:

- Station downlink contact uses the effective contact rule above.
- Imaging access applies to whole cells. Pointing limits, illumination requirements, and the rule for a cell to be reachable remain open; swath width is abstracted away.
- Generic proximity, line of sight, communications link quality, and customer-value association are distinct rules and should not be conflated into one universal `isNear` test.

### 5.8 Cell market and collection

**Agreed gameplay rule:** Use a regular ¼° latitude/longitude grid as the market and collection unit. Every grid cell intersecting land is eligible, including mixed land-and-sea coastal cells; cells with no land are excluded. Do not require a land-fraction calculation. The complete global grid has 1,036,800 cells before masking. The simulation treats each collection as a complete cell image, with swath width abstracted away.

Each eligible cell has category-specific geographic exposures in units matching the market price and player priority rate. Convert area to km² as needed; count discrete sites/routes as counts unless sourced measures support another unit. Per cell-category, maximum payout is applicable market unit price × eligible exposure; maximum priority is player-set category priority rate × eligible exposure. Apply the same Value Availability Multiplier (VAM) to both. A never-collected cell starts at VAM 1. After collection, VAM is `clamp((elapsed - 0.1 × cadence) / (0.9 × cadence), 0, 1)`, where elapsed is since the cell's single last-collection timestamp. This keeps VAM at 0 for the first 10% of cadence, ramps linearly to 1 by the end of cadence, and stays capped at 1 thereafter. Cadence, market price, and player priority rate changes immediately affect calculated values. Sum available category payouts and credit company money once when capture completes; sum available category priority points separately for scheduling. Market rates and geographic exposures are in-game assumptions, not claims of real-world prices.

**Candidate implementation shape:** Keep static cell attributes and derived category exposures separate from dynamic market rates, player-set category priority rates, and one last-collection timestamp per cell. Store the regular grid in compact arrays and index each cell by row/column or stable ID. Calculate payout and priority from the current inputs when needed rather than updating every cell on render frames. An optional cached `atMaximum` flag means all contributing categories in the cell have VAM 1 and must be invalidated when cadence changes. Whole-cell completion resets the timestamp for every category in the cell, including slower-refresh categories. The globe renderer should draw tiled or aggregated cell layers rather than one Cesium entity per cell. A capture event may include a temporary satellite-to-cell line or a compact footprint cue.

Whole-cell collection is the gameplay abstraction. Collection duration, resource use, and access rules remain open. Swath width, scan-strip scheduling, and partial-cell coverage are outside the current model; geographic indexing and access calculations must still handle polar and dateline cells consistently.

**Visible value and recovery milestones completed:** CELL-03A/B in [Pending Changes](PENDING_CHANGES.md) supply explicitly labeled sample category rates, app-owned market state and shared simulation time, and Orders readouts for maximum/available payout and selected-cell category values. Manual preview controls record successful or failed attempts, advance time, show cash credit and per-category recovery, and reset the in-memory scenario. Focused state checks cover transaction behavior. These controls do not implement automatic capture or determine access/scheduling rules; final gameplay rules and value map layers remain later work.

**Planned table and map inspection:** Extend Cell table sorting/filtering to calculated dollar value, maximum priority (all categories at VAM 1), and current/available priority (category scores with current VAM). Add selectable cell-color modes for dollar value, maximum priority, and current/available priority. Use the existing shared cell calculations and tiled/aggregated rendering approach. Palette, normalization, legend, and filter-range behavior remain open.

## 6. Rendering and interface outline

### Agreed visual direction

- Stationary 3D Earth, with realistic satellite altitude and a small glowing satellite marker.
- Optional orbital-path display.
- Surface objects use their geographic coordinates, with type/attributes held as data rather than embedded in the 3D mesh.
- Graphics support inspection of operations; they are not the primary game system.

### Agreed management layout

- Keep the globe/visualization at the top and the active data view below it.
- Provide **Summary**, **Spacecraft**, **Orders**, **Ground Stations**, and **Finance & Growth** tabs, with Summary selected by default.
- Summary includes fleet-wide and company information plus operational exceptions and key indicators that need attention.
- Use tables wherever they work well, particularly for spacecraft, the cell market, and ground stations. A selected record should be identifiable on the globe.
- The Orders tab provides a searchable, filterable, sortable cell-market list and cell details, with controls for category exposure, calculated value, or repeat-purchase state layers.

### Current prototype slice

- Globe area: Earth globe, visible surface objects, satellite marker, optional orbit path.
- Compact controls: pause/resume, orbit-track toggle, and 1×/60×/300× speed selector, starting at 60×.
- The vertical management interface has five tabs: Summary (default), Spacecraft, Orders, Ground Stations, and Finance & Growth.
- Summary presents the current prototype satellite status, world-state status, approximate station range, and daylight state of sample points/markets. It explicitly notes that company and fleet-wide metrics are not yet modeled.
- Spacecraft presents a data-driven table and detail view backed by a fleet collection. The initial fleet still contains only Asteria-1; each configured spacecraft receives its own world snapshot, marker, and orbit, and table selection highlights the chosen marker/orbit.
- Ground Stations presents configured station names, cities/coordinates, facility availability, and uplink/downlink rates in a wide table. The current availability and rates are configurable prototype data; rates do not yet constrain data transfer. Satellite-specific access remains in Summary until a fleet-wide contact model is designed.
- Orders presents the land-intersecting ¼° grid with sourced attributes, search/filter/sort controls, paginated cell rows, cell details, a toggleable globe overlay, and mapped oil route geometry. Selection can outline and focus a cell or identify a pipeline route. Proposed normalized category exposure quantities are shown in cell details; category approval, dollar rates, revenue, and repeat-purchase views await the economy rules. Data provenance and code boundaries are documented in [Cell grid data](CELL_DATA.md).
- Finance & Growth remains a labeled placeholder until its gameplay systems are implemented.
- Changing tabs only changes visible interface content; it does not restart or pause the simulation.

The prototype has a fixed initial camera, labeled sample markers, responsive CSS, and a simple map layer. Advanced camera interactions, selecting multiple satellites, image footprints, true day/night shading, and accessibility polish remain to be designed.

## 7. Suggested implementation sequence

This sequence is a proposal for an agent asked to begin coding; it is not a user-approved feature commitment.

1. **Scaffold is in place.** TypeScript, Vite, CesiumJS, npm scripts, and local run instructions are present.
2. **Define geography and simulation types.** Use named coordinates and explicit units. Keep the types independent of Cesium.
3. **Implement pure world calculations.** Add simple time advancement, one circular orbit, Earth rotation, sunlight/eclipse state, and the approximate contact rule. Keep defaults in the simulation constants module.
4. **Render the Earth and objects.** Use the ellipsoid/globe, Natural Earth II texture, known surface points, satellite marker, and optional 3D orbit path. Convert coordinates at a single renderer boundary.
5. **Expose state in a small panel.** Show calculated values so frame or sunlight mistakes are visible to the user.
6. **Settle automatic collection and scheduling.** CELL-03A/B make cell payout, priority, and VAM recovery visible for inspection. Define capture access, duration, failure, resources, and how total priority interacts with access before connecting automatic collection and scheduling. Storage, power budgets, customer satisfaction, degradation, anomaly response, satellite design, and fleet growth still need their own explicit rules.

Do not treat the suggested order as permission to invent missing orbital constants or game-economy formulas. For a prototype, document reversible defaults in code/config and keep them easy to tune.

## 8. Gaps to resolve

### Blocking before a code-writing agent can produce a reproducible app

1. **Refine coordinate accuracy:** decide when/if the simulation sphere should become WGS84 ellipsoid geometry, and define height datum for terrain and altitude.
2. **Refine geospatial assets:** decide on higher-resolution/satellite imagery, country/city boundary data, license/attribution, and whether offline operation matters.
3. **Refine orbit/time:** decide calendar time, seasons, Earth spin/solar angle, other orbit classes, and whether orbital perturbations matter.
4. **Refine contact:** tune the 1,800 km prototype radius and decide if it varies with altitude or station/radio characteristics.
5. **Expand visual behavior:** decide whether to draw a day/night terminator, camera selection, target footprints, or historical/future ground tracks.

The current prototype constants are implemented and visible in `src/simulation/constants.ts`; they remain easy to tune.

### Blocking before the world model can drive the full game

- Source, licensing, coverage, and preprocessing of the land mask and cell attribute datasets.
- The ¼° cell market is the current collection abstraction. Proposed category mapping/exposure normalization and a pure market/recovery state engine are implemented for review; category approval and overlap treatment, scenario market prices/cadences, player priority rates, starting cash, UI/clock/capture integration, and scheduler ranking remain open. Initial cells start at VAM 1; collection recovery timing and shared per-cell timestamp are agreed.
- What qualifies as successful imagery collection and how satellite pointing is represented.
- Downlink bandwidth, station scheduling/capacity, and relationship to onboard data retention.
- Energy generation/storage/use and how sunlight/eclipses change it.
- Which satellite attributes are part of the first satellite design and how they affect behavior.
- How to record immediate whole-cell capture revenue and which post-sale storage, downlink, processing, or delivery costs/constraints to model; whether customer contracts, deadlines, satisfaction, and retention are later needed.
- Degradation, anomalies, diagnostic certainty, and repair/intervention choices.
- Time units, pausing/acceleration semantics, save/load, and first-playable milestone.

### Quality and deployment gaps

- Supported desktop/mobile browsers, minimum rendering performance, accessibility requirements, and responsive layout.
- Whether a local save is required for the first playable version.
- GitHub Pages publishing workflow and repository settings.
- Automated verification expectations and where domain-level calculations should be exercised.
