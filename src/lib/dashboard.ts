import { sql } from "./db";
import { budgetStatus, localDate, monthStart, type BudgetStatus } from "./budget";

export interface ClientOverview {
  id: string;
  name: string;
  currency: string;
  accounts: number;
  reviewStatus: string | null;
  lastSyncedAt: Date | null;
  todaySpendMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  budget: BudgetStatus;
}

export async function clientOverview(agencyId: string): Promise<ClientOverview[]> {
  const [agency] = await sql()`SELECT timezone FROM agencies WHERE id = ${agencyId}`;
  if (!agency) return [];
  const today = localDate(agency.timezone);
  const rows = await sql()`
    SELECT c.id, c.name, c.monthly_budget_micros::float8 AS budget,
      COALESCE(min(a.currency_code), 'EUR') AS currency,
      count(DISTINCT a.id)::int AS accounts,
      min(a.review_status) AS review_status,
      max(a.last_synced_at) AS last_synced_at,
      COALESCE(sum(m.spend_micros), 0)::float8 AS spend,
      COALESCE(sum(m.spend_micros) FILTER (WHERE m.date = ${today}::date), 0)::float8 AS today_spend,
      COALESCE(sum(m.impressions), 0)::float8 AS impressions,
      COALESCE(sum(m.clicks), 0)::float8 AS clicks,
      COALESCE(sum(m.conversions), 0)::float8 AS conversions
    FROM clients c
    LEFT JOIN ad_accounts a ON a.client_id = c.id
    LEFT JOIN daily_metrics m ON m.ad_account_id = a.id
      AND m.date >= ${monthStart(today)}::date AND m.date <= ${today}::date
    WHERE c.agency_id = ${agencyId}
    GROUP BY c.id
    ORDER BY c.name`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    currency: r.currency.trim(),
    accounts: r.accounts,
    reviewStatus: r.review_status,
    lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at) : null,
    todaySpendMicros: r.today_spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    budget: budgetStatus(r.spend, r.budget, today),
  }));
}

export async function firstAgency(): Promise<{ id: string; name: string } | undefined> {
  const [row] = await sql()`SELECT id, name FROM agencies ORDER BY created_at LIMIT 1`;
  return row as { id: string; name: string } | undefined;
}
