import { sql } from "../src/lib/db";
import { env } from "../src/lib/env";
import { randomBytes } from "node:crypto";
import { encryptSecret } from "../src/lib/crypto";
import { hashPassword } from "../src/lib/auth/password";
import { syncAll } from "../src/lib/sync";

// Agenzia demo con clienti finti: le chiavi "mock_" usano sempre MockAdsApi.
const CLIENTS = [
  { name: "Trattoria Da Mario", budgetEur: 1500 },
  { name: "Ortopedia Rossi", budgetEur: 4000 },
  { name: "Scarpe Trail Italia", budgetEur: 2500 },
  { name: "Corsi Data Academy", budgetEur: 900 },
];

async function main() {
  const db = sql();
  const [existing] = await db`SELECT id FROM agencies WHERE name = 'Agenzia Demo'`;
  if (existing) {
    console.log("Agenzia demo già presente, rilancio solo il sync");
  } else {
    const [agency] = await db`INSERT INTO agencies (name) VALUES ('Agenzia Demo') RETURNING id`;
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db`INSERT INTO users (agency_id, email, name, role, password_hash)
      VALUES (${agency.id}, 'admin@demo.local', 'Admin Demo', 'admin', ${await hashPassword(password)})`;
    console.log(`Login demo: admin@demo.local / ${password}`);
    for (const [i, c] of CLIENTS.entries()) {
      const [client] = await db`
        INSERT INTO clients (agency_id, name, monthly_budget_micros)
        VALUES (${agency.id}, ${c.name}, ${c.budgetEur * 1_000_000}) RETURNING id`;
      const key = `mock_demo_${i}`;
      const enc = encryptSecret(key, env().ENCRYPTION_KEY);
      await db`
        INSERT INTO ad_accounts (agency_id, client_id, openai_account_id, name, currency_code, timezone,
          api_key_ciphertext, api_key_iv, api_key_tag, api_key_last4)
        VALUES (${agency.id}, ${client.id}, ${`pending_${i}`}, ${c.name}, 'EUR', 'Europe/Rome',
          ${enc.ciphertext}, ${enc.iv}, ${enc.tag}, ${key.slice(-4)})`;
    }
  }
  for (const r of await syncAll()) console.log(r.ok ? `ok ${r.adAccountId}: ${r.rows} righe` : `errore ${r.adAccountId}: ${r.error}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
