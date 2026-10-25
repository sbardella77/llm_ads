import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Postgres in memoria al posto di Neon: verifica lo schema e le query reali del sync.
const pg = new PGlite();

vi.mock("../src/lib/db", () => ({
  sql: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.ADS_API_MODE = "mock";

const { encryptSecret } = await import("../src/lib/crypto");
const { syncAll } = await import("../src/lib/sync");
const { clientOverview } = await import("../src/lib/dashboard");

let agencyId: string;
let clientId: string;

beforeAll(async () => {
  await pg.exec(readFileSync("db/migrations/001_init.sql", "utf8"));
  const { rows: [agency] } = await pg.query<{ id: string }>("INSERT INTO agencies (name) VALUES ('Test') RETURNING id");
  agencyId = agency.id;
  // Budget basso: il cliente supera sicuramente le soglie dell'80% e del 95%.
  const { rows: [client] } = await pg.query<{ id: string }>(
    "INSERT INTO clients (agency_id, name, monthly_budget_micros) VALUES ($1, 'Cliente', 1000000) RETURNING id",
    [agencyId],
  );
  clientId = client.id;
  const enc = encryptSecret("mock_test", process.env.ENCRYPTION_KEY!);
  await pg.query(
    `INSERT INTO ad_accounts (agency_id, client_id, openai_account_id, name, currency_code, timezone,
       api_key_ciphertext, api_key_iv, api_key_tag, api_key_last4)
     VALUES ($1, $2, 'pending', 'Cliente', 'EUR', 'Europe/Rome', $3, $4, $5, 'test')`,
    [agencyId, clientId, enc.ciphertext, enc.iv, enc.tag],
  );
});

describe("syncAll", () => {
  it("salva campagne e metriche e registra gli avvisi una sola volta", async () => {
    const [first] = await syncAll();
    expect(first.error).toBeUndefined();
    expect(first.ok).toBe(true);
    expect(first.rows).toBeGreaterThan(0);

    // Un secondo sync aggiorna le stesse righe senza duplicarle.
    await syncAll();

    const metrics = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM daily_metrics");
    expect(metrics.rows[0].n).toBe(first.rows);

    const alerts = await pg.query<{ threshold: number }>("SELECT threshold FROM alerts WHERE client_id = $1 ORDER BY threshold", [clientId]);
    expect(alerts.rows.map((a) => a.threshold)).toEqual([80, 95]);

    const runs = await pg.query<{ status: string }>("SELECT status FROM sync_runs");
    expect(runs.rows.every((r) => r.status === "ok")).toBe(true);
  });

  it("alimenta la dashboard multi-cliente", async () => {
    const [row] = await clientOverview(agencyId);
    expect(row.name).toBe("Cliente");
    expect(row.reviewStatus).toBe("approved");
    expect(row.budget.spentPct).toBeGreaterThan(95);
    expect(row.clicks).toBeGreaterThan(0);
  });
});
