"use server";

import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { checkCredentials } from "@/lib/auth/sessions";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = email && password ? await checkCredentials(email, password) : null;
  if (!user) return { error: "Email o password non corrette" };
  await startSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
