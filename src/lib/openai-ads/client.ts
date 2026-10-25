import { z } from "zod";
import {
  adAccountSchema,
  campaignSchema,
  insightRowSchema,
  listSchema,
  type AdAccount,
  type Campaign,
  type InsightRow,
} from "./schemas";

export interface DateRange {
  since: string; // YYYY-MM-DD incluso
  until: string; // YYYY-MM-DD incluso
}

/** Unico punto di contatto con OpenAI Ads: se l'API cambia, si modifica solo qui. */
export interface AdsApi {
  getAdAccount(): Promise<AdAccount>;
  listCampaigns(): Promise<Campaign[]>;
  getDailyCampaignInsights(range: DateRange): Promise<InsightRow[]>;
}

export class AdsApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OpenAI Ads API ${status}: ${body.slice(0, 200)}`);
  }
}

const INSIGHT_FIELDS = [
  "metadata.readable_time",
  "campaign.id",
  "campaign.impressions",
  "campaign.clicks",
  "campaign.spend",
  "campaign.conversions",
];

export class HttpAdsApi implements AdsApi {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private async get<T>(path: string, params: URLSearchParams, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}?${params}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new AdsApiError(res.status, await res.text());
    return schema.parse(await res.json());
  }

  private async getAll<T extends z.ZodType>(
    path: string,
    params: URLSearchParams,
    item: T,
  ): Promise<z.infer<T>[]> {
    const page = listSchema(item);
    const rows: z.infer<T>[] = [];
    let after: string | null | undefined;
    do {
      const p = new URLSearchParams(params);
      if (after) p.set("after", after);
      const res = await this.get(path, p, page);
      rows.push(...res.data);
      after = res.has_more ? res.last_id : undefined;
    } while (after);
    return rows;
  }

  getAdAccount(): Promise<AdAccount> {
    return this.get("/ad_account", new URLSearchParams(), adAccountSchema);
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.getAll("/campaigns", new URLSearchParams({ limit: "500" }), campaignSchema);
  }

  getDailyCampaignInsights(range: DateRange): Promise<InsightRow[]> {
    const params = new URLSearchParams({
      time_granularity: "daily",
      aggregation_level: "campaign",
      limit: "2000",
    });
    for (const f of INSIGHT_FIELDS) params.append("fields[]", f);
    params.append("time_ranges[]", JSON.stringify({ type: "date_range", ...range }));
    return this.getAll("/ad_account/insights", params, insightRowSchema);
  }
}
