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

The prototype also implements automatic collection planning, contact-based plan uploads, cell value/recovery, onboard imagery storage, power, cloud-dependent capture outcomes, downlink revenue, company operating costs, and standard-spacecraft purchases. Economy and subsystem values remain provisional; growth pacing is unbalanced. Customer satisfaction, degradation/anomaly response, and save/load remain future work. See [cell data and visualization](docs/CELL_DATA.md) for sources, limitations, and regeneration instructions, and [Pending Changes](docs/PENDING_CHANGES.md) for feature status.

## Try the single-spacecraft revenue loop

1. Start the app with `npm run dev` and open the local URL printed by Vite. Allow the cell market to finish loading.
2. Open **Spacecraft**, select **Asteria-1**, and click **GENERATE GREEDY TEL THROUGH NEXT CONTACT**. Despite its current label, this uses the bounded scheduler and enables automatic continuation. Check the plan-status message for confirmation.
3. Let the simulation run at **60×** or **300×**; click **RESUME** if paused. The plan uploads at an available ground contact, captures store imagery onboard, and later eligible contacts transfer that imagery. Automatic planning continues after the initial Generate action.
4. Watch **Finance & Growth → Realized Revenue**, with cash and operating costs beside it. Captures alone do not credit cash; each image must finish downlinking. Spacecraft plan/contact/power status helps explain waits. Orders exposes market values and editable category priorities.

Opening cash is **−$50,000**, and negative cash does not stop collection or revenue. Revenue can rise while company cash is still negative. The initial **$50M** spacecraft price is not tuned for an enjoyable growth interval yet, so earning delivery revenue is the first playtest milestone. When testing fleet purchases, Finance & Growth offers Standard ($50M) and Enhanced slew ($55M, 2°/second with the same 2 second settling time); each launched spacecraft keeps its selected capability. Weather and resource constraints can prevent individual captures or delay transfers. Save/load is not implemented: reloading or resetting loses the current run. Orders also contains manual preview controls; use the normal simulation flow above when observing automatic revenue.

## Build for static hosting

```powershell
npm run build
```

The static site output is written to `dist/`. The Vite base path is configured for the `Stark-Ephemeris` GitHub Pages project URL in GitHub Actions. A Pages workflow and repository Pages settings still need to be added/configured before publishing.

## Project brief

See [docs/README.md](docs/README.md) for the vision, gameplay, technical strategy, and implementation outline.
