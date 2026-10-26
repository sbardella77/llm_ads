import { createHash, randomBytes } from "node:crypto";
import { sql } from "../db";
import { DUMMY_HASH, verifyPassword } from "./password";

export const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  role: "admin" | "manager";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Restituisce l'utente se email e password sono corrette, altrimenti null. */
export async function checkCredentials(email: string, password: string): Promise<SessionUser | null> {
  const [row] = await sql()`
    SELECT id, agency_id, email, name, role, password_hash FROM users WHERE email = ${email.trim().toLowerCase()}`;
  const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !row.password_hash || !ok) return null;
  return { id: row.id, agencyId: row.agency_id, email: row.email, name: row.name, role: row.role };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})`;
  return { token, expiresAt };
}

export async function userForSession(token: string): Promise<SessionUser | null> {
  const [row] = await sql()`
    SELECT u.id, u.agency_id, u.email, u.name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  return row ? { id: row.id, agencyId: row.agency_id, email: row.email, name: row.name, role: row.role } : null;
}

export async function deleteSession(token: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}
