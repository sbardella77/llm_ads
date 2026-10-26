import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const pg = new PGlite();

vi.mock("../src/lib/db", () => ({
  sql: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
// "live": le chiavi vere passano dal client HTTP, quelle "mock_" dai dati finti.
process.env.ADS_API_MODE = "live";

const { connectAdAccount } = await import("../src/lib/connect");

let agencyId: string;

beforeAll(async () => {
  for (const f of readdirSync("db/migrations").sort()) await pg.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  const { rows: [agency] } = await pg.query<{ id: string }>("INSERT INTO agencies (name) VALUES ('A') RETURNING id");
  agencyId = agency.id;
});

afterEach(() => vi.unstubAllGlobals());

describe("connectAdAccount", () => {
  it("collega l'account, salva la chiave cifrata e fa il primo sync", async () => {
    const result = await connectAdAccount({ agencyId, clientName: "Bar Sport", monthlyBudgetEur: 800, apiKey: " mock_bar_sport " });
    expect(result).toMatchObject({ ok: true, reviewStatus: "approved" });

    const { rows: [acct] } = await pg.query<{ api_key_ciphertext: Uint8Array; api_key_last4: string; last_synced_at: Date | null }>(
      "SELECT api_key_ciphertext, api_key_last4, last_synced_at FROM ad_accounts",
    );
    expect(Buffer.from(acct.api_key_ciphertext).toString("utf8")).not.toContain("mock_bar_sport");
    expect(acct.api_key_last4).toBe("port");
    expect(acct.last_synced_at).not.toBeNull();

    const { rows: [metrics] } = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM daily_metrics");
    expect(metrics.n).toBeGreaterThan(0);
  });

  it("rifiuta lo stesso account collegato due volte", async () => {
    const again = await connectAdAccount({ agencyId, clientName: "Bar Sport 2", monthlyBudgetEur: 800, apiKey: "mock_bar_sport" });
    expect(again).toMatchObject({ ok: false });
    if (!again.ok) expect(again.error).toContain("già collegato");
  });

  it("spiega una chiave non valida senza salvare nulla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid key", { status: 401 })));
    const before = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM clients");
    const result = await connectAdAccount({ agencyId, clientName: "X", monthlyBudgetEur: 100, apiKey: "sk-ads-sbagliata" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("non riconosce") });
    const after = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM clients");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("valida i campi prima di chiamare OpenAI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await connectAdAccount({ agencyId, clientName: " ", monthlyBudgetEur: 1, apiKey: "sk-ads-123456" })).toMatchObject({ ok: false });
    expect(await connectAdAccount({ agencyId, clientName: "Y", monthlyBudgetEur: Number.NaN, apiKey: "sk-ads-123456" })).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
