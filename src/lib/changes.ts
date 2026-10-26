import { sql } from "./db";
import { env } from "./env";
import { decryptSecret } from "./crypto";
import { formatMoney } from "./money";
import { AdsApiError, adsApiFor, type AdsApi, type AuditLog } from "./openai-ads";
import { newBudgetMicros } from "./rules/engine";
import type { Action } from "./rules/types";

export interface ApplyInput {
  agencyId: string;
  campaignId: string;
  action: Action;
  source: "user" | "rule";
  userId?: string | null;
  ruleId?: string | null;
}

export type ApplyResult = { ok: true; summary: string } | { ok: false; error: string };

function explain(e: unknown): string {
  if (e instanceof AdsApiError) return `OpenAI ha rifiutato la modifica (${e.status}): ${e.body.slice(0, 160)}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Unico punto da cui la piattaforma modifica una campagna su OpenAI: applica l'azione,
 * aggiorna la copia locale e scrive lo storico. L'agencyId impedisce di toccare campagne di altre agenzie.
 */
export async function applyCampaignAction(input: ApplyInput): Promise<ApplyResult> {
  const db = sql();
  const [c] = await db`
    SELECT c.id, c.openai_campaign_id, c.name, c.status, c.budget_type, c.budget_micros::float8 AS budget_micros,
      a.client_id, a.currency_code, a.api_key_ciphertext, a.api_key_iv, a.api_key_tag
    FROM campaigns c JOIN ad_accounts a ON a.id = c.ad_account_id
    WHERE c.id = ${input.campaignId} AND c.agency_id = ${input.agencyId}`;
  if (!c) return { ok: false, error: "Campagna non trovata." };
  const action = input.action;
  if (action.type === "alert") return { ok: true, summary: "Nessuna modifica: la regola invia solo un avviso." };

  const api = adsApiFor(
    decryptSecret({ ciphertext: c.api_key_ciphertext, iv: c.api_key_iv, tag: c.api_key_tag }, env().ENCRYPTION_KEY),
  );
  let summary: string;
  let details: Record<string, unknown>;
  try {
    if (action.type === "pause") {
      await api.pauseCampaign(c.openai_campaign_id);
      await db`UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = ${c.id}`;
      summary = `"${c.name}" messa in pausa`;
      details = { status: { from: c.status, to: "paused" } };
    } else if (action.type === "activate") {
      await api.activateCampaign(c.openai_campaign_id);
      await db`UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = ${c.id}`;
      summary = `"${c.name}" riattivata`;
      details = { status: { from: c.status, to: "active" } };
    } else {
      if (c.budget_type !== "daily" || !c.budget_micros) {
        return { ok: false, error: "La campagna non ha un budget giornaliero da modificare." };
      }
      const next = newBudgetMicros(c.budget_micros, action.pct);
      await api.setDailyBudget(c.openai_campaign_id, next);
      await db`UPDATE campaigns SET budget_micros = ${next}, updated_at = now() WHERE id = ${c.id}`;
      const cur = c.currency_code.trim();
      summary = `Budget giornaliero di "${c.name}" da ${formatMoney(c.budget_micros, cur)} a ${formatMoney(next, cur)}`;
      details = { budget_micros: { from: c.budget_micros, to: next } };
    }
  } catch (e) {
    return { ok: false, error: explain(e) };
  }

  await db`
    INSERT INTO change_log (agency_id, client_id, campaign_id, source, user_id, rule_id, summary, details)
    VALUES (${input.agencyId}, ${c.client_id}, ${c.id}, ${input.source}, ${input.userId ?? null},
      ${input.ruleId ?? null}, ${summary}, ${JSON.stringify(details)}::jsonb)`;
  return { ok: true, summary };
}

const AUDIT_LABELS: Record<string, string> = {
  create_campaign: "Campagna creata",
  update_campaign: "Campagna modificata",
  create_ad_group: "Gruppo di annunci creato",
  update_ad_group: "Gruppo di annunci modificato",
  create_ad: "Annuncio creato",
  update_ad: "Annuncio modificato",
};

export function auditSummary(log: AuditLog): string {
  const label = AUDIT_LABELS[log.audit_log_type] ?? log.audit_log_type.replaceAll("_", " ");
  return log.item_name ? `${label}: "${log.item_name}"` : label;
}

/** Importa nello storico le modifiche fatte direttamente su OpenAI (Ads Manager o altri strumenti). */
export async function importAuditLogs(
  api: AdsApi,
  account: { id: string; agency_id: string; client_id: string },
  sinceUnix: number,
): Promise<number> {
  const logs = await api.listAuditLogs(sinceUnix);
  if (!logs.length) return 0;
  const db = sql();
  const rows = await db`
    INSERT INTO change_log (agency_id, client_id, campaign_id, source, external_id, summary, details, created_at)
    SELECT ${account.agency_id}, ${account.client_id}, c.id, 'openai', l.external_id, l.summary, l.details, l.created_at
    FROM unnest(
      ${logs.map((l) => l.id)}::text[],
      ${logs.map((l) => l.campaign_id ?? null)}::text[],
      ${logs.map(auditSummary)}::text[],
      ${logs.map((l) => JSON.stringify({ type: l.audit_log_type, actor: l.actor_type, changes: l.changes ?? null }))}::jsonb[],
      ${logs.map((l) => new Date((l.ts ?? sinceUnix) * 1000).toISOString())}::timestamptz[]
    ) AS l(external_id, openai_campaign_id, summary, details, created_at)
    LEFT JOIN campaigns c ON c.ad_account_id = ${account.id} AND c.openai_campaign_id = l.openai_campaign_id
    ON CONFLICT (external_id) DO NOTHING
    RETURNING id`;
  return rows.length;
}
