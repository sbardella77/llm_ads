import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listBudgetAlerts } from "@/lib/client-detail";
import { listSuggestions } from "@/lib/rules/run";
import { describeAction } from "@/lib/rules/types";
import { formatMoney } from "@/lib/money";
import { Nav } from "@/components/nav";
import { Notice, btn, card, dateTime } from "@/components/ui";
import { acknowledgeAlert, decide } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { applied: "Applicato", dismissed: "Ignorato", failed: "Errore" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [pending, closed, alerts] = await Promise.all([
    listSuggestions(user.agencyId, "pending"),
    listSuggestions(user.agencyId, "closed"),
    listBudgetAlerts(user.agencyId),
  ]);
  const openAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <>
      <Nav user={user} current="/avvisi" />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Avvisi e suggerimenti</h1>
        <p className="text-sm text-slate-500">Quello che le regole hanno trovato e i budget vicini al limite. Niente viene modificato senza il tuo ok, salvo le regole in modalità automatica.</p>
        {sp.ok && <Notice kind="ok">Suggerimento {sp.ok}.</Notice>}
        {sp.errore && <Notice kind="error">{sp.errore}</Notice>}

        <h2 className="mt-8 text-lg font-semibold">Budget ({openAlerts.length})</h2>
        <ul className="mt-3 space-y-2">
          {openAlerts.map((a) => (
            <li key={a.id} className={`${card} flex flex-wrap items-center justify-between gap-3 p-3 text-sm`}>
              <span>
                <Link href={`/clienti/${a.clientId}`} className="font-medium hover:underline">{a.clientName}</Link> ha superato il{" "}
                <strong>{a.threshold}%</strong> del budget mensile ({formatMoney(a.spendMicros, "EUR")} su {formatMoney(a.budgetMicros, "EUR")})
                <span className="ml-2 text-xs text-slate-500">{dateTime(a.createdAt)}</span>
              </span>
              <form action={acknowledgeAlert}>
                <input type="hidden" name="id" value={a.id} />
                <button className={btn}>Segna come letto</button>
              </form>
            </li>
          ))}
          {!openAlerts.length && <li className="text-sm text-slate-500">Nessun avviso di budget aperto.</li>}
        </ul>

        <h2 className="mt-8 text-lg font-semibold">Suggerimenti da approvare ({pending.length})</h2>
        <ul className="mt-3 space-y-2">
          {pending.map((s) => (
            <li key={s.id} className={`${card} p-3 text-sm`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong>{describeAction(s.action)}</strong> · &quot;{s.campaignName}&quot; ·{" "}
                  <Link href={`/clienti/${s.clientId}`} className="hover:underline">{s.clientName}</Link>
                </span>
                <div className="flex gap-1">
                  {(s.action.type === "alert"
                    ? [{ decision: "approve", label: "Segna come letto", cls: btn }]
                    : [
                        { decision: "approve", label: "Applica", cls: `${btn} border-emerald-600 text-emerald-700 dark:text-emerald-400` },
                        { decision: "dismiss", label: "Ignora", cls: btn },
                      ]
                  ).map((b) => (
                    <form key={b.decision} action={decide}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="decision" value={b.decision} />
                      <button className={b.cls}>{b.label}</button>
                    </form>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Regola &quot;{s.ruleName ?? "–"}&quot; · {s.reason} · {dateTime(s.createdAt)}
              </p>
            </li>
          ))}
          {!pending.length && <li className="text-sm text-slate-500">Nessun suggerimento in attesa.</li>}
        </ul>

        {closed.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-semibold">Già gestiti</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {closed.slice(0, 30).map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1 dark:border-slate-800">
                  <span>{describeAction(s.action)} · &quot;{s.campaignName}&quot; · {s.clientName}{s.error ? ` · ${s.error}` : ""}</span>
                  <span className="text-xs text-slate-500">{STATUS_LABEL[s.status] ?? s.status} · {dateTime(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
