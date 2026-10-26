import { microsToUnits } from "../money";
import type { Action, Condition, Metric } from "./types";
import { describeCondition } from "./types";

export interface CampaignWindow {
  campaignId: string;
  name: string;
  status: string;
  budgetType: string | null;
  budgetMicros: number | null;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
}

/** Valore della metrica, o null se non calcolabile (es. CPA senza conversioni). */
export function metricValue(c: CampaignWindow, metric: Metric): number | null {
  const spend = microsToUnits(c.spendMicros);
  switch (metric) {
    case "impressions":
      return c.impressions;
    case "clicks":
      return c.clicks;
    case "spend":
      return spend;
    case "conversions":
      return c.conversions;
    case "ctr":
      return c.impressions ? (c.clicks / c.impressions) * 100 : null;
    case "cpc":
      return c.clicks ? spend / c.clicks : null;
    case "cpa":
      return c.conversions ? spend / c.conversions : null;
  }
}

export function matches(c: CampaignWindow, cond: Condition): boolean {
  const v = metricValue(c, cond.metric);
  if (v === null) return false;
  switch (cond.op) {
    case ">":
      return v > cond.value;
    case ">=":
      return v >= cond.value;
    case "<":
      return v < cond.value;
    case "<=":
      return v <= cond.value;
  }
}

/** L'azione ha senso solo se cambia qualcosa: non si mette in pausa una campagna già in pausa. */
export function actionApplies(c: CampaignWindow, action: Action): boolean {
  switch (action.type) {
    case "alert":
      return c.status !== "archived";
    case "pause":
      return c.status === "active";
    case "activate":
      return c.status === "paused";
    case "budget":
      return c.status === "active" && c.budgetType === "daily" && (c.budgetMicros ?? 0) > 0;
  }
}

export function newBudgetMicros(current: number, pct: number): number {
  // Arrotonda al centesimo: OpenAI accetta micro-unità intere.
  return Math.round((current * (1 + pct / 100)) / 10_000) * 10_000;
}

export interface Match {
  campaign: CampaignWindow;
  reason: string;
}

export function evaluateRule(campaigns: CampaignWindow[], conditions: Condition[], action: Action, lookbackDays: number): Match[] {
  return campaigns
    .filter((c) => actionApplies(c, action) && conditions.every((cond) => matches(c, cond)))
    .map((c) => ({
      campaign: c,
      reason: `Ultimi ${lookbackDays} giorni: ${conditions
        .map((cond) => `${describeCondition(cond)} (${formatValue(metricValue(c, cond.metric))})`)
        .join(", ")}`,
    }));
}

function formatValue(v: number | null): string {
  return v === null ? "–" : v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}
