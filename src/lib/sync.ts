import { sql } from "./db";
import { env } from "./env";
import { decryptSecret } from "./crypto";
import { unitsToMicros } from "./money";
import { addDays, budgetStatus, localDate, monthStart, thresholdsToAlert } from "./budget";
import { adsApiFor } from "./openai-ads";

// Rilegge sempre gli ultimi giorni: spesa e conversioni di OpenAI si assestano con ritardo.
const LOOKBACK_DAYS = 35;

export interface AdAccountRow {
  id: string;
  agency_id: string;
  client_id: string;
  timezone: string;
  api_key_ciphertext: Buffer;
  api_key_iv: Buffer;
  api_key_tag: Buffer;
}

export interface SyncResult {
  adAccountId: string;
  ok: boolean;
  rows: number;
  error?: string;
}

export async function syncAdAccount(account: AdAccountRow): Promise<SyncResult> {
  const db = sql();
  const [run] = await db`
    INSERT INTO sync_runs (agency_id, ad_account_id, status)
    VALUES (${account.agency_id}, ${account.id}, 'running') RETURNING id`;
  try {
    const apiKey = decryptSecret(
      { ciphertext: account.api_key_ciphertext, iv: account.api_key_iv, tag: account.api_key_tag },
      env().ENCRYPTION_KEY,
    );
    const api = adsApiFor(apiKey);
    const today = localDate(account.timezone);
    const range = { since: addDays(today, -LOOKBACK_DAYS), until: today };
    const [info, campaigns, insights] = await Promise.all([
      api.getAdAccount(),
      api.listCampaigns(),
      api.getDailyCampaignInsights(range),
    ]);

    await db`
      UPDATE ad_accounts SET name = ${info.account_name ?? info.name}, status = ${info.status ?? null},
        review_status = ${info.review?.status ?? null}, timezone = ${info.timezone},
        currency_code = ${info.currency_code}
      WHERE id = ${account.id}`;

    const budgetType = campaigns.map((c) =>
      c.budget?.daily_spend_limit_micros != null ? "daily" : c.budget?.lifetime_spend_limit_micros != null ? "lifetime" : null,
    );
    await db`
      INSERT INTO campaigns (agency_id, ad_account_id, openai_campaign_id, name, status, budget_type, budget_micros, start_time, end_time)
      SELECT ${account.agency_id}, ${account.id}, * FROM unnest(
        ${campaigns.map((c) => c.id)}::text[],
        ${campaigns.map((c) => c.name)}::text[],
        ${campaigns.map((c) => c.status)}::text[],
        ${budgetType}::text[],
        ${campaigns.map((c) => c.budget?.daily_spend_limit_micros ?? c.budget?.lifetime_spend_limit_micros ?? null)}::bigint[],
        ${campaigns.map((c) => (c.start_time ? new Date(c.start_time * 1000).toISOString() : null))}::timestamptz[],
        ${campaigns.map((c) => (c.end_time ? new Date(c.end_time * 1000).toISOString() : null))}::timestamptz[]
      )
      ON CONFLICT (ad_account_id, openai_campaign_id) DO UPDATE SET
        name = EXCLUDED.name, status = EXCLUDED.status, budget_type = EXCLUDED.budget_type,
        budget_micros = EXCLUDED.budget_micros, start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time, updated_at = now()`;

    await db`
      INSERT INTO daily_metrics (agency_id, ad_account_id, campaign_id, date, impressions, clicks, spend_micros, conversions)
      SELECT ${account.agency_id}, ${account.id}, c.id, m.date, m.impressions, m.clicks, m.spend_micros, m.conversions
      FROM unnest(
        ${insights.map((r) => r.campaign_id)}::text[],
        ${insights.map((r) => r.readable_time)}::date[],
        ${insights.map((r) => r.impressions)}::bigint[],
        ${insights.map((r) => r.clicks)}::bigint[],
        ${insights.map((r) => unitsToMicros(r.spend ?? 0))}::bigint[],
        ${insights.map((r) => r.conversions ?? null)}::numeric[]
      ) AS m(openai_campaign_id, date, impressions, clicks, spend_micros, conversions)
      JOIN campaigns c ON c.ad_account_id = ${account.id} AND c.openai_campaign_id = m.openai_campaign_id
      ON CONFLICT (campaign_id, date) DO UPDATE SET
        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, spend_micros = EXCLUDED.spend_micros,
        conversions = EXCLUDED.conversions, synced_at = now()`;

    await recordBudgetAlerts(account.client_id, today);

    await db`
      UPDATE ad_accounts SET last_synced_at = now() WHERE id = ${account.id}`;
    await db`
      UPDATE sync_runs SET status = 'ok', finished_at = now(), rows_upserted = ${insights.length}
      WHERE id = ${run.id}`;
    return { adAccountId: account.id, ok: true, rows: insights.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db`
      UPDATE sync_runs SET status = 'error', finished_at = now(), error = ${message} WHERE id = ${run.id}`;
    return { adAccountId: account.id, ok: false, rows: 0, error: message };
  }
}

/** Registra un avviso per ogni soglia superata. L'invio email arriva nel passo 3. */
async function recordBudgetAlerts(clientId: string, today: string): Promise<void> {
  const db = sql();
  const period = monthStart(today);
  const [client] = await db`
    SELECT c.id, c.agency_id, c.monthly_budget_micros::float8 AS budget, c.alert_thresholds,
      COALESCE((SELECT sum(m.spend_micros) FROM daily_metrics m
        JOIN ad_accounts a ON a.id = m.ad_account_id
        WHERE a.client_id = c.id AND m.date >= ${period}::date AND m.date <= ${today}::date), 0)::float8 AS spend,
      COALESCE((SELECT array_agg(threshold) FROM alerts
        WHERE client_id = c.id AND period_month = ${period}::date), '{}') AS alerted
    FROM clients c WHERE c.id = ${clientId}`;
  if (!client) return;
  const status = budgetStatus(client.spend, client.budget, today);
  const due = thresholdsToAlert(status.spentPct, client.alert_thresholds, client.alerted);
  for (const threshold of due) {
    await db`
      INSERT INTO alerts (agency_id, client_id, period_month, threshold, spend_micros, budget_micros)
      VALUES (${client.agency_id}, ${client.id}, ${period}::date, ${threshold}, ${status.spendMicros}, ${status.budgetMicros})
      ON CONFLICT (client_id, period_month, threshold) DO NOTHING`;
  }
}

/** Senza agencyId sincronizza tutte le agenzie (cron); con agencyId solo quella (pulsante in dashboard). */
export async function syncAll(agencyId?: string): Promise<SyncResult[]> {
  const accounts = (await sql()`
    SELECT id, agency_id, client_id, timezone, api_key_ciphertext, api_key_iv, api_key_tag
    FROM ad_accounts WHERE ${agencyId ?? null}::uuid IS NULL OR agency_id = ${agencyId ?? null}::uuid
    ORDER BY last_synced_at NULLS FIRST`) as AdAccountRow[];
  const results: SyncResult[] = [];
  // In sequenza: i limiti di chiamate OpenAI valgono per account e per IP.
  for (const a of accounts) results.push(await syncAdAccount(a));
  return results;
}
