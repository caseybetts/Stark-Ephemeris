# Stark Ephemeris

Browser-based earth-imagery satellite operations simulator prototype.

## Run locally

Requirements: Node.js and npm. Dependencies are installed into this project; no global package installation is required.

```powershell
npm ci
npm run dev
```

Vite prints a local URL to open in a browser. The first load uses the bundled CesiumJS Natural Earth II globe texture and does not require a Cesium ion token.

## Current prototype

- Stationary Earth globe with geographic surface objects.
- One circular-orbit satellite moving relative to the Earth as simulation time advances.
- Configurable time speed, pause/resume, and optional 3D orbit path.
- Simple solar illumination, cylindrical eclipse, and fixed-radius ground-station contact readouts.
- Satellite and world state calculations live separately from Cesium rendering.
- A land-intersecting ¼° grid with 363,779 cells, a toggleable globe overlay, and a searchable Orders view for sourced city, port, per-cell urban footprint area, border, coast, agriculture, power plant, and mapped oil pipeline attributes.

Orbit, solar, and contact constants are provisional scenario values in `src/simulation/constants.ts`. Cell dollar values remain unset. Collection, value recovery, storage, power budgets, revenue, customer satisfaction, degradation, and anomaly handling are not implemented. See [cell data and visualization](docs/CELL_DATA.md) for sources, limitations, and regeneration instructions.

## Build for static hosting

```powershell
npm run build
```

The static site output is written to `dist/`. The Vite base path is configured for the `Stark-Ephemeris` GitHub Pages project URL in GitHub Actions. A Pages workflow and repository Pages settings still need to be added/configured before publishing.

## Project brief

See [docs/README.md](docs/README.md) for the vision, gameplay, technical strategy, and implementation outline.
