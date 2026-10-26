"use client";

import { useActionState } from "react";
import { connect, type ConnectState } from "./actions";

const input =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800";

export function ConnectForm() {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connect, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-300">Nome del cliente</span>
        <input name="clientName" required className={input} placeholder="Es. Trattoria Da Mario" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-300">Budget mensile (€)</span>
        <input name="budget" inputMode="decimal" required className={input} placeholder="1500" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-300">Chiave API di OpenAI Ads</span>
        <input name="apiKey" type="password" autoComplete="off" required className={`${input} font-mono`} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
        {pending ? "Verifica con OpenAI…" : "Collega account"}
      </button>
    </form>
  );
}
