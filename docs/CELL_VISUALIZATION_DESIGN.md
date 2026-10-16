# Orders cell visualization design

**Status: Prototype implemented; color tuning and additional fleet comparisons remain open.**

## Goal

Give the player a fast geographic read of where value and work are, while keeping the detailed selected-cell values available in the Orders panel. These views are read-only projections of the simulation and do not change scheduling or revenue rules.

## Map modes and encoding

The globe overlay has two mutually exclusive selectors. **Land use categories** contains urban footprint, cropland, and pasture. **Everything else** contains the base coverage and mapped feature layers, plus priority, value, scheduled-cell, and active-imaging views. Both selectors sit in the map overlay so the planning modes are immediately available while looking at the globe.

| Mode | What it shows | Encoding |
| --- | --- | --- |
| Maximum priority | Fresh-cell scheduling score before value-availability recovery | Indigo to amber sequential ramp; logarithmic scale |
| Current priority | Priority available at the current simulation time | Yellow to teal sequential ramp; same global reference ceiling as maximum priority |
| Current dollar value | Available payout potential at the current simulation time | Forest green to yellow sequential ramp; logarithmic scale |
| Scheduled cells | Capture cells on the selected spacecraft’s active onboard plan, or its pending ground plan before upload | Coral outlined cell; active capture uses the imaging highlight |
| Satellite imaging a cell | The currently executing capture target and a line from the spacecraft’s current Earth-fixed position to that cell | Yellow cell outline and line of sight; no active capture is stated by the legend |

Economic map values use a stable, scenario-wide display ceiling derived from the maximum exposure of each configured category and its current price or player priority rate. The ceiling is an upper-bound reference, so map colors remain comparable while panning and zooming. Log scaling keeps smaller values visible alongside high-exposure cells. Selecting a cell still shows its exact calculated value and priority.

`Current dollar value` means value available to earn from an image at capture time. It is not cash, realized revenue, or a guarantee that the satellite can collect and downlink the image. Revenue is credited only after a complete downlink under the existing gameplay rules.

Scheduled-cell state follows the currently selected spacecraft. A pending ground plan is visibly labeled as scheduled, though it is not yet aboard the spacecraft; an uploaded plan reflects work available to execution. The active imaging line is shown only while a capture command is running. The selected-cell outline remains separate so inspection does not look like planned or active work.

## Implementation boundary

- Economic heatmap values come from `CellMarketState.calculateCell` and the existing category exposure and recovery calculations.
- Schedule and active-capture overlays read the selected spacecraft’s operational plan and current runtime action. They do not add a new schedule, change plan upload timing, or predict imaging footprints.
- The imaging line is an operational cue, not a sensor geometry or ground-footprint model. Its target rectangle is the project’s existing quarter-degree market cell.
- Existing dataset layers remain available. Their current source definitions, limitations, and units stay authoritative in [Cell grid data](CELL_DATA.md).

## Open follow-up choices

- Whether to compare scheduled cells across multiple spacecraft or show only the selected spacecraft.
- Whether imagery should gain a physically derived swath/footprint once a sensor field-of-view model is agreed.
- Whether the player should be able to choose an explicit shared numeric range for map comparison across different markets or runs.
- Tune palette contrast and marker visibility after playtesting with all five new modes.
