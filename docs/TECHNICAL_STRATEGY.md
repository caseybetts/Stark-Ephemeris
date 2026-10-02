# Technical strategy

This document records implementation constraints and architecture direction. The first world-model prototype now provisionally uses TypeScript, Vite, and CesiumJS; these are prototype choices, not final product commitments.

## Current constraints

- **Target:** A browser-based, single-player game.
- **Hosting target:** GitHub Pages, which serves static site output and does not run the game’s server-side application logic.
- **Initial emphasis:** Simulation mechanics and status views. The orbital display can be a simple visual layer.
- **Initial persistence assumption:** Local browser save data is sufficient for a prototype; no account or shared cloud save is currently required.
- **Provisional prototype stack:** TypeScript for application code, Vite for the static client build, and CesiumJS for the 3D globe.
- **Provisional Earth display:** Cesium's bundled Natural Earth II imagery is used without a Cesium ion token; the renderer falls back to a plain globe color if the texture fails to load.

## Architecture direction

- Keep simulation state and rules separate from UI rendering. The simulation should be advanceable and inspectable without depending on a screen component.
- Advance the simulation in explicit time steps. Make pause and speed controls a presentation of those steps, not separate simulation rules.
- Represent satellites, data, customer work, finances, and anomalies as explicit domain state rather than values embedded in UI components.
- Keep the first orbital display a view of simulation state. It may use simplified orbit positions; it does not need to implement high-precision astrodynamics.
- Build the app as a static client-side bundle suitable for GitHub Pages. Avoid adding a backend unless a future requirement needs hosted persistence, user accounts, or shared state.
- If local saves are added, version the save format so later builds can detect or migrate older data.

## Earth coordinates and orbit display

### Agreed direction

- Designers and game content should describe surface locations in familiar latitude/longitude terms, with altitude/height where needed. Coordinate conversion should be an implementation detail.
- The displayed globe stays fixed while satellite markers and their paths move relative to the surface as game time advances.
- Keep satellite altitude to scale in the visualization. Make the satellite marker visible with a glowing dot; an orbit path can be shown optionally. Marker size is a visual choice and does not change simulated position or altitude.
- Assume one common altitude for the initial satellites, while keeping the model open to different altitudes later.
- Approximate ground-station contact with a constant distance threshold for the initial common-altitude fleet. Treat this as a gameplay approximation of visibility; it can later become altitude-dependent or use a more exact line-of-sight/elevation rule.

### Proposed implementation shape

- Keep geography in named latitude, longitude, and height fields at authoring boundaries. Use geographic points for locations such as cities and ground stations; use geographic boundaries/polygons for areas such as countries when area targets are needed.
- Keep the simulation independent of the renderer's coordinate conventions. A small geography/visualization adapter converts named geographic inputs and satellite positions to the renderer's Earth-centered coordinates.
- Model satellite motion from a simple orbit description and game time in an Earth-centered inertial-like frame, then transform the current position into the Earth-fixed frame used to draw it on a stationary globe. A simplified Earth-rotation angle is sufficient initially; high-precision astrodynamics is not a goal for the first build.
- Keep the concepts of a 3D orbital path and a surface ground track distinct. The initial optional line is the 3D orbit path; a projected ground track can be added separately if it helps explain coverage.
- Use the same game-time/world model as the basis for later sunlight and eclipse calculations.
- If using CesiumJS, wrap its coordinate helpers so game code uses named fields and explicit units rather than positional arguments or library-specific types.

### Provisional prototype conventions

- Authoring data uses named decimal-degree fields `latitudeDeg` and `longitudeDeg`. Domain altitudes and Cartesian positions use kilometers; the Cesium adapter converts kilometers to meters and passes longitude before latitude to Cesium.
- Cesium uses the WGS84 ellipsoid for display conversion. The initial orbital/contact model uses a spherical Earth with a mean radius of 6,371 km; this mismatch is a deliberate simplification to revisit if it affects gameplay.
- The globe remains fixed. Satellite orbit coordinates are calculated in a simple Earth-centered inertial-like frame, then rotated into an Earth-fixed frame using a 24-hour prototype day.
- The first satellite uses a circular 550 km orbit at 53° inclination, with configurable starting node and phase. Orbital period is calculated from the selected altitude and Earth's gravitational parameter.
- The prototype Sun is fixed along the inertial +X direction. Surface illumination uses the dot product of the surface normal and the Earth-fixed Sun direction. Satellite eclipse uses a cylindrical Earth-shadow approximation.
- Initial station contact uses a fixed 1,800 km great-circle surface-distance threshold from the sub-satellite point. It does not model antenna angles, link budget, bandwidth, or true line of sight.
- The prototype simulation offers 1×, 60×, and 300× time speed, with 60× as the starting value. These speeds and all geometry constants are configurable scenario defaults, not balance decisions.

Keep the simulation/domain model independent of Cesium so another renderer can replace it if needed.

## Suggested code boundaries

Names and folder layout are proposals until the project scaffold is chosen.

- **Simulation/domain:** State types, time-step processing, operating policies, and business rules.
- **Presentation:** Dashboard panels, satellite details, charts, event/alert feed, and time controls.
- **Visualization:** Planet, orbit paths, and satellite markers, driven by domain state.
- **Persistence:** Browser save/load and save-format versioning.

UI components should request domain actions and render resulting state; they should not independently implement business or satellite simulation rules.

## Deployment direction

Use Vite's static output and publish the generated site with GitHub Pages through GitHub Actions. The Vite base path is configured for the `Stark-Ephemeris` project page when `GITHUB_ACTIONS` is enabled. The workflow and repository Pages settings remain to be set up.

## Open technical decisions

- Whether to retain TypeScript, Vite, and CesiumJS beyond the prototype.
- Whether to replace the spherical gameplay Earth with WGS84 ellipsoid calculations.
- Whether to add axial tilt, date/season effects, twilight, and a more precise Sun ephemeris.
- Whether to replace the cylindrical eclipse rule and fixed station radius with exact geometry and link constraints.
- How simulation time should map to calendar time and how time state should be saved.
- The first save schema and when save/load enters the prototype.
- What browser sizes and accessibility requirements are in the first release target.
- The GitHub Pages workflow, repository settings, and public asset/data licensing requirements.
