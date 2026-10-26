import { sql } from "./db";
import { budgetStatus, daysInMonth, localDate, monthStart, type BudgetStatus } from "./budget";

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  budgetType: string | null;
  budgetMicros: number | null;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
}

export interface Pacing extends BudgetStatus {
  daysLeft: number;
  /** Spesa giornaliera che porta esattamente al budget a fine mese. */
  targetDailyMicros: number;
  /** Somma dei budget giornalieri delle campagne attive. */
  currentDailyMicros: number;
}

export interface ClientDetail {
  id: string;
  name: string;
  currency: string;
  campaigns: CampaignRow[];
  pacing: Pacing;
}

/** Quanto spendere al giorno da oggi a fine mese per centrare il budget (Reach Target Monthly Spend). */
export function pacing(status: BudgetStatus, today: string, currentDailyMicros: number): Pacing {
  // Il giorno in corso conta tra quelli rimasti: la spesa di oggi è ancora parziale.
  const daysLeft = daysInMonth(today) - Number(today.slice(8, 10)) + 1;
  const remaining = Math.max(0, status.budgetMicros - status.spendMicros);
  return { ...status, daysLeft, targetDailyMicros: Math.round(remaining / daysLeft), currentDailyMicros };
}

export async function clientDetail(agencyId: string, clientId: string): Promise<ClientDetail | null> {
  const db = sql();
  const [client] = await db`
    SELECT c.id, c.name, c.monthly_budget_micros::float8 AS budget, ag.timezone,
      COALESCE((SELECT min(currency_code) FROM ad_accounts WHERE client_id = c.id), 'EUR') AS currency
    FROM clients c JOIN agencies ag ON ag.id = c.agency_id
    WHERE c.id = ${clientId} AND c.agency_id = ${agencyId}`;
  if (!client) return null;
  const today = localDate(client.timezone);
  const rows = await db`
    SELECT c.id, c.name, c.status, c.budget_type, c.budget_micros::float8 AS budget_micros,
      COALESCE(sum(m.impressions), 0)::float8 AS impressions,
      COALESCE(sum(m.clicks), 0)::float8 AS clicks,
      COALESCE(sum(m.spend_micros), 0)::float8 AS spend,
      COALESCE(sum(m.conversions), 0)::float8 AS conversions
    FROM campaigns c
    JOIN ad_accounts a ON a.id = c.ad_account_id
    LEFT JOIN daily_metrics m ON m.campaign_id = c.id AND m.date >= ${monthStart(today)}::date AND m.date <= ${today}::date
    WHERE a.client_id = ${clientId} AND c.agency_id = ${agencyId}
    GROUP BY c.id
    ORDER BY c.status, spend DESC`;
  const campaigns: CampaignRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    budgetType: r.budget_type,
    budgetMicros: r.budget_micros,
    impressions: r.impressions,
    clicks: r.clicks,
    spendMicros: r.spend,
    conversions: r.conversions,
  }));
  const spend = campaigns.reduce((s, c) => s + c.spendMicros, 0);
  const currentDaily = campaigns
    .filter((c) => c.status === "active" && c.budgetType === "daily")
    .reduce((s, c) => s + (c.budgetMicros ?? 0), 0);
  return {
    id: client.id,
    name: client.name,
    currency: client.currency.trim(),
    campaigns,
    pacing: pacing(budgetStatus(spend, client.budget, today), today, currentDaily),
  };
}

export interface ChangeEntry {
  id: string;
  clientName: string;
  source: "user" | "rule" | "openai";
  who: string | null;
  summary: string;
  createdAt: Date;
}

export async function listChanges(agencyId: string, clientId: string | null = null, limit = 200): Promise<ChangeEntry[]> {
  const rows = await sql()`
    SELECT l.id, cl.name AS client_name, l.source, COALESCE(u.name, r.name) AS who, l.summary, l.created_at
    FROM change_log l
    JOIN clients cl ON cl.id = l.client_id
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN rules r ON r.id = l.rule_id
    WHERE l.agency_id = ${agencyId} AND (${clientId}::uuid IS NULL OR l.client_id = ${clientId}::uuid)
    ORDER BY l.created_at DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    clientName: r.client_name,
    source: r.source,
    who: r.who,
    summary: r.summary,
    createdAt: new Date(r.created_at),
  }));
}

export interface BudgetAlert {
  id: string;
  clientId: string;
  clientName: string;
  threshold: number;
  spendMicros: number;
  budgetMicros: number;
  createdAt: Date;
  acknowledged: boolean;
}

export async function listBudgetAlerts(agencyId: string): Promise<BudgetAlert[]> {
  const rows = await sql()`
    SELECT a.id, a.client_id, c.name AS client_name, a.threshold, a.spend_micros::float8 AS spend,
      a.budget_micros::float8 AS budget, a.created_at, a.acknowledged_at
    FROM alerts a JOIN clients c ON c.id = a.client_id
    WHERE a.agency_id = ${agencyId}
    ORDER BY a.acknowledged_at NULLS FIRST, a.created_at DESC
    LIMIT 100`;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    threshold: r.threshold,
    spendMicros: r.spend,
    budgetMicros: r.budget,
    createdAt: new Date(r.created_at),
    acknowledged: r.acknowledged_at !== null,
  }));
}

export async function openItemsCount(agencyId: string): Promise<number> {
  const [row] = await sql()`
    SELECT ((SELECT count(*) FROM suggestions WHERE agency_id = ${agencyId} AND status = 'pending')
      + (SELECT count(*) FROM alerts WHERE agency_id = ${agencyId} AND acknowledged_at IS NULL))::int AS n`;
  return row?.n ?? 0;
}
