import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  // 32 byte in base64: openssl rand -base64 32
  ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16).optional(),
  // "mock" usa dati finti al posto dell'API OpenAI Ads.
  ADS_API_MODE: z.enum(["live", "mock"]).default("mock"),
  OPENAI_ADS_BASE_URL: z.string().url().default("https://api.ads.openai.com/v1"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}
