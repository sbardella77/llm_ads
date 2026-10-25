import { env } from "../env";
import { HttpAdsApi, type AdsApi } from "./client";
import { MockAdsApi } from "./mock";

export * from "./client";
export * from "./schemas";

/** Le chiavi che iniziano con "mock_" usano sempre i dati finti, utile per demo e test. */
export function adsApiFor(apiKey: string): AdsApi {
  const { ADS_API_MODE, OPENAI_ADS_BASE_URL } = env();
  if (ADS_API_MODE === "mock" || apiKey.startsWith("mock_")) return new MockAdsApi(apiKey);
  return new HttpAdsApi(apiKey, OPENAI_ADS_BASE_URL);
}
