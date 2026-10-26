import { describe, expect, it } from "vitest";
import { evaluateRule, metricValue, newBudgetMicros, type CampaignWindow } from "../src/lib/rules/engine";
import { TEMPLATES, ruleInputSchema } from "../src/lib/rules/types";
import { parseRule, ruleToParams } from "../src/app/regole/form";

const base: CampaignWindow = {
  campaignId: "c1",
  name: "Prospecting",
  status: "active",
  budgetType: "daily",
  budgetMicros: 50_000_000,
  impressions: 10_000,
  clicks: 40,
  spendMicros: 80_000_000,
  conversions: 0,
};

describe("motore regole", () => {
  it("calcola le metriche derivate e restituisce null se non calcolabili", () => {
    expect(metricValue(base, "spend")).toBe(80);
    expect(metricValue(base, "ctr")).toBeCloseTo(0.4);
    expect(metricValue(base, "cpc")).toBe(2);
    expect(metricValue(base, "cpa")).toBeNull();
  });

  it("trova le campagne che spendono senza convertire", () => {
    const [tpl] = TEMPLATES;
    const converting = { ...base, campaignId: "c2", conversions: 4 };
    const matches = evaluateRule([base, converting], tpl.conditions, tpl.action, tpl.lookbackDays);
    expect(matches.map((m) => m.campaign.campaignId)).toEqual(["c1"]);
    expect(matches[0].reason).toContain("Spesa (€) > 50 (80)");
  });

  it("non propone azioni che non cambiano nulla", () => {
    const paused = { ...base, status: "paused" };
    expect(evaluateRule([paused], [{ metric: "spend", op: ">", value: 1 }], { type: "pause" }, 7)).toHaveLength(0);
    const lifetime = { ...base, budgetType: "lifetime" };
    expect(evaluateRule([lifetime], [{ metric: "spend", op: ">", value: 1 }], { type: "budget", pct: 10 }, 7)).toHaveLength(0);
  });

  it("una condizione su una metrica non calcolabile non scatta", () => {
    expect(evaluateRule([base], [{ metric: "cpa", op: ">", value: 0 }], { type: "alert" }, 7)).toHaveLength(0);
  });

  it("arrotonda il nuovo budget al centesimo", () => {
    expect(newBudgetMicros(33_333_333, 10)).toBe(36_670_000);
    expect(newBudgetMicros(50_000_000, -20)).toBe(40_000_000);
  });

  it("limita la variazione di budget a ±50%", () => {
    const bad = { ...TEMPLATES[2], action: { type: "budget", pct: 80 } };
    expect(ruleInputSchema.safeParse(bad).success).toBe(false);
  });

  it("il form rilegge una regola dai parametri senza perdere nulla", () => {
    for (const t of TEMPLATES) {
      const rule = ruleInputSchema.parse(t); // toglie la descrizione del modello
      const parsed = parseRule(ruleToParams(rule));
      expect(parsed).toEqual({ ok: true, rule });
    }
  });

  it("il form spiega cosa manca", () => {
    const p = new URLSearchParams({ name: "", lookbackDays: "7", action: "alert" });
    expect(parseRule(p)).toEqual({ ok: false, error: "Dai un nome alla regola." });
  });
});
