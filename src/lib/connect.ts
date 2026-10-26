import { sql } from "./db";
import { env } from "./env";
import { encryptSecret } from "./crypto";
import { AdsApiError, adsApiFor } from "./openai-ads";
import { syncAdAccount, type AdAccountRow } from "./sync";

export interface ConnectInput {
  agencyId: string;
  clientName: string;
  monthlyBudgetEur: number;
  apiKey: string;
}

export type ConnectResult =
  | { ok: true; clientId: string; accountName: string; reviewStatus: string | null; syncError?: string }
  | { ok: false; error: string };

function explain(e: unknown): string {
  if (e instanceof AdsApiError) {
    if (e.status === 401) return "OpenAI non riconosce questa chiave. Controlla di averla copiata per intero.";
    if (e.status === 403) return "La chiave è valida ma non ha accesso all'account. Chiedi al referente OpenAI di abilitarlo.";
    return `OpenAI ha risposto con un errore (${e.status}). Riprova tra qualche minuto.`;
  }
  return "Non riesco a contattare OpenAI. Riprova tra qualche minuto.";
}

/**
 * Verifica la chiave con GET /ad_account, crea il cliente e l'account con la chiave cifrata
 * e lancia subito il primo sync. La chiave in chiaro non viene mai salvata.
 */
export async function connectAdAccount(input: ConnectInput): Promise<ConnectResult> {
  const apiKey = input.apiKey.trim();
  if (!input.clientName.trim()) return { ok: false, error: "Inserisci il nome del cliente." };
  if (!Number.isFinite(input.monthlyBudgetEur) || input.monthlyBudgetEur < 0) {
    return { ok: false, error: "Il budget mensile deve essere un numero positivo." };
  }
  if (apiKey.length < 8) return { ok: false, error: "Incolla la chiave API creata in Ads Manager." };

  let info;
  try {
    info = await adsApiFor(apiKey).getAdAccount();
  } catch (e) {
    return { ok: false, error: explain(e) };
  }

  const db = sql();
  const [existing] = await db`
    SELECT 1 FROM ad_accounts WHERE agency_id = ${input.agencyId} AND openai_account_id = ${info.id}`;
  if (existing) return { ok: false, error: `L'account "${info.account_name ?? info.name}" è già collegato.` };

  const enc = encryptSecret(apiKey, env().ENCRYPTION_KEY);
  const [client] = await db`
    INSERT INTO clients (agency_id, name, monthly_budget_micros)
    VALUES (${input.agencyId}, ${input.clientName.trim()}, ${Math.round(input.monthlyBudgetEur * 1_000_000)})
    RETURNING id`;
  const [account] = await db`
    INSERT INTO ad_accounts (agency_id, client_id, openai_account_id, name, currency_code, timezone, status,
      review_status, api_key_ciphertext, api_key_iv, api_key_tag, api_key_last4)
    VALUES (${input.agencyId}, ${client.id}, ${info.id}, ${info.account_name ?? info.name}, ${info.currency_code},
      ${info.timezone}, ${info.status ?? null}, ${info.review?.status ?? null}, ${enc.ciphertext}, ${enc.iv}, ${enc.tag},
      ${apiKey.slice(-4)})
    RETURNING id, agency_id, client_id, timezone, api_key_ciphertext, api_key_iv, api_key_tag`;

  const sync = await syncAdAccount(account as AdAccountRow);
  return {
    ok: true,
    clientId: client.id,
    accountName: info.account_name ?? info.name,
    reviewStatus: info.review?.status ?? null,
    syncError: sync.ok ? undefined : sync.error,
  };
}
