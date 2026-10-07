import { CELL_COLUMNS, CELL_ROWS } from "./cells.ts";
import type { CellGrid, CellLayer } from "./cells.ts";

/** An equirectangular tile: x/y/level follow Cesium's default geographic tiling scheme.
 * At distant scales, retain the strongest cell in each pixel so small coastal
 * cells and isolated features survive aggregation. No data are interpolated.
 */
export function rasterizeCellTile(grid: CellGrid, layer: CellLayer, x: number, y: number, level: number, size = 256): Uint8ClampedArray {
  const scale = 2 ** level;
  const span = CELL_ROWS / scale;
  const rowStart = y * span;
  const columnStart = x * span;
  const values = new Float32Array(size * size).fill(-1);
  const maximum = Math.max(1, grid.maximum(layer));
  for (let row = Math.max(0, Math.floor(rowStart)); row < Math.min(CELL_ROWS, Math.ceil(rowStart + span)); row++) {
    const top = Math.max(0, Math.floor((row - rowStart) * size / span));
    const bottom = Math.min(size, Math.ceil((row + 1 - rowStart) * size / span));
    for (let col = Math.max(0, Math.floor(columnStart)); col < Math.min(CELL_COLUMNS, Math.ceil(columnStart + span)); col++) {
      const index = grid.indexById[row * CELL_COLUMNS + col];
      if (index === -1) continue;
      const raw = grid.value(index, layer);
      const binary = ["border", "coastal"].includes(layer);
      const normalized = layer === "coverage" ? 0.45 : binary ? raw : Math.log1p(raw) / Math.log1p(maximum);
      const left = Math.max(0, Math.floor((col - columnStart) * size / span));
      const right = Math.min(size, Math.ceil((col + 1 - columnStart) * size / span));
      for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
        const pixel = py * size + px;
        values[pixel] = Math.max(values[pixel], normalized);
      }
    }
  }
  const rgba = new Uint8ClampedArray(size * size * 4);
  const pixelsPerCell = size / span;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const pixel = py * size + px;
    const t = values[pixel];
    if (t < 0) continue;
    const offset = pixel * 4;
    const cellX = (columnStart + (px + 0.5) / pixelsPerCell) % 1;
    const cellY = (rowStart + (py + 0.5) / pixelsPerCell) % 1;
    const edge = pixelsPerCell >= 8 && (cellX * pixelsPerCell < 0.8 || cellY * pixelsPerCell < 0.8);
    if (layer === "coverage") {
      rgba[offset] = 67; rgba[offset + 1] = 199; rgba[offset + 2] = 177;
      rgba[offset + 3] = edge ? 210 : 75;
    } else {
      rgba[offset] = Math.round(42 + 212 * t);
      rgba[offset + 1] = Math.round(124 + 78 * t);
      rgba[offset + 2] = Math.round(130 - 32 * t);
      rgba[offset + 3] = edge ? 190 : (t === 0 ? 40 : 185);
    }
  }
  return rgba;
}
