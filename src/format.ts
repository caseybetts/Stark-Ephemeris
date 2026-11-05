const percentageFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** Format a displayed percentage with at most two fractional digits. */
export function formatPercent(value: number): string {
  return percentageFormatter.format(value);
}
