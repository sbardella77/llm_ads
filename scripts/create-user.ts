import { sql } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

// Uso: npm run user:create -- <agenzia> <email> <nome> <password> [admin|manager]
// Crea l'agenzia se non esiste; se l'email esiste già aggiorna la password.
async function main() {
  const [agencyName, email, name, password, role = "admin"] = process.argv.slice(2);
  if (!agencyName || !email || !name || !password || password.length < 10) {
    console.error("Uso: npm run user:create -- <agenzia> <email> <nome> <password di almeno 10 caratteri> [admin|manager]");
    process.exit(1);
  }
  const db = sql();
  let [agency] = await db`SELECT id FROM agencies WHERE name = ${agencyName}`;
  agency ??= (await db`INSERT INTO agencies (name) VALUES (${agencyName}) RETURNING id`)[0];
  await db`
    INSERT INTO users (agency_id, email, name, role, password_hash)
    VALUES (${agency.id}, ${email.toLowerCase()}, ${name}, ${role}, ${await hashPassword(password)})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`;
  console.log(`Utente ${email} pronto per l'agenzia "${agencyName}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
