# Cell grid data and visualization

## Implemented baseline — 2026-10-05

The prototype includes **363,779 eligible ¼° cells** out of 1,036,800 global cells. Eligibility uses every cell touched by the source land polygons, including coastal slivers and mapped islands. It does not test only the cell center, calculate land percentage, or reduce coastal value by land fraction. Polar regions use the same regular grid.

The grid includes 39,043 coastal cells, 18,229 urban cells, and 10,585 land-border cells. Mapped urban footprint area is estimated separately in every cell so large cities span multiple collection units. It contains 7,341 mapped cities/towns and 1,081 ports. Agriculture adds cropland and pasture area estimates on 138,523 and 141,799 cells. The power-plant source maps 34,889 facilities with 5,686,171 MW of summed capacity to eligible cells. The oil route layer has 1,155 mapped routes and crosses 11,204 eligible cells. New infrastructure and landmark sources add 824 military installation polygons, 4,255 data-center records, 217 NOAA monitoring stations, and 1,273 UNESCO World Heritage entries; their cell counts are derived from polygon intersections or point locations as described below. The 40-byte record grid compresses to about 1.97 MB; route geometries remain separate.

**Dollar values remain unset at the user's request.** Category prices, player-set priority rates, per-cell payout/priority, collection, and recovery have not been implemented. The market dashboard is read-only and reports time-varying category prices and refresh durations. The player sets category priority rates in points per matching unit; these are the scheduling controls, with no separate emphasis setting. Convert measured area to km² when needed; retain discrete site/route counts unless a defensible source measure supports another unit. Per cell-category, maximum payout is market unit price × eligible exposure and maximum priority is player rate × eligible exposure. Available payout and priority are each multiplied by VAM. A never-collected cell starts at VAM 1; after collection, VAM is 0 through 10% of cadence and ramps linearly to 1 at the full cadence. One last-collection timestamp is shared by all categories in the cell. Market rate, cadence, priority-rate, or elapsed-time changes immediately affect calculated values. Whole-cell capture resets all category contributions in the cell; mixed cells therefore reset slower-refresh categories as well. See [Gameplay](GAMEPLAY.md#market-information-cell-revenue-and-scheduling). Category/source mapping, initial market and priority rates, and the scheduler's ranking rule remain open.

## Source layers

The six Natural Earth layers use its 1:10 million datasets under [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). The version below is read from each archive's own VERSION file, rather than inferred from the overall website release.

| Dataset | Version / date | Cell attributes |
| --- | --- | --- |
| Natural Earth land | 5.1.1 | Eligibility |
| Natural Earth coastline | 5.0.0-pre9 | Coastline intersects cell |
| Natural Earth populated places | 5.1.2 | Mapped place count, sum of source POP_MAX estimates, names |
| Natural Earth ports | 5.0.0 | Port count and names |
| Natural Earth urban areas | 4.1.0 | Urban polygon intersection and estimated footprint area per cell |
| Natural Earth land boundaries | 5.1.0 | Land boundary intersects cell |
| Global agricultural lands | Circa 2015, v1 | Cropland and pasture area (ha), aggregated from 5 arc-minute fractional area cells |
| WRI Global Power Plant Database | 1.3.0 | Power plant records and summed capacity (MW) |
| Global Energy Monitor oil routes | Prepared 2026-09-15 | Mapped route counts by cell, plus line coordinates for globe display |
| USDOT/BTS NTAD Military Bases | FY2024 inventory, updated 2025-11-11 | Count of installation polygons intersecting each eligible cell |
| Gigawatt Map data centers | 2026-10-05 snapshot | Count of mapped point records in their cell and campus polygons in every intersected cell |
| NOAA Global Monitoring Laboratory observation sites | 2026-10-05 snapshot | Count of atmospheric/environmental monitoring stations by point location |
| UNESCO World Heritage List | 2026-10-05 snapshot | Count of World Heritage entries with mapped point locations |

URLs, SHA-256 checksums, retrieval dates, versions, and licenses are pinned in [`scripts/cell-sources.json`](../scripts/cell-sources.json) and distributed in [`public/data/cells/metadata.json`](../public/data/cells/metadata.json). The urban flag indicates intersection; its separate area attribute is an estimate. Border flags indicate intersection, not lengths. Boundaries follow the source dataset's representation. Agriculture source rasters are approximately 75 MB each and reduce to two per-cell area values. The WRI power database is a broad, older snapshot rather than a live inventory. Oil route geometries were supplied by Global Energy Monitor via Draw on a Map under CC BY 4.0. Gigawatt Map data-center data is ODbL 1.0 and carries attribution/share-alike requirements; UNESCO data is CC BY-SA 4.0 and carries attribution/share-alike requirements. NOAA and DoD source terms are linked from the manifest.

Natural gas pipelines, power transmission lines, substations, sensitive ecological areas, and ships remain **not yet sourced**. Their fields are null, and the interface identifies them as unknown. A zero in a sourced count means no feature is recorded there in that dataset; it does not prove the feature is absent in reality.

## Coverage limits

Natural Earth is generalized cartographic data. Islands and other features absent from the source cannot be recovered by a finer grid. The inclusive rasterization preserves mapped features that would be lost by testing cell centers, but does not promise exhaustive geographic coverage.

City population uses each source city's POP_MAX estimate at its mapped point. It is neither a current census nor total population within the cell. Neighboring city estimates may describe overlapping metropolitan areas; this layer should not be treated as an additive census or automatic price formula.

One source city point, Tasiusaq in Greenland, falls outside the land mask. It is reported in [`excluded-points.json`](../public/data/cells/excluded-points.json) and excluded rather than moved to a neighboring cell. All source ports map to eligible cells. Future source improvements should address this mismatch and broader coverage limitations.

Urban footprint area is estimated from Natural Earth urban polygons sampled on an 8× finer grid, then aggregated to each ¼° cell. A city's point and population label remain in one cell, but its mapped footprint is spread over every cell it covers. Footprint area is a coarse geographic proxy, not building area, population distribution, or a surveyed city boundary. Cell market value should use cell-local attributes so a single collection does not claim an entire city's value.

Agriculture fractions are aggregated from 3 × 3 five-arc-minute cells to a quarter-degree cell, then converted to hectares using spherical cell area. Cropland and pasture are independent modeled layers, so they can overlap. The product is a circa-2015 snapshot. Power plants use WRI v1.3.0; the dataset is no longer maintained, and its reported plant status/capacity should be read as an approximate market signal. Cell counts are records, not guaranteed distinct physical sites.

Oil routes include only features classified as oil with operating, construction, or proposed status. The source also has NGL routes, which are not included. The 1,155 route lines are generalized for a world map; some are approximate and do not represent surveyed rights of way. Projects without mapped line routes are absent. Clicking a visible route identifies its source project; clicking elsewhere selects the underlying cell.

Military locations use the DoD/BTS NTAD FY2024 Military Bases layer. The 824 source polygons are a broad global installation inventory, not a complete or current list of every military site; each eligible quarter-degree cell touched by a polygon receives one count for that record. Data centers use the approximate Gigawatt Map GeoJSON inventory, combining point records with mapped campus polygons. Its downloadable source contains 4,255 records in this snapshot; a polygon record counts in each eligible cell it touches, so counts measure cell-level presence and can exceed distinct records in dense areas. The UNESCO dataset contributes only its 1,273 World Heritage entries with point geometries; entries without coordinates are skipped, and exact nominated-property boundaries are not modeled. NOAA's 217 Global Monitoring Laboratory observation stations are a narrow, science-oriented research proxy rather than a census of research facilities. These four layers are deliberately summarized to counts, with no site geometries or names shipped to the runtime.

The Gigawatt Map download endpoint returned a 4,255-record file whose pinned SHA-256 is recorded in the source manifest, while its published [data catalog](https://gigawattmap.com/data) currently lists a 53-record export with a different checksum. The cached source snapshot is retained as an explicitly approximate simulation layer; do not refresh it without reviewing this discrepancy. Its ODbL attribution/share-alike terms still apply, including attribution to OpenStreetMap contributors.

## Data format and code boundaries

- Stable cell ID: `row * 1440 + column`, with row zero at 90° north and column zero at 180° west. Rows run southward; columns run eastward. Longitudes wrap across the dateline. Coordinate lookup assigns grid-edge points to the east/south cell, except the south pole is clamped to the final row.
- `grid.bin.gz` expands to a 12-byte header (`SECG`, little-endian uint32 version 4, uint32 record count), followed by sorted 40-byte records: uint32 cell ID, uint32 mapped city population, uint16 city count, uint16 port count, uint8 flags, uint16 urban footprint area in 0.1 km² units, 1 reserved byte, uint32 cropland area (ha), uint32 pasture area (ha), uint16 power-plant record count, uint32 power capacity (MW), and uint16 counts each for mapped oil routes, military installations, data-center records, NOAA research sites, and UNESCO World Heritage entries.
- Flag bits: 1 = coast, 2 = urban, 4 = land border, 8 = cropland, 16 = power plant, 32 = oil pipeline. Only eligible cells have records. `places.json` links city and port names by cell ID; `oil-pipeline-routes.geojson.gz` preserves the selected route geometries and source project attributes.
- `src/simulation/cells.ts` handles domain types, indexing, validation, and attribute access. Compact typed arrays and an integer lookup table avoid a large object graph.
- Its scalar `CellEconomy` values are null placeholders, not the future market model. When economy simulation is added, keep category market prices and player priority rates in category definitions, retain static per-cell source attributes/exposures, and store one `lastCollectedAtSeconds` value per cell. Derive payout and priority by category from current inputs and VAM instead of storing accumulated balances.
- `src/simulation/cellRaster.ts` generates map pixels independently of Cesium. `src/rendering/cellLayer.ts` adapts the pixels to on-demand geographic imagery tiles. Only the selected cell has an outline entity.
- `src/ui/cellMarket.ts` handles the Orders view, pagination, filtering, sorting, and selection. Geographic assets load independently of the orbit simulation; failure exposes a retry action.

## Interface behavior

The Cell Grid button toggles the overlay. Orders provides sixteen map modes, including four new layers for military installations, data centers, NOAA research sites, and UNESCO World Heritage entries. The oil-pipeline mode also draws the source routes and lets the user click one to read its project name. At a distance, a display pixel retains its strongest cell so small mapped islands and isolated features remain visible. Counts and areas use a logarithmic color scale; binary attributes use presence/absence colors. Cell boundaries appear as the globe is zoomed in.

Search accepts a city/port name, cell ID, or `latitude, longitude`. The table supports attribute filters, sorting, and ten rows per page. Selecting a row focuses and outlines that cell on the globe. Clicking the globe opens its details in Orders. A World view action restores the overview. The existing sample-site markers remain illustrative objects separate from the sourced cell attributes.

## Rebuilding and checking

Normal `npm run dev` and `npm run build` use the committed assets. They need neither Python nor live geodata services. To regenerate them in PowerShell:

```powershell
python -m pip install --target .cache/geo-python -r scripts/requirements-geography.txt
$env:PYTHONPATH = (Resolve-Path .cache/geo-python).Path
python scripts/build-cell-grid.py
python scripts/test-cell-rasterization.py
npm run test:cells
npm run build
```

The build script downloads missing source archives into ignored `.cache/cell-sources` and checks their pinned hashes before use. A changed archive fails rather than silently changing the geography; review and update the source manifest deliberately. Commit the generated assets together with any changed schema or source manifest.

Checks cover tiny islands and coastal slivers, dateline/pole indexing, valid land and open-ocean examples, record totals, unknown attributes, malformed data, and map transparency. Production build and live browser checks cover the integrated app.
