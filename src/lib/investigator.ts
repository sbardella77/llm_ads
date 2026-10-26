import { sql } from "./db";
import { addDays, localDate } from "./budget";

// Investigatore, come Cause Chart e PPC Investigator di Optmyzr: confronta due periodi e
// spiega di quanto ciascun fattore ha spinto la variazione di una metrica.

export interface Totals {
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
}

export interface Factor {
  label: string;
  before: number;
  after: number;
  /** Parte della variazione della metrica dovuta a questo fattore; la somma dei fattori è la variazione. */
  effect: number;
}

export interface Explanation {
  metric: string;
  before: number;
  after: number;
  factors: [Factor, Factor];
}

const logMean = (a: number, b: number) => (a === b ? a : (a - b) / (Math.log(a) - Math.log(b)));

/**
 * Scompone y = x * r nella variazione dovuta a x e a r (indice di Divisia con media logaritmica):
 * i due effetti sommano esattamente a y1 - y0. Con valori a zero tutta la variazione va al volume.
 */
export function decompose(y0: number, y1: number, x0: number, x1: number): [number, number] {
  if (y0 <= 0 || y1 <= 0 || x0 <= 0 || x1 <= 0) return [y1 - y0, 0];
  const L = logMean(y1, y0);
  const xEffect = L * Math.log(x1 / x0);
  return [xEffect, y1 - y0 - xEffect];
}

const ratio = (a: number, b: number) => (b ? a / b : 0);

export function explain(before: Totals, after: Totals): Explanation[] {
  const [cImpr, cCtr] = decompose(before.clicks, after.clicks, before.impressions, after.impressions);
  const [sClicks, sCpc] = decompose(before.spendMicros, after.spendMicros, before.clicks, after.clicks);
  const [vClicks, vRate] = decompose(before.conversions, after.conversions, before.clicks, after.clicks);
  return [
    {
      metric: "Clic",
      before: before.clicks,
      after: after.clicks,
      factors: [
        { label: "Impression", before: before.impressions, after: after.impressions, effect: cImpr },
        { label: "CTR", before: ratio(before.clicks, before.impressions), after: ratio(after.clicks, after.impressions), effect: cCtr },
      ],
    },
    {
      metric: "Spesa",
      before: before.spendMicros,
      after: after.spendMicros,
      factors: [
        { label: "Clic", before: before.clicks, after: after.clicks, effect: sClicks },
        { label: "CPC", before: ratio(before.spendMicros, before.clicks), after: ratio(after.spendMicros, after.clicks), effect: sCpc },
      ],
    },
    {
      metric: "Conversioni",
      before: before.conversions,
      after: after.conversions,
      factors: [
        { label: "Clic", before: before.clicks, after: after.clicks, effect: vClicks },
        { label: "Tasso di conversione", before: ratio(before.conversions, before.clicks), after: ratio(after.conversions, after.clicks), effect: vRate },
      ],
    },
  ];
}

export interface CampaignDelta {
  campaignId: string;
  name: string;
  status: string;
  before: Totals;
  after: Totals;
}

export interface Investigation {
  days: number;
  current: { since: string; until: string };
  previous: { since: string; until: string };
  before: Totals;
  after: Totals;
  explanations: Explanation[];
  campaigns: CampaignDelta[];
}

const empty = (): Totals => ({ impressions: 0, clicks: 0, spendMicros: 0, conversions: 0 });

function add(t: Totals, r: Totals): void {
  t.impressions += r.impressions;
  t.clicks += r.clicks;
  t.spendMicros += r.spendMicros;
  t.conversions += r.conversions;
}

/** Ultimi `days` giorni completi (fino a ieri: i dati di oggi sono parziali) contro i `days` precedenti. */
export async function investigateClient(agencyId: string, clientId: string, days: number): Promise<Investigation | null> {
  const db = sql();
  const [agency] = await db`SELECT timezone FROM agencies WHERE id = ${agencyId}`;
  if (!agency) return null;
  const until = addDays(localDate(agency.timezone), -1);
  const since = addDays(until, -(days - 1));
  const prevUntil = addDays(since, -1);
  const prevSince = addDays(prevUntil, -(days - 1));

  const rows = await db`
    SELECT c.id, c.name, c.status, (m.date >= ${since}::date) AS current,
      COALESCE(sum(m.impressions), 0)::float8 AS impressions,
      COALESCE(sum(m.clicks), 0)::float8 AS clicks,
      COALESCE(sum(m.spend_micros), 0)::float8 AS spend,
      COALESCE(sum(m.conversions), 0)::float8 AS conversions
    FROM campaigns c
    JOIN ad_accounts a ON a.id = c.ad_account_id
    JOIN daily_metrics m ON m.campaign_id = c.id AND m.date >= ${prevSince}::date AND m.date <= ${until}::date
    WHERE c.agency_id = ${agencyId} AND a.client_id = ${clientId}
    GROUP BY c.id, current`;

  const byCampaign = new Map<string, CampaignDelta>();
  const before = empty();
  const after = empty();
  for (const r of rows) {
    const d = byCampaign.get(r.id) ?? { campaignId: r.id, name: r.name, status: r.status, before: empty(), after: empty() };
    const t = { impressions: r.impressions, clicks: r.clicks, spendMicros: r.spend, conversions: r.conversions };
    add(r.current ? d.after : d.before, t);
    add(r.current ? after : before, t);
    byCampaign.set(r.id, d);
  }
  const campaigns = [...byCampaign.values()].sort(
    (a, b) => Math.abs(b.after.spendMicros - b.before.spendMicros) - Math.abs(a.after.spendMicros - a.before.spendMicros),
  );
  return {
    days,
    current: { since, until },
    previous: { since: prevSince, until: prevUntil },
    before,
    after,
    explanations: explain(before, after),
    campaigns,
  };
}
