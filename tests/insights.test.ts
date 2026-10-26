import { describe, expect, it } from "vitest";
import { decompose, explain } from "../src/lib/investigator";
import { runAudit, type AuditInput } from "../src/lib/audit";
import { pacing } from "../src/lib/client-detail";
import { budgetStatus } from "../src/lib/budget";

describe("investigatore", () => {
  it("i due effetti sommano esattamente alla variazione", () => {
    const [x, r] = decompose(100, 150, 10_000, 12_000);
    expect(x + r).toBeCloseTo(50);
    expect(x).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(0);
  });

  it("attribuisce il calo dei clic al CTR quando le impression non cambiano", () => {
    const [clicks] = explain(
      { impressions: 10_000, clicks: 200, spendMicros: 1, conversions: 1 },
      { impressions: 10_000, clicks: 100, spendMicros: 1, conversions: 1 },
    );
    expect(clicks.factors[0].effect).toBeCloseTo(0);
    expect(clicks.factors[1].effect).toBeCloseTo(-100);
  });

  it("con un periodo vuoto assegna tutto al volume", () => {
    expect(decompose(0, 30, 0, 1000)).toEqual([30, 0]);
  });
});

const healthy: AuditInput = {
  today: "2026-10-15",
  now: new Date("2026-10-15T10:00:00Z"),
  accounts: [{ name: "Acct", reviewStatus: "approved", lastSyncedAt: new Date("2026-10-15T05:00:00Z"), lastSyncError: null }],
  campaigns: [
    { name: "A", status: "active", budgetMicros: 50_000_000, endTime: null, impressions7d: 5000, spend14dMicros: 100_000_000, conversions14d: 10 },
  ],
  monthSpendMicros: 500_000_000,
  monthlyBudgetMicros: 1_000_000_000,
  impressions30d: 20_000,
  clicks30d: 200,
  conversions30d: 20,
};

describe("audit", () => {
  it("un account in ordine prende A senza segnalazioni", () => {
    expect(runAudit(healthy)).toEqual({ score: 100, grade: "A", findings: [] });
  });

  it("segnala revisione, campagne senza budget e tracciamento mancante, i critici per primi", () => {
    const res = runAudit({
      ...healthy,
      accounts: [{ ...healthy.accounts[0], reviewStatus: "pending" }],
      campaigns: [...healthy.campaigns, { ...healthy.campaigns[0], name: "B", budgetMicros: null }],
      conversions30d: 0,
    });
    expect(res.findings.map((f) => f.id)).toEqual(["review-Acct", "no-budget", "no-tracking"]);
    expect(res.score).toBe(55);
    expect(res.grade).toBe("D");
  });

  it("avvisa se il ritmo porta a sforare il budget", () => {
    const res = runAudit({ ...healthy, monthSpendMicros: 900_000_000 });
    expect(res.findings[0].id).toBe("overspend");
  });

  it("un budget già superato è critico", () => {
    const res = runAudit({ ...healthy, monthSpendMicros: 1_100_000_000 });
    expect(res.findings.map((f) => f.id)).toEqual(["over-budget"]);
    expect(res.grade).toBe("B");
  });

  it("segnala un sync vecchio", () => {
    const res = runAudit({ ...healthy, accounts: [{ ...healthy.accounts[0], lastSyncedAt: new Date("2026-10-12T00:00:00Z") }] });
    expect(res.findings.map((f) => f.id)).toEqual(["sync-stale-Acct"]);
  });
});

describe("ritmo di spesa", () => {
  it("calcola la spesa giornaliera per arrivare al budget", () => {
    const p = pacing(budgetStatus(400_000_000, 1_000_000_000, "2026-10-20"), "2026-10-20", 25_000_000);
    expect(p.daysLeft).toBe(12);
    expect(p.targetDailyMicros).toBe(50_000_000);
    expect(p.currentDailyMicros).toBe(25_000_000);
  });

  it("a budget esaurito consiglia zero", () => {
    expect(pacing(budgetStatus(1_200_000_000, 1_000_000_000, "2026-10-20"), "2026-10-20", 0).targetDailyMicros).toBe(0);
  });
});
