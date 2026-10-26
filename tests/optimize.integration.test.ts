import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Regole, suggerimenti, storico e audit sulle query reali, con Postgres in memoria.
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
const { createRule, decideSuggestion, listSuggestions, previewRule, runRules } = await import("../src/lib/rules/run");
const { auditClients } = await import("../src/lib/audit");
const { investigateClient } = await import("../src/lib/investigator");
const { clientDetail, listChanges, openItemsCount } = await import("../src/lib/client-detail");

let agencyId: string;
let userId: string;
let clientId: string;

beforeAll(async () => {
  for (const f of readdirSync("db/migrations").sort()) await pg.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  const { rows: [agency] } = await pg.query<{ id: string }>("INSERT INTO agencies (name) VALUES ('Test') RETURNING id");
  agencyId = agency.id;
  const { rows: [user] } = await pg.query<{ id: string }>(
    "INSERT INTO users (agency_id, email, name, role) VALUES ($1, 'a@test.local', 'Anna', 'admin') RETURNING id",
    [agencyId],
  );
  userId = user.id;
  const { rows: [client] } = await pg.query<{ id: string }>(
    "INSERT INTO clients (agency_id, name, monthly_budget_micros) VALUES ($1, 'Cliente', 5000000000) RETURNING id",
    [agencyId],
  );
  clientId = client.id;
  const enc = encryptSecret("mock_ottimizza", process.env.ENCRYPTION_KEY!);
  await pg.query(
    `INSERT INTO ad_accounts (agency_id, client_id, openai_account_id, name, currency_code, timezone,
       api_key_ciphertext, api_key_iv, api_key_tag, api_key_last4)
     VALUES ($1, $2, 'pending', 'Cliente', 'EUR', 'Europe/Rome', $3, $4, $5, 'test')`,
    [agencyId, clientId, enc.ciphertext, enc.iv, enc.tag],
  );
  const [res] = await syncAll();
  expect(res.ok).toBe(true);
});

const pauseRule = {
  name: "Pausa test",
  clientId: null,
  conditions: [{ metric: "spend" as const, op: ">" as const, value: 0 }],
  lookbackDays: 7,
  action: { type: "pause" as const },
  mode: "suggest" as const,
};

describe("ottimizzazione", () => {
  it("importa il registro di audit di OpenAI una sola volta", async () => {
    await syncAll();
    const changes = await listChanges(agencyId);
    expect(changes.filter((c) => c.source === "openai")).toHaveLength(1);
  });

  it("una regola da approvare crea suggerimenti senza doppioni", async () => {
    const active = await pg.query("SELECT 1 FROM campaigns WHERE status = 'active'");
    const preview = await previewRule(agencyId, pauseRule);
    expect(preview).toHaveLength(active.rows.length);

    await createRule(agencyId, pauseRule);
    const [first] = await runRules(agencyId);
    expect(first.suggested).toBe(active.rows.length);
    const [second] = await runRules(agencyId);
    expect(second.suggested).toBe(0);
    expect(await openItemsCount(agencyId)).toBe(active.rows.length);
  });

  it("approvare applica la modifica e la scrive nello storico, una volta sola", async () => {
    const [s] = await listSuggestions(agencyId, "pending");
    expect(await decideSuggestion(agencyId, userId, s.id, true)).toEqual({ ok: true });
    expect(await decideSuggestion(agencyId, userId, s.id, true)).toEqual({ ok: false, error: "Suggerimento già gestito." });

    const { rows: [c] } = await pg.query<{ status: string }>(
      "SELECT c.status FROM suggestions s JOIN campaigns c ON c.id = s.campaign_id WHERE s.id = $1",
      [s.id],
    );
    expect(c.status).toBe("paused");
    const [log] = await listChanges(agencyId);
    expect(log).toMatchObject({ source: "user", who: "Anna" });
    expect(log.summary).toContain("messa in pausa");
  });

  it("un'altra agenzia non può decidere i suggerimenti", async () => {
    const [s] = await listSuggestions(agencyId, "pending");
    const other = "00000000-0000-0000-0000-000000000000";
    expect((await decideSuggestion(other, userId, s.id, true)).ok).toBe(false);
  });

  it("una regola automatica cambia subito il budget", async () => {
    await pg.query("UPDATE rules SET enabled = false");
    await createRule(agencyId, {
      ...pauseRule,
      name: "Budget +10%",
      clientId,
      action: { type: "budget", pct: 10 },
      mode: "auto",
    });
    const before = await pg.query<{ id: string; budget: number }>(
      "SELECT id, budget_micros::float8 AS budget FROM campaigns WHERE status = 'active' AND budget_type = 'daily'",
    );
    const [run] = await runRules(agencyId, clientId);
    expect(run.applied).toBe(before.rows.length);
    for (const b of before.rows) {
      const { rows: [after] } = await pg.query<{ budget: number }>("SELECT budget_micros::float8 AS budget FROM campaigns WHERE id = $1", [b.id]);
      expect(after.budget).toBeCloseTo(b.budget * 1.1, -4);
    }
    const changes = await listChanges(agencyId, clientId);
    expect(changes.filter((c) => c.source === "rule")).toHaveLength(before.rows.length);
  });

  it("audit, investigatore e pagina cliente leggono i dati sincronizzati", async () => {
    const [audit] = await auditClients(agencyId);
    expect(audit.clientName).toBe("Cliente");
    expect(audit.score).toBeGreaterThanOrEqual(0);

    const inv = await investigateClient(agencyId, clientId, 7);
    expect(inv!.after.clicks).toBeGreaterThan(0);
    const [clicks] = inv!.explanations;
    expect(clicks.factors[0].effect + clicks.factors[1].effect).toBeCloseTo(clicks.after - clicks.before);

    const detail = await clientDetail(agencyId, clientId);
    expect(detail!.campaigns.length).toBeGreaterThan(0);
    expect(detail!.pacing.daysLeft).toBeGreaterThan(0);
    expect(await clientDetail("00000000-0000-0000-0000-000000000000", clientId)).toBeNull();
  });
});
