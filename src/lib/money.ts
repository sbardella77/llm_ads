export const MICROS_PER_UNIT = 1_000_000;

/** L'API Insights restituisce la spesa in unità intere (es. 18.42); nel DB usiamo micro-unità. */
export function unitsToMicros(units: number): number {
  return Math.round(units * MICROS_PER_UNIT);
}

export function microsToUnits(micros: number): number {
  return micros / MICROS_PER_UNIT;
}

export function formatMoney(micros: number, currency: string): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(microsToUnits(micros));
}
