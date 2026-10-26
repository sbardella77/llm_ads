import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

const pg = new PGlite();

vi.mock("../src/lib/db", () => ({
  sql: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";

const { hashPassword, verifyPassword } = await import("../src/lib/auth/password");
const { checkCredentials, createSession, deleteSession, userForSession } = await import("../src/lib/auth/sessions");

let userId: string;

beforeAll(async () => {
  await pg.exec(readFileSync("db/migrations/001_init.sql", "utf8"));
  await pg.exec(readFileSync("db/migrations/002_auth.sql", "utf8"));
  const { rows: [agency] } = await pg.query<{ id: string }>("INSERT INTO agencies (name) VALUES ('A') RETURNING id");
  const { rows: [user] } = await pg.query<{ id: string }>(
    "INSERT INTO users (agency_id, email, name, role, password_hash) VALUES ($1, 'anna@agenzia.it', 'Anna', 'admin', $2) RETURNING id",
    [agency.id, await hashPassword("una-password-lunga")],
  );
  userId = user.id;
});

describe("password", () => {
  it("verifica solo la password giusta", async () => {
    const stored = await hashPassword("segreta-123");
    expect(stored).not.toContain("segreta-123");
    expect(await verifyPassword("segreta-123", stored)).toBe(true);
    expect(await verifyPassword("sbagliata", stored)).toBe(false);
    expect(await verifyPassword("x", "formato-non-valido")).toBe(false);
  });
});

describe("login", () => {
  it("accetta le credenziali giuste, anche con maiuscole nell'email", async () => {
    const user = await checkCredentials("Anna@Agenzia.it", "una-password-lunga");
    expect(user).toMatchObject({ id: userId, role: "admin" });
  });

  it("rifiuta password sbagliata ed email inesistente", async () => {
    expect(await checkCredentials("anna@agenzia.it", "sbagliata")).toBeNull();
    expect(await checkCredentials("nessuno@agenzia.it", "una-password-lunga")).toBeNull();
  });
});

describe("sessioni", () => {
  it("salva solo l'hash del token e si chiude con il logout", async () => {
    const { token } = await createSession(userId);
    const stored = await pg.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(stored.rows.map((r) => r.token_hash)).not.toContain(token);

    expect((await userForSession(token))?.id).toBe(userId);
    await deleteSession(token);
    expect(await userForSession(token)).toBeNull();
  });

  it("ignora le sessioni scadute", async () => {
    const { token } = await createSession(userId);
    await pg.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await userForSession(token)).toBeNull();
  });
});
