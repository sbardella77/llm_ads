import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAdsApi } from "../src/lib/openai-ads/client";
import { MockAdsApi } from "../src/lib/openai-ads/mock";

afterEach(() => vi.unstubAllGlobals());

describe("HttpAdsApi", () => {
  it("segue la paginazione e invia la chiave come Bearer", async () => {
    const pages = [
      { object: "list", data: [{ id: "cmpn_1", name: "A", status: "active", updated_at: 1 }], last_id: "cmpn_1", has_more: true },
      { object: "list", data: [{ id: "cmpn_2", name: "B", status: "paused", updated_at: 2 }], last_id: "cmpn_2", has_more: false },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(pages.shift())));
    vi.stubGlobal("fetch", fetchMock);

    const campaigns = await new HttpAdsApi("key_x", "https://api.test/v1").listCampaigns();

    expect(campaigns.map((c) => c.id)).toEqual(["cmpn_1", "cmpn_2"]);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toContain("after=cmpn_1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key_x");
  });

  it("chiede gli insights giornalieri per campagna", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [{ readable_time: "2026-10-01", campaign_id: "cmpn_1", impressions: 10, clicks: 1, spend: 0.5 }],
            has_more: false,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await new HttpAdsApi("k", "https://api.test/v1").getDailyCampaignInsights({ since: "2026-10-01", until: "2026-10-01" });

    expect(rows[0]).toMatchObject({ campaign_id: "cmpn_1", spend: 0.5 });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1/ad_account/insights");
    expect(url.searchParams.get("aggregation_level")).toBe("campaign");
    expect(JSON.parse(url.searchParams.get("time_ranges[]")!)).toEqual({ type: "date_range", since: "2026-10-01", until: "2026-10-01" });
  });

  it("solleva un errore leggibile sui 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    await expect(new HttpAdsApi("k", "https://api.test/v1").getAdAccount()).rejects.toThrow("403");
  });
});

describe("MockAdsApi", () => {
  it("è deterministico e produce una riga per campagna e giorno", async () => {
    const api = new MockAdsApi("mock_a");
    const range = { since: "2026-10-01", until: "2026-10-03" };
    const a = await api.getDailyCampaignInsights(range);
    const b = await new MockAdsApi("mock_a").getDailyCampaignInsights(range);
    expect(a).toEqual(b);
    expect(a.length).toBe((await api.listCampaigns()).length * 3);
  });
});
