import { sql } from "../db";
import { addDays, localDate } from "../budget";
import { applyCampaignAction } from "../changes";
import { evaluateRule, type CampaignWindow, type Match } from "./engine";
import { actionSchema, conditionSchema, type Action, type Condition, type RuleInput } from "./types";

export interface Rule {
  id: string;
  clientId: string | null;
  clientName: string | null;
  name: string;
  conditions: Condition[];
  lookbackDays: number;
  action: Action;
  mode: "suggest" | "auto";
  enabled: boolean;
  lastRunAt: Date | null;
}

type ClientWindow = CampaignWindow & { clientId: string; clientName: string };

export async function listRules(agencyId: string): Promise<Rule[]> {
  const rows = await sql()`
    SELECT r.*, c.name AS client_name FROM rules r LEFT JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ${agencyId} ORDER BY r.created_at`;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    name: r.name,
    conditions: conditionSchema.array().parse(r.conditions),
    lookbackDays: r.lookback_days,
    action: actionSchema.parse(r.action),
    mode: r.mode,
    enabled: r.enabled,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at) : null,
  }));
}

export async function createRule(agencyId: string, input: RuleInput): Promise<string> {
  const [row] = await sql()`
    INSERT INTO rules (agency_id, client_id, name, conditions, lookback_days, action, mode)
    SELECT ${agencyId}, ${input.clientId}, ${input.name}, ${JSON.stringify(input.conditions)}::jsonb,
      ${input.lookbackDays}, ${JSON.stringify(input.action)}::jsonb, ${input.mode}
    -- Il cliente deve appartenere alla stessa agenzia.
    WHERE ${input.clientId}::uuid IS NULL
      OR EXISTS (SELECT 1 FROM clients WHERE id = ${input.clientId}::uuid AND agency_id = ${agencyId})
    RETURNING id`;
  if (!row) throw new Error("Cliente non valido");
  return row.id;
}

/** Metriche per campagna sulla finestra [oggi - giorni + 1, oggi] nel fuso dell'agenzia. */
export async function campaignWindows(agencyId: string, lookbackDays: number, clientId: string | null): Promise<ClientWindow[]> {
  const [agency] = await sql()`SELECT timezone FROM agencies WHERE id = ${agencyId}`;
  if (!agency) return [];
  const until = localDate(agency.timezone);
  const since = addDays(until, -(lookbackDays - 1));
  const rows = await sql()`
    SELECT c.id, c.name, c.status, c.budget_type, c.budget_micros::float8 AS budget_micros,
      cl.id AS client_id, cl.name AS client_name,
      COALESCE(sum(m.impressions), 0)::float8 AS impressions,
      COALESCE(sum(m.clicks), 0)::float8 AS clicks,
      COALESCE(sum(m.spend_micros), 0)::float8 AS spend,
      COALESCE(sum(m.conversions), 0)::float8 AS conversions
    FROM campaigns c
    JOIN ad_accounts a ON a.id = c.ad_account_id
    JOIN clients cl ON cl.id = a.client_id
    LEFT JOIN daily_metrics m ON m.campaign_id = c.id AND m.date >= ${since}::date AND m.date <= ${until}::date
    WHERE c.agency_id = ${agencyId} AND (${clientId}::uuid IS NULL OR cl.id = ${clientId}::uuid)
    GROUP BY c.id, cl.id
    ORDER BY cl.name, c.name`;
  return rows.map((r) => ({
    campaignId: r.id,
    name: r.name,
    status: r.status,
    budgetType: r.budget_type,
    budgetMicros: r.budget_micros,
    impressions: r.impressions,
    clicks: r.clicks,
    spendMicros: r.spend,
    conversions: r.conversions,
    clientId: r.client_id,
    clientName: r.client_name,
  }));
}

export type PreviewMatch = Match & { campaign: ClientWindow };

/** Anteprima: quali campagne verrebbero toccate oggi, senza salvare né modificare nulla. */
export async function previewRule(agencyId: string, input: RuleInput): Promise<PreviewMatch[]> {
  const windows = await campaignWindows(agencyId, input.lookbackDays, input.clientId);
  return evaluateRule(windows, input.conditions, input.action, input.lookbackDays) as PreviewMatch[];
}

export interface RunSummary {
  ruleId: string;
  matched: number;
  suggested: number;
  applied: number;
  failed: number;
}

/**
 * Esegue le regole attive dell'agenzia. Con clientId solo quelle che riguardano quel cliente
 * (così il sync di un account non rilancia le regole di tutti).
 */
export async function runRules(agencyId: string, clientId: string | null = null): Promise<RunSummary[]> {
  const db = sql();
  const rules = (await listRules(agencyId)).filter(
    (r) => r.enabled && (clientId === null || r.clientId === null || r.clientId === clientId),
  );
  const out: RunSummary[] = [];
  for (const rule of rules) {
    const scope = rule.clientId ?? clientId;
    const windows = await campaignWindows(agencyId, rule.lookbackDays, scope);
    const found = evaluateRule(windows, rule.conditions, rule.action, rule.lookbackDays) as PreviewMatch[];
    const summary: RunSummary = { ruleId: rule.id, matched: found.length, suggested: 0, applied: 0, failed: 0 };
    for (const m of found) {
      if (rule.mode === "auto" && rule.action.type !== "alert") {
        const res = await applyCampaignAction({
          agencyId,
          campaignId: m.campaign.campaignId,
          action: rule.action,
          source: "rule",
          ruleId: rule.id,
        });
        await db`
          INSERT INTO suggestions (agency_id, client_id, rule_id, campaign_id, action, reason, status, error, decided_at)
          VALUES (${agencyId}, ${m.campaign.clientId}, ${rule.id}, ${m.campaign.campaignId}, ${JSON.stringify(rule.action)}::jsonb,
            ${m.reason}, ${res.ok ? "applied" : "failed"}, ${res.ok ? null : res.error}, now())`;
        if (res.ok) summary.applied++;
        else summary.failed++;
      } else {
        const inserted = await db`
          INSERT INTO suggestions (agency_id, client_id, rule_id, campaign_id, action, reason)
          VALUES (${agencyId}, ${m.campaign.clientId}, ${rule.id}, ${m.campaign.campaignId},
            ${JSON.stringify(rule.action)}::jsonb, ${m.reason})
          ON CONFLICT (rule_id, campaign_id) WHERE status = 'pending' DO NOTHING
          RETURNING id`;
        summary.suggested += inserted.length;
      }
    }
    await db`UPDATE rules SET last_run_at = now() WHERE id = ${rule.id}`;
    out.push(summary);
  }
  return out;
}

export interface Suggestion {
  id: string;
  clientId: string;
  clientName: string;
  campaignName: string;
  ruleName: string | null;
  action: Action;
  reason: string;
  status: string;
  error: string | null;
  createdAt: Date;
}

export async function listSuggestions(agencyId: string, status: "pending" | "closed", clientId: string | null = null): Promise<Suggestion[]> {
  const rows = await sql()`
    SELECT s.id, s.client_id, cl.name AS client_name, c.name AS campaign_name, r.name AS rule_name,
      s.action, s.reason, s.status, s.error, s.created_at
    FROM suggestions s
    JOIN clients cl ON cl.id = s.client_id
    JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN rules r ON r.id = s.rule_id
    WHERE s.agency_id = ${agencyId}
      AND (${status} = 'pending') = (s.status = 'pending')
      AND (${clientId}::uuid IS NULL OR s.client_id = ${clientId}::uuid)
    ORDER BY s.created_at DESC
    LIMIT 200`;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    campaignName: r.campaign_name,
    ruleName: r.rule_name,
    action: actionSchema.parse(r.action),
    reason: r.reason,
    status: r.status,
    error: r.error,
    createdAt: new Date(r.created_at),
  }));
}

/** Approva o scarta un suggerimento. Approvare un "solo avviso" equivale a segnarlo come letto. */
export async function decideSuggestion(
  agencyId: string,
  userId: string,
  suggestionId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const db = sql();
  // Il passaggio da pending blocca il suggerimento: due clic ravvicinati non applicano due volte.
  const [s] = await db`
    UPDATE suggestions SET status = 'dismissed', decided_by = ${userId}, decided_at = now()
    WHERE id = ${suggestionId} AND agency_id = ${agencyId} AND status = 'pending'
    RETURNING campaign_id, rule_id, action`;
  if (!s) return { ok: false, error: "Suggerimento già gestito." };
  if (!approve) return { ok: true };
  const action = actionSchema.parse(s.action);
  const res = await applyCampaignAction({ agencyId, campaignId: s.campaign_id, action, source: "user", userId, ruleId: s.rule_id });
  await db`
    UPDATE suggestions SET status = ${res.ok ? "applied" : "failed"}, error = ${res.ok ? null : res.error}
    WHERE id = ${suggestionId}`;
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
