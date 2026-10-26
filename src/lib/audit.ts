import { sql } from "./db";
import { addDays, budgetStatus, localDate, monthStart } from "./budget";

// Controlli di salute dell'account, come l'audit di Optmyzr: un voto e un elenco di cose da sistemare.

export type Severity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface AuditCampaign {
  name: string;
  status: string;
  budgetMicros: number | null;
  endTime: Date | null;
  impressions7d: number;
  spend14dMicros: number;
  conversions14d: number;
}

export interface AuditInput {
  today: string; // YYYY-MM-DD nel fuso dell'agenzia
  now: Date;
  accounts: { name: string; reviewStatus: string | null; lastSyncedAt: Date | null; lastSyncError: string | null }[];
  campaigns: AuditCampaign[];
  monthSpendMicros: number;
  monthlyBudgetMicros: number;
  impressions30d: number;
  clicks30d: number;
  conversions30d: number;
}

export interface AuditResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: Finding[];
}

const PENALTY: Record<Severity, number> = { critical: 25, warning: 10, info: 3 };
const SYNC_STALE_HOURS = 48;

const names = (list: { name: string }[]) =>
  list.slice(0, 3).map((c) => `"${c.name}"`).join(", ") + (list.length > 3 ? ` e altre ${list.length - 3}` : "");

export function runAudit(input: AuditInput): AuditResult {
  const f: Finding[] = [];
  const active = input.campaigns.filter((c) => c.status === "active");

  if (!input.accounts.length) {
    f.push({ id: "no-account", severity: "critical", title: "Nessun account collegato", detail: "Collega l'account OpenAI Ads del cliente per iniziare." });
  }
  for (const a of input.accounts) {
    if (a.reviewStatus && a.reviewStatus !== "approved") {
      f.push({ id: `review-${a.name}`, severity: "critical", title: `Account "${a.name}" non approvato`, detail: `Stato revisione OpenAI: ${a.reviewStatus}. Gli annunci non vengono pubblicati finché non è approvato.` });
    }
    if (a.lastSyncError) {
      f.push({ id: `sync-error-${a.name}`, severity: "critical", title: `Sync fallito per "${a.name}"`, detail: a.lastSyncError });
    } else if (!a.lastSyncedAt || input.now.getTime() - a.lastSyncedAt.getTime() > SYNC_STALE_HOURS * 3_600_000) {
      f.push({ id: `sync-stale-${a.name}`, severity: "warning", title: `Dati di "${a.name}" non aggiornati`, detail: `Ultimo sync oltre ${SYNC_STALE_HOURS} ore fa: i numeri potrebbero essere vecchi.` });
    }
  }

  if (input.accounts.length && !active.length) {
    f.push({ id: "no-active", severity: "warning", title: "Nessuna campagna attiva", detail: "Il cliente non sta pubblicando annunci." });
  }

  const noBudget = active.filter((c) => !c.budgetMicros);
  if (noBudget.length) {
    f.push({ id: "no-budget", severity: "warning", title: "Campagne attive senza limite di spesa", detail: `${names(noBudget)}: imposta un budget giornaliero o totale.` });
  }

  const noDelivery = active.filter((c) => c.impressions7d === 0);
  if (noDelivery.length) {
    f.push({ id: "no-delivery", severity: "warning", title: "Campagne attive senza impression negli ultimi 7 giorni", detail: `${names(noDelivery)}: controlla targeting, offerte e revisione degli annunci.` });
  }

  const wasted = input.campaigns.filter((c) => c.spend14dMicros > 0 && c.conversions14d === 0);
  if (wasted.length && input.conversions30d > 0) {
    f.push({ id: "spend-no-conv", severity: "warning", title: "Spesa senza conversioni negli ultimi 14 giorni", detail: `${names(wasted)}: valuta una pausa o un taglio di budget.` });
  }

  if (input.clicks30d > 50 && input.conversions30d === 0) {
    f.push({ id: "no-tracking", severity: "warning", title: "Nessuna conversione registrata in 30 giorni", detail: "Verifica che il pixel o la Conversions API di OpenAI siano installati sul sito del cliente." });
  }

  if (input.monthlyBudgetMicros > 0) {
    const b = budgetStatus(input.monthSpendMicros, input.monthlyBudgetMicros, input.today);
    if (b.spentPct >= 100) {
      f.push({ id: "over-budget", severity: "critical", title: "Budget mensile già superato", detail: `Speso il ${b.spentPct.toFixed(0)}% del budget: valuta di mettere in pausa le campagne fino a fine mese.` });
    } else if (b.forecastPct > 110) {
      f.push({ id: "overspend", severity: "warning", title: "Rischio di sforare il budget mensile", detail: `Al ritmo attuale si arriva al ${b.forecastPct.toFixed(0)}% del budget a fine mese.` });
    } else if (b.forecastPct < 70 && Number(input.today.slice(8, 10)) >= 7) {
      f.push({ id: "underspend", severity: "info", title: "Budget mensile sottoutilizzato", detail: `Al ritmo attuale si arriva solo al ${b.forecastPct.toFixed(0)}% del budget a fine mese.` });
    }
  } else {
    f.push({ id: "no-monthly-budget", severity: "info", title: "Budget mensile del cliente non impostato", detail: "Senza budget non si possono calcolare ritmo di spesa e avvisi." });
  }

  if (input.impressions30d >= 1000 && input.clicks30d / input.impressions30d < 0.003) {
    f.push({ id: "low-ctr", severity: "info", title: "CTR medio basso", detail: `CTR a 30 giorni ${((input.clicks30d / input.impressions30d) * 100).toFixed(2).replace(".", ",")}%: prova nuovi testi o un targeting più stretto.` });
  }

  const ending = active.filter(
    (c) => c.endTime && c.endTime.getTime() > input.now.getTime() && c.endTime.getTime() - input.now.getTime() < 7 * 86_400_000,
  );
  if (ending.length) {
    f.push({ id: "ending", severity: "info", title: "Campagne in scadenza entro 7 giorni", detail: `${names(ending)}: decidi se prolungarle.` });
  }

  const order: Severity[] = ["critical", "warning", "info"];
  f.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const score = Math.max(0, 100 - f.reduce((s, x) => s + PENALTY[x.severity], 0));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade, findings: f };
}

export interface ClientAudit extends AuditResult {
  clientId: string;
  clientName: string;
}

export async function auditClients(agencyId: string, clientId: string | null = null): Promise<ClientAudit[]> {
  const db = sql();
  const [agency] = await db`SELECT timezone FROM agencies WHERE id = ${agencyId}`;
  if (!agency) return [];
  const today = localDate(agency.timezone);
  const d7 = addDays(today, -6);
  const d14 = addDays(today, -13);
  const d30 = addDays(today, -29);
  const month = monthStart(today);

  const clients = await db`
    SELECT id, name, monthly_budget_micros::float8 AS budget FROM clients
    WHERE agency_id = ${agencyId} AND (${clientId}::uuid IS NULL OR id = ${clientId}::uuid) ORDER BY name`;
  const accounts = await db`
    SELECT a.client_id, a.name, a.review_status, a.last_synced_at,
      (SELECT CASE WHEN r.status = 'error' THEN r.error END FROM sync_runs r
        WHERE r.ad_account_id = a.id ORDER BY r.started_at DESC LIMIT 1) AS last_error
    FROM ad_accounts a WHERE a.agency_id = ${agencyId}`;
  const campaigns = await db`
    SELECT a.client_id, c.name, c.status, c.budget_micros::float8 AS budget_micros, c.end_time,
      COALESCE(sum(m.impressions) FILTER (WHERE m.date >= ${d7}::date), 0)::float8 AS impressions7d,
      COALESCE(sum(m.spend_micros) FILTER (WHERE m.date >= ${d14}::date), 0)::float8 AS spend14d,
      COALESCE(sum(m.conversions) FILTER (WHERE m.date >= ${d14}::date), 0)::float8 AS conversions14d,
      COALESCE(sum(m.impressions) FILTER (WHERE m.date >= ${d30}::date), 0)::float8 AS impressions30d,
      COALESCE(sum(m.clicks) FILTER (WHERE m.date >= ${d30}::date), 0)::float8 AS clicks30d,
      COALESCE(sum(m.conversions) FILTER (WHERE m.date >= ${d30}::date), 0)::float8 AS conversions30d,
      COALESCE(sum(m.spend_micros) FILTER (WHERE m.date >= ${month}::date), 0)::float8 AS month_spend
    FROM campaigns c
    JOIN ad_accounts a ON a.id = c.ad_account_id
    LEFT JOIN daily_metrics m ON m.campaign_id = c.id AND m.date >= LEAST(${d30}::date, ${month}::date) AND m.date <= ${today}::date
    WHERE c.agency_id = ${agencyId}
    GROUP BY a.client_id, c.id`;

  const now = new Date();
  return clients.map((cl) => {
    const camps = campaigns.filter((c) => c.client_id === cl.id);
    const sum = (k: string) => camps.reduce((s, c) => s + Number(c[k]), 0);
    return {
      clientId: cl.id,
      clientName: cl.name,
      ...runAudit({
        today,
        now,
        accounts: accounts
          .filter((a) => a.client_id === cl.id)
          .map((a) => ({
            name: a.name,
            reviewStatus: a.review_status,
            lastSyncedAt: a.last_synced_at ? new Date(a.last_synced_at) : null,
            lastSyncError: a.last_error,
          })),
        campaigns: camps.map((c) => ({
          name: c.name,
          status: c.status,
          budgetMicros: c.budget_micros,
          endTime: c.end_time ? new Date(c.end_time) : null,
          impressions7d: c.impressions7d,
          spend14dMicros: c.spend14d,
          conversions14d: c.conversions14d,
        })),
        monthSpendMicros: sum("month_spend"),
        monthlyBudgetMicros: cl.budget,
        impressions30d: sum("impressions30d"),
        clicks30d: sum("clicks30d"),
        conversions30d: sum("conversions30d"),
      }),
    };
  });
}
