# Orders cell visualization design

**Status: Two independent map controls implemented; palette tuning and fleet comparisons remain open.**

## Goal

Give the player a fast geographic read of where value and work are, while keeping the detailed selected-cell values available in the Orders panel. These views are read-only projections of the simulation and do not change scheduling or revenue rules.

## Map modes and encoding

The globe overlay has two independent selectors. **Land Categories** chooses one priority category and controls the translucent cell fill. **Planning** controls operational outlines or the maximum-dollar-value dot layer and can be changed without clearing the category fill.

| Mode | What it shows | Encoding |
| --- | --- | --- |
| Land Categories | Current available priority contribution from the selected market category | Yellow-to-teal sequential ramp, category-specific log scale, translucent fill |
| No planning outline | No scheduled or active work outlines | Category fill remains visible |
| Scheduled cells | Capture cells on the selected spacecraft’s onboard plan or pending ground plan | Orange outline only |
| Satellite imaging a cell | Current capture target and line from spacecraft to cell | Yellow target outline, marker, “IMAGING” label, and thick line of sight |
| Maximum dollar value | Maximum potential payout for every eligible cell, assuming full VAM | Log-scaled blue-to-green-to-yellow-to-orange-to-red dots centered in each cell; category fill remains visible |

Land Categories options come from the active market exposure definitions, so every category that contributes to priority is available, including military installations and coastal cells. Coastal cells are now a candidate binary exposure (1 for cells intersecting the coastline); its prototype rate and final market approval remain open. The selected category's available priority is normalized to that category's maximum at its current player rate. Selecting a cell still shows exact values and priority. Maximum dollar value sums each cell's category maximum payouts using current sample market prices, without applying recovery/VAM; its dot scale is logarithmic.

Dollar values remain numeric in the Orders table and selected-cell details. The translucent globe fill continues to show current priority contribution; maximum payout uses a separate centered-dot layer and is potential value, not realized revenue.

Scheduled-cell state follows the currently selected spacecraft. A pending ground plan is visibly labeled as scheduled, though it is not yet aboard the spacecraft; an uploaded plan reflects work available to execution. These outlines refresh while any management tab is open, since their controls live on the globe. The active imaging line, target outline, and label appear only while a capture command is running. The selected-cell outline remains separate so inspection does not look like planned or active work.

## Implementation boundary

- Land-category fill values come from `CellMarketState.calculateCell` and its per-category available priority contribution. Maximum-value dots use category exposure multiplied by current market rates at full VAM. Map colors do not affect scheduling.
- Schedule and active-capture overlays read the selected spacecraft’s operational plan and current runtime action. They do not add a new schedule, change plan upload timing, or predict imaging footprints.
- The imaging line is an operational cue, not a sensor geometry or ground-footprint model. Its target rectangle is the project’s existing quarter-degree market cell.
- Geographic dataset attributes remain available in the Orders table and cell details. Their current source definitions, limitations, and units stay authoritative in [Cell grid data](CELL_DATA.md).

## Open follow-up choices

- Whether to compare scheduled cells across multiple spacecraft or show only the selected spacecraft.
- Whether imagery should gain a physically derived swath/footprint once a sensor field-of-view model is agreed.
- Whether the player should be able to choose an explicit shared numeric range for map comparison across different markets or runs.
- Confirm fill visibility and outline contrast at different zoom levels during playtesting.
- Decide whether category scales should remain individually normalized or gain a cross-category reference.
