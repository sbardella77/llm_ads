import type { AdsApi, DateRange } from "./client";
import type { AdAccount, AuditLog, Campaign, InsightRow } from "./schemas";

// Dati finti con la stessa forma delle risposte reali, deterministici per chiave:
// lo stesso cliente mostra sempre gli stessi numeri.

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function rand(seed: string): number {
  return hash(seed) / 0xffffffff;
}

function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = new Date(`${range.since}T00:00:00Z`); d <= new Date(`${range.until}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const CAMPAIGN_NAMES = ["Prospecting", "Retargeting", "Brand", "Promo stagionale"];

export class MockAdsApi implements AdsApi {
  private readonly seed: string;

  constructor(apiKey: string) {
    this.seed = apiKey;
  }

  async getAdAccount(): Promise<AdAccount> {
    const n = hash(this.seed) % 10000;
    return {
      id: `adacct_mock_${n}`,
      name: `Cliente demo ${n}`,
      status: "active",
      timezone: "Europe/Rome",
      currency_code: "EUR",
      review: { status: "approved" },
    };
  }

  async listCampaigns(): Promise<Campaign[]> {
    const count = 2 + (hash(this.seed) % 3);
    return CAMPAIGN_NAMES.slice(0, count).map((name, i) => ({
      id: `cmpn_mock_${hash(this.seed + i) % 100000}`,
      name,
      status: i === count - 1 && count > 2 ? "paused" : "active",
      budget: { daily_spend_limit_micros: (20 + Math.round(rand(`${this.seed}b${i}`) * 80)) * 1_000_000 },
      start_time: null,
      end_time: null,
      updated_at: 1761350400,
    }));
  }

  async getDailyCampaignInsights(range: DateRange): Promise<InsightRow[]> {
    const campaigns = await this.listCampaigns();
    return campaigns.flatMap((c) =>
      eachDay(range).map((day) => {
        const r = rand(`${c.id}${day}`);
        const impressions = c.status === "active" ? Math.round(800 + r * 4200) : 0;
        const clicks = Math.round(impressions * (0.006 + r * 0.008));
        const spend = Math.round(clicks * (0.6 + r * 0.9) * 100) / 100;
        return {
          readable_time: day,
          campaign_id: c.id,
          impressions,
          clicks,
          spend,
          conversions: Math.round(clicks * 0.04 * 100) / 100,
        };
      }),
    );
  }

  // Le scritture rispondono come l'API vera ma non cambiano i dati finti:
  // il sync successivo riporta la campagna allo stato del mock.
  private async campaign(campaignId: string): Promise<Campaign> {
    const c = (await this.listCampaigns()).find((x) => x.id === campaignId);
    if (!c) throw new Error(`Campagna ${campaignId} non trovata`);
    return c;
  }

  async pauseCampaign(campaignId: string): Promise<Campaign> {
    return { ...(await this.campaign(campaignId)), status: "paused" };
  }

  async activateCampaign(campaignId: string): Promise<Campaign> {
    return { ...(await this.campaign(campaignId)), status: "active" };
  }

  async setDailyBudget(campaignId: string, micros: number): Promise<Campaign> {
    return { ...(await this.campaign(campaignId)), budget: { daily_spend_limit_micros: micros } };
  }

  async listAuditLogs(sinceUnix: number): Promise<AuditLog[]> {
    const [first] = await this.listCampaigns();
    const ts = sinceUnix + 86_400 * (1 + (hash(this.seed) % 5));
    return [
      {
        id: `audlog_mock_${hash(this.seed) % 100000}`,
        audit_log_type: "update_campaign",
        obj_type: "campaign",
        obj_id: first.id,
        item_name: first.name,
        actor_type: "user",
        actor_id: null,
        campaign_id: first.id,
        changes: { budget: { daily_spend_limit_micros: first.budget?.daily_spend_limit_micros } },
        ts,
      },
    ];
  }
}
