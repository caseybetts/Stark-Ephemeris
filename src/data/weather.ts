const CLOUD_BASELINE_BYTES = 12 * 180 * 360;

export type CloudBaselineAsset = {
  table: Uint8Array;
  version: number;
};

/** Load the optional NOAA-derived month-major cloud baseline table. */
export async function loadCloudBaseline(): Promise<CloudBaselineAsset | undefined> {
  const base = `${import.meta.env.BASE_URL}data/weather/`;
  const response = await fetch(`${base}cloud-baseline.bin`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Cloud baseline could not load (${response.status})`);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== CLOUD_BASELINE_BYTES) {
    throw new Error(`Cloud baseline has ${buffer.byteLength} bytes; expected ${CLOUD_BASELINE_BYTES}`);
  }

  const metadataResponse = await fetch(`${base}cloud-baseline.json`);
  if (!metadataResponse.ok) throw new Error(`Cloud baseline metadata could not load (${metadataResponse.status})`);
  const metadata = await metadataResponse.json() as { version?: unknown };
  if (!Number.isInteger(metadata.version) || (metadata.version as number) < 1) {
    throw new Error("Cloud baseline metadata needs a positive integer version");
  }

  return { table: new Uint8Array(buffer), version: metadata.version as number };
}
