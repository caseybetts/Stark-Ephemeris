import { CellGrid } from "../simulation/cells";
import type { CellGridMetadata, CellPlaces, OilPipelineRoutes } from "../simulation/cells";

export async function loadCellGrid(): Promise<CellGrid> {
  const base = `${import.meta.env.BASE_URL}data/cells/`;
  const responses = await Promise.all(["metadata.json", "grid.bin.gz", "places.json", "oil-pipeline-routes.geojson.gz"].map(async (file) => {
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(`Cell data could not load (${response.status}: ${file})`);
    return response;
  }));
  const [metadata, compressed, places, pipelineCompressed] = await Promise.all([
    responses[0].json() as Promise<CellGridMetadata>, responses[1].arrayBuffer(), responses[2].json() as Promise<CellPlaces>,
    responses[3].arrayBuffer(),
  ]);
  const decompress = async (input: ArrayBuffer) => {
    const signature = new Uint8Array(input, 0, Math.min(2, input.byteLength));
    // Some hosts may already decode Content-Encoding: gzip; local static assets are compressed files.
    return signature[0] === 0x1f && signature[1] === 0x8b
      ? await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : input;
  };
  const [buffer, pipelineRaw] = await Promise.all([decompress(compressed), decompress(pipelineCompressed)]);
  const routes = JSON.parse(new TextDecoder().decode(pipelineRaw)) as OilPipelineRoutes;
  return new CellGrid(buffer, metadata, places, routes);
}
