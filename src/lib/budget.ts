export interface BudgetStatus {
  spendMicros: number;
  budgetMicros: number;
  /** Percentuale del budget mensile già spesa (0-100+). */
  spentPct: number;
  /** Spesa prevista a fine mese al ritmo medio dei giorni trascorsi. */
  forecastMicros: number;
  forecastPct: number;
}

export function daysInMonth(isoDate: string): number {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `today` è la data locale del cliente (YYYY-MM-DD); il giorno in corso conta come trascorso. */
export function budgetStatus(spendMicros: number, budgetMicros: number, today: string): BudgetStatus {
  const elapsed = Number(today.slice(8, 10));
  const forecastMicros = Math.round((spendMicros / elapsed) * daysInMonth(today));
  const pct = (v: number) => (budgetMicros > 0 ? (v / budgetMicros) * 100 : 0);
  return {
    spendMicros,
    budgetMicros,
    spentPct: pct(spendMicros),
    forecastMicros,
    forecastPct: pct(forecastMicros),
  };
}

/** Soglie superate per cui non è ancora stato registrato un avviso questo mese. */
export function thresholdsToAlert(spentPct: number, thresholds: number[], alreadyAlerted: number[]): number[] {
  return thresholds
    .filter((t) => spentPct >= t && !alreadyAlerted.includes(t))
    .sort((a, b) => a - b);
}

export function localDate(timezone: string, at: Date = new Date()): string {
  // en-CA formatta come YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
