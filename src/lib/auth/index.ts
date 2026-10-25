import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, userForSession, type SessionUser } from "./sessions";

export const SESSION_COOKIE = "llmads_session";

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? userForSession(token) : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
