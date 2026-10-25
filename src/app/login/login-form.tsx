"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-300">Email</span>
        <input name="email" type="email" autoComplete="email" required
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-300">Password</span>
        <input name="password" type="password" autoComplete="current-password" required
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
        {pending ? "Accesso…" : "Accedi"}
      </button>
    </form>
  );
}
