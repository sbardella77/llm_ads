import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { clientDetail, listChanges } from "@/lib/client-detail";
import { investigateClient, type Explanation } from "@/lib/investigator";
import { auditClients } from "@/lib/audit";
import { listSuggestions } from "@/lib/rules/run";
import { describeAction } from "@/lib/rules/types";
import { formatMoney } from "@/lib/money";
import { Nav } from "@/components/nav";
import { GradeBadge, Notice, SeverityBadge, StatusBadge, btn, card, dateTime } from "@/components/ui";
import { campaignAction } from "./actions";

export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("it-IT", { style: "percent", minimumFractionDigits: 2 });
const PERIODS = [7, 14, 30];

function signed(v: number, fmt: (n: number) => string): string {
  const abs = fmt(Math.abs(v));
  // Niente segno sui valori che, arrotondati, valgono zero ("−0").
  return abs === fmt(0) ? abs : `${v > 0 ? "+" : "−"}${abs}`;
}

function CauseChart({ e, currency }: { e: Explanation; currency: string }) {
  const money = (v: number) => formatMoney(v, currency);
  const fmtMetric = e.metric === "Spesa" ? money : (v: number) => number.format(v);
  const fmtFactor = (label: string, v: number) =>
    label === "CPC" ? money(v) : label === "CTR" || label === "Tasso di conversione" ? percent.format(v) : number.format(v);
  const delta = e.after - e.before;
  const max = Math.max(...e.factors.map((f) => Math.abs(f.effect)), 1e-9);
  const pctChange = e.before ? (delta / e.before) * 100 : 0;
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">{e.metric}</h3>
        <span className={`text-sm font-semibold ${delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {signed(delta, fmtMetric)} {e.before ? `(${signed(pctChange, (n) => n.toFixed(0))}%)` : ""}
        </span>
      </div>
      <p className="text-xs text-slate-500">{fmtMetric(e.before)} → {fmtMetric(e.after)}</p>
      <ul className="mt-3 space-y-2">
        {e.factors.map((f) => (
          <li key={f.label} className="text-xs">
            <div className="flex justify-between">
              <span>{f.label}: {fmtFactor(f.label, f.before)} → {fmtFactor(f.label, f.after)}</span>
              <span className="font-medium">{signed(f.effect, fmtMetric)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-1.5 rounded ${f.effect >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${(Math.abs(f.effect) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ giorni?: string; ok?: string; errore?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const days = PERIODS.includes(Number(sp.giorni)) ? Number(sp.giorni) : 7;
  const [detail, inv, [audit], suggestions, changes] = await Promise.all([
    clientDetail(user.agencyId, id),
    investigateClient(user.agencyId, id, days),
    auditClients(user.agencyId, id),
    listSuggestions(user.agencyId, "pending", id),
    listChanges(user.agencyId, id, 10),
  ]);
  if (!detail || !inv || !audit) notFound();
  const { pacing: p, currency } = detail;
  const money = (v: number) => formatMoney(v, currency);
  const dailyGap = p.currentDailyMicros - p.targetDailyMicros;

  return (
    <>
      <Nav user={user} current="" />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">
        <p className="text-sm text-slate-500"><Link href="/" className="hover:underline">Clienti</Link> / {detail.name}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{detail.name}</h1>
          <Link href="/audit" className="flex items-center gap-2"><GradeBadge grade={audit.grade} score={audit.score} /></Link>
        </div>
        {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
        {sp.errore && <Notice kind="error">{sp.errore}</Notice>}

        <section className={`${card} mt-6 grid gap-4 p-4 sm:grid-cols-4`}>
          <div>
            <p className="text-xs text-slate-500">Speso questo mese</p>
            <p className="text-lg font-semibold">{money(p.spendMicros)}</p>
            <p className="text-xs text-slate-500">su {money(p.budgetMicros)} ({p.spentPct.toFixed(0)}%)</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Previsione fine mese</p>
            <p className={`text-lg font-semibold ${p.forecastPct > 100 ? "text-red-600" : ""}`}>{money(p.forecastMicros)}</p>
            <p className="text-xs text-slate-500">{p.forecastPct.toFixed(0)}% del budget</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Spesa giornaliera consigliata</p>
            <p className="text-lg font-semibold">{money(p.targetDailyMicros)}</p>
            <p className="text-xs text-slate-500">per {p.daysLeft} giorni rimasti</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Budget giornalieri attivi</p>
            <p className="text-lg font-semibold">{money(p.currentDailyMicros)}</p>
            <p className={`text-xs ${Math.abs(dailyGap) > p.targetDailyMicros * 0.1 ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}>
              {dailyGap > 0 ? `${money(dailyGap)} sopra il ritmo` : dailyGap < 0 ? `${money(-dailyGap)} sotto il ritmo` : "in linea"}
            </p>
          </div>
        </section>

        {suggestions.length > 0 && (
          <p className="mt-4 text-sm">
            <Link href="/avvisi" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
              {suggestions.length} suggeriment{suggestions.length === 1 ? "o" : "i"} da approvare →
            </Link>
          </p>
        )}

        <h2 className="mt-8 text-lg font-semibold">Campagne · mese in corso</h2>
        <div className={`${card} mt-3 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="p-3 font-medium">Campagna</th>
                <th className="p-3 font-medium">Stato</th>
                <th className="p-3 text-right font-medium">Budget</th>
                <th className="p-3 text-right font-medium">Spesa</th>
                <th className="p-3 text-right font-medium">Clic</th>
                <th className="p-3 text-right font-medium">Conv.</th>
                <th className="p-3 text-right font-medium">CPA</th>
                <th className="p-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {detail.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3 text-right">
                    {c.budgetMicros ? `${money(c.budgetMicros)}${c.budgetType === "daily" ? "/g" : " tot."}` : "–"}
                  </td>
                  <td className="p-3 text-right">{money(c.spendMicros)}</td>
                  <td className="p-3 text-right">{number.format(c.clicks)}</td>
                  <td className="p-3 text-right">{number.format(c.conversions)}</td>
                  <td className="p-3 text-right">{c.conversions ? money(c.spendMicros / c.conversions) : "–"}</td>
                  <td className="p-3">
                    {(c.status === "active" || c.status === "paused") && (
                      <form action={campaignAction}>
                        <input type="hidden" name="clientId" value={detail.id} />
                        <input type="hidden" name="campaignId" value={c.id} />
                        <input type="hidden" name="type" value={c.status === "active" ? "pause" : "activate"} />
                        <button className={btn}>{c.status === "active" ? "Pausa" : "Riattiva"}</button>
                      </form>
                    )}
                    {c.status === "active" && c.budgetType === "daily" && (
                      <div className="mt-1 flex gap-1">
                        {[-10, 10].map((pct) => (
                          <form key={pct} action={campaignAction}>
                            <input type="hidden" name="clientId" value={detail.id} />
                            <input type="hidden" name="campaignId" value={c.id} />
                            <input type="hidden" name="pct" value={pct} />
                            <input type="hidden" name="type" value="budget" />
                            <button className={btn}>Budget {pct > 0 ? "+" : ""}{pct}%</button>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!detail.campaigns.length && (
                <tr><td colSpan={8} className="p-3 text-slate-500">Nessuna campagna sincronizzata.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Investigatore: cosa è cambiato</h2>
            <p className="text-sm text-slate-500">
              {inv.current.since} → {inv.current.until} contro {inv.previous.since} → {inv.previous.until}
            </p>
          </div>
          <div className="flex gap-1 text-sm">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={`/clienti/${detail.id}?giorni=${d}`}
                className={`rounded px-2.5 py-1 ${d === days ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "border border-slate-300 dark:border-slate-600"}`}
              >
                {d} giorni
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {inv.explanations.map((e) => <CauseChart key={e.metric} e={e} currency={currency} />)}
        </div>
        {inv.campaigns.length > 0 && (
          <div className={`${card} mt-4 overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="p-3 font-medium">Campagna</th>
                  <th className="p-3 text-right font-medium">Δ Spesa</th>
                  <th className="p-3 text-right font-medium">Δ Clic</th>
                  <th className="p-3 text-right font-medium">Δ Conv.</th>
                </tr>
              </thead>
              <tbody>
                {inv.campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3">{c.name}</td>
                    <td className="p-3 text-right">{signed(c.after.spendMicros - c.before.spendMicros, money)}</td>
                    <td className="p-3 text-right">{signed(c.after.clicks - c.before.clicks, (n) => number.format(n))}</td>
                    <td className="p-3 text-right">{signed(c.after.conversions - c.before.conversions, (n) => number.format(n))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-semibold">Audit</h2>
            <ul className="mt-3 space-y-2">
              {audit.findings.map((f) => (
                <li key={f.id} className={`${card} p-3 text-sm`}>
                  <div className="flex items-center gap-2"><SeverityBadge severity={f.severity} /><span className="font-medium">{f.title}</span></div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{f.detail}</p>
                </li>
              ))}
              {!audit.findings.length && <li className="text-sm text-slate-500">Nessun problema trovato.</li>}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Ultime modifiche</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {changes.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>{c.summary}</span>
                  <span className="shrink-0 text-xs text-slate-500">{dateTime(c.createdAt)}</span>
                </li>
              ))}
              {!changes.length && <li className="text-slate-500">Nessuna modifica registrata.</li>}
            </ul>
            {suggestions.length > 0 && (
              <>
                <h3 className="mt-6 font-medium">Da approvare</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {suggestions.slice(0, 5).map((s) => (
                    <li key={s.id}>• {describeAction(s.action)} su &quot;{s.campaignName}&quot;</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
