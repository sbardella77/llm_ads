import { z } from "zod";

// Forme delle risposte documentate su https://developers.openai.com/ads/api-reference
// I campi non usati dalla piattaforma restano fuori: zod li ignora.

export const adAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  account_name: z.string().optional(),
  brand_name: z.string().optional(),
  status: z.string().optional(),
  timezone: z.string(),
  currency_code: z.string().length(3),
  review: z.object({ status: z.string() }).optional(),
});
export type AdAccount = z.infer<typeof adAccountSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  budget: z
    .object({
      daily_spend_limit_micros: z.number().int().optional(),
      lifetime_spend_limit_micros: z.number().int().optional(),
    })
    .optional(),
  start_time: z.number().int().nullish(),
  end_time: z.number().int().nullish(),
  updated_at: z.number().int(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const insightRowSchema = z.object({
  readable_time: z.string(), // YYYY-MM-DD con granularità giornaliera
  campaign_id: z.string(),
  impressions: z.number().default(0),
  clicks: z.number().default(0),
  spend: z.number().nullish(), // unità intere, null = non ancora disponibile
  conversions: z.number().nullish(),
});
export type InsightRow = z.infer<typeof insightRowSchema>;

export function listSchema<T extends z.ZodType>(item: T) {
  return z.object({
    object: z.literal("list"),
    data: z.array(item),
    first_id: z.string().nullish(),
    last_id: z.string().nullish(),
    has_more: z.boolean(),
  });
}
