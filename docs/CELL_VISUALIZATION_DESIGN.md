# Orders cell visualization design

**Status: Cell fill and Planning controls implemented. The fill control includes monthly average cloud cover alongside land-category priority. Maximum-value and current-priority layers use centered dots with a shared log-scaled blue-to-green-to-yellow-to-orange-to-red palette; cross-market scale comparisons remain open.**

## Goal

Give the player a fast geographic read of where value and work are, while keeping the detailed selected-cell values available in the Orders panel. These views are read-only projections of the simulation and do not change scheduling or revenue rules.

## Map modes and encoding

The globe overlay has two independent selectors. **Fill layer** chooses one priority category or monthly average cloud cover and controls the translucent cell fill. **Planning** controls operational outlines, maximum-dollar-value dots, or current-priority dots and can be changed without clearing the fill layer.

| Mode | What it shows | Encoding |
| --- | --- | --- |
| Land Categories | Current available priority contribution from the selected market category | Yellow-to-teal sequential ramp, category-specific log scale, translucent fill |
| Monthly average cloud cover | Baseline cloud amount for each eligible ¼° market cell in the current simulation month | Same translucent yellow-to-teal fill; 0–100% linear scale |
| No planning outline | No scheduled or active work outlines | Category fill remains visible |
| Scheduled cells | Capture cells on the selected spacecraft’s onboard plan or pending ground plan | Orange outline only |
| Satellite imaging a cell | Current capture target and line from spacecraft to cell | Yellow target outline, marker, “IMAGING” label, and thick line of sight |
| Maximum dollar value | Maximum potential payout for every eligible cell, assuming full VAM | Log-scaled blue-to-green-to-yellow-to-orange-to-red dots centered in each cell; category fill remains visible |
| Current priority | Total currently available priority points from all categories for every eligible cell | Same log-scaled blue-to-green-to-yellow-to-orange-to-red centered dots; category fill remains visible |

The scheduled-cells table includes a **Forecast cloud cover (%)** column for each collection. It shows the forecasted mean over that collection interval, stored when the schedule was prepared. It is a forecast snapshot, not observed weather or the monthly-average map layer. Manually authored captures also receive a forecast when their plan is prepared.

Fill layer options include the active market exposure definitions, so every category that contributes to priority is available, including military installations and coastal cells, plus monthly average cloud cover. Coastal cells are a candidate binary exposure (1 for cells intersecting the coastline); its prototype rate and final market approval remain open. The selected category's available priority is normalized to that category's maximum at its current player rate. Cloud fill reads the baseline month matching the simulation calendar; because the source is 1° and market cells are ¼°, the parent value is shared by the sixteen child cells. The January 2013 interim map is repeated for all months. It shows baseline averages, not the hourly weather or forecast. Selecting a cell shows its exact value for the current simulation month. Maximum dollar value sums each cell's category maximum payouts using current sample market prices, without applying recovery/VAM; its dot scale is logarithmic. Current priority sums each category's available priority after the cell's current recovery/VAM and player priority rates; its scale uses the maximum possible combined priority for the current market. Both dot layers use the same blue-low to red-high color ramp.

Dollar values remain numeric in the Orders table and selected-cell details. The translucent globe fill continues to show the selected category's current priority contribution; maximum payout and total current priority each use a separate centered-dot layer, and maximum payout is potential value rather than realized revenue.

Scheduled-cell state follows the currently selected spacecraft. A pending ground plan is visibly labeled as scheduled, though it is not yet aboard the spacecraft; an uploaded plan reflects work available to execution. These outlines refresh while any management tab is open, since their controls live on the globe. The active imaging line, target outline, and label appear only while a capture command is running. The selected-cell outline remains separate so inspection does not look like planned or active work.

## Implementation boundary

- Land-category fill values come from `CellMarketState.calculateCell` and its per-category available priority contribution. Maximum-value dots use category exposure multiplied by current market rates at full VAM; current-priority dots use the snapshot's combined available priority points. Map colors do not affect scheduling.
- The cloud fill reads `monthlyCloudBaselineAtPercent` from the shared baseline table using the selected market cell's global quarter-degree ID and the current UTC simulation month. It does not display actual hourly cloud or alter capture/scheduling state.
- Schedule and active-capture overlays read the selected spacecraft’s operational plan and current runtime action. They do not add a new schedule, change plan upload timing, or predict imaging footprints.
- The imaging line is an operational cue, not a sensor geometry or ground-footprint model. Its target rectangle is the project’s existing quarter-degree market cell.
- Geographic dataset attributes remain available in the Orders table and cell details. Their current source definitions, limitations, and units stay authoritative in [Cell grid data](CELL_DATA.md).

## Open follow-up choices

- Whether to compare scheduled cells across multiple spacecraft or show only the selected spacecraft.
- Whether imagery should gain a physically derived swath/footprint once a sensor field-of-view model is agreed.
- Whether the player should be able to choose an explicit shared numeric range for map comparison across different markets or runs.
- Confirm fill visibility and dot contrast at different zoom levels during playtesting.
- Decide whether category scales should remain individually normalized or gain a cross-category reference.
