import { describe, expect, it } from "vitest";
import { addDays, budgetStatus, daysInMonth, localDate, thresholdsToAlert } from "../src/lib/budget";

describe("budgetStatus", () => {
  it("prevede la spesa a fine mese al ritmo attuale", () => {
    // 10 giorni su 30, 500 € spesi su 1.500 € → previsione 1.500 € (100%)
    const s = budgetStatus(500_000_000, 1_500_000_000, "2026-11-10");
    expect(s.spentPct).toBeCloseTo(33.33, 1);
    expect(s.forecastMicros).toBe(1_500_000_000);
    expect(s.forecastPct).toBeCloseTo(100);
  });

  it("non divide per zero con budget nullo", () => {
    expect(budgetStatus(10, 0, "2026-11-01").spentPct).toBe(0);
  });
});

describe("thresholdsToAlert", () => {
  it("restituisce solo le soglie superate e non ancora avvisate", () => {
    expect(thresholdsToAlert(96, [80, 95], [])).toEqual([80, 95]);
    expect(thresholdsToAlert(96, [80, 95], [80])).toEqual([95]);
    expect(thresholdsToAlert(79.9, [80, 95], [])).toEqual([]);
  });
});

describe("date", () => {
  it("conta i giorni del mese, anche febbraio bisestile", () => {
    expect(daysInMonth("2028-02-10")).toBe(29);
    expect(daysInMonth("2026-11-01")).toBe(30);
  });

  it("usa il fuso orario del cliente", () => {
    const at = new Date("2026-10-25T23:30:00Z");
    expect(localDate("Europe/Rome", at)).toBe("2026-10-26");
    expect(localDate("UTC", at)).toBe("2026-10-25");
  });

  it("somma giorni attraverso il cambio di mese", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});
