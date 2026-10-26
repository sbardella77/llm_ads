import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { listRules, previewRule, type PreviewMatch } from "@/lib/rules/run";
import { METRICS, OPERATORS, TEMPLATES, describeAction, describeCondition, type RuleInput } from "@/lib/rules/types";
import { formatMoney } from "@/lib/money";
import { Nav } from "@/components/nav";
import { Notice, btn, btnPrimary, card, dateTime, input } from "@/components/ui";
import { deleteRule, runAllRules, saveRule, toggleRule } from "./actions";
import { MAX_CONDITIONS, parseRule, ruleToParams } from "./form";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function HiddenRule({ rule }: { rule: RuleInput }) {
  return (
    <>
      {[...ruleToParams(rule)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

function RuleForm({ sp, clients }: { sp: SP; clients: { id: string; name: string }[] }) {
  return (
    <form method="get" action="/regole" className={`${card} mt-3 space-y-4 p-4 text-sm`}>
      <input type="hidden" name="anteprima" value="1" />
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          Nome
          <input name="name" required defaultValue={sp.name ?? ""} className={`${input} w-64`} />
        </label>
        <label className="flex flex-col gap-1">
          Cliente
          <select name="clientId" defaultValue={sp.clientId ?? ""} className={input}>
            <option value="">Tutti i clienti</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Periodo (giorni)
          <input name="lookbackDays" type="number" min={1} max={90} defaultValue={sp.lookbackDays ?? "7"} className={`${input} w-24`} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1">Se tutte queste condizioni sono vere per una campagna</legend>
        {Array.from({ length: MAX_CONDITIONS }, (_, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select name={`metric${i}`} defaultValue={sp[`metric${i}`] ?? (i === 0 ? "spend" : "")} className={input} aria-label={`Metrica ${i + 1}`}>
              {i > 0 && <option value="">—</option>}
              {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name={`op${i}`} defaultValue={sp[`op${i}`] ?? ">"} className={input} aria-label={`Operatore ${i + 1}`}>
              {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input name={`value${i}`} inputMode="decimal" defaultValue={sp[`value${i}`] ?? ""} className={`${input} w-28`} aria-label={`Valore ${i + 1}`} />
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          Allora
          <select name="action" defaultValue={sp.action ?? "alert"} className={input}>
            <option value="alert">Solo avviso</option>
            <option value="pause">Metti in pausa</option>
            <option value="activate">Riattiva</option>
            <option value="budget">Cambia budget giornaliero</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Variazione budget (%)
          <input name="pct" type="number" min={-50} max={50} defaultValue={sp.pct ?? ""} className={`${input} w-24`} />
        </label>
        <label className="flex flex-col gap-1">
          Modalità
          <select name="mode" defaultValue={sp.mode ?? "suggest"} className={input}>
            <option value="suggest">Suggerisci, approvo io</option>
            <option value="auto">Applica in automatico</option>
          </select>
        </label>
      </div>
      <button className={btnPrimary}>Anteprima</button>
    </form>
  );
}

function Preview({ rule, matches }: { rule: RuleInput; matches: PreviewMatch[] }) {
  return (
    <section className={`${card} mt-4 p-4 text-sm`}>
      <h3 className="font-medium">
        Anteprima: {matches.length} campagn{matches.length === 1 ? "a" : "e"} oggi → {describeAction(rule.action)}
      </h3>
      <ul className="mt-2 space-y-1">
        {matches.map((m) => (
          <li key={m.campaign.campaignId}>
            <strong>{m.campaign.clientName}</strong> · &quot;{m.campaign.name}&quot; · spesa {formatMoney(m.campaign.spendMicros, "EUR")}
            <span className="block text-xs text-slate-500">{m.reason}</span>
          </li>
        ))}
        {!matches.length && <li className="text-slate-500">Nessuna campagna corrisponde oggi.</li>}
      </ul>
      <form action={saveRule} className="mt-3">
        <HiddenRule rule={rule} />
        <button className={btnPrimary}>Salva regola</button>
      </form>
    </section>
  );
}

export default async function RulesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [rules, clients] = await Promise.all([
    listRules(user.agencyId),
    sql()`SELECT id, name FROM clients WHERE agency_id = ${user.agencyId} ORDER BY name`.then((rows) =>
      rows.map((r) => ({ id: String(r.id), name: String(r.name) })),
    ),
  ]);
  const draft = sp.anteprima ? parseRule({ get: (k) => sp[k] }) : null;
  const matches = draft?.ok ? await previewRule(user.agencyId, draft.rule) : [];

  return (
    <>
      <Nav user={user} current="/regole" />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Regole automatiche</h1>
            <p className="text-sm text-slate-500">Girano dopo ogni sync giornaliero, su tutte le campagne dei clienti scelti.</p>
          </div>
          <form action={runAllRules}><button className={btnPrimary}>Esegui ora</button></form>
        </div>
        {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
        {sp.errore && <Notice kind="error">{sp.errore}</Notice>}
        {draft && !draft.ok && <Notice kind="error">{draft.error}</Notice>}

        <div className={`${card} mt-6 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="p-3 font-medium">Regola</th>
                <th className="p-3 font-medium">Condizioni</th>
                <th className="p-3 font-medium">Azione</th>
                <th className="p-3 font-medium">Ultima esecuzione</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 dark:border-slate-800 ${r.enabled ? "" : "opacity-50"}`}>
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.clientName ?? "Tutti i clienti"}</div>
                  </td>
                  <td className="p-3 text-xs">
                    {r.conditions.map(describeCondition).join(" e ")}
                    <div className="text-slate-500">ultimi {r.lookbackDays} giorni</div>
                  </td>
                  <td className="p-3 text-xs">
                    {describeAction(r.action)}
                    <div className="text-slate-500">{r.mode === "auto" ? "automatica" : "da approvare"}</div>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{r.lastRunAt ? dateTime(r.lastRunAt) : "mai"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Link href={`/regole?${ruleToParams({ ...r, name: `${r.name} (copia)` })}`} className={btn}>Duplica</Link>
                      <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className={btn}>{r.enabled ? "Disattiva" : "Attiva"}</button></form>
                      <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className={btn}>Elimina</button></form>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr><td colSpan={5} className="p-3 text-slate-500">Nessuna regola. Parti da un modello qui sotto.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-lg font-semibold">Modelli pronti</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => (
            <Link key={t.name} href={`/regole?${ruleToParams(t)}#nuova`} className={`${card} block p-4 text-sm hover:border-slate-400`}>
              <div className="font-medium">{t.name}</div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{t.description}</p>
              <p className="mt-2 text-xs text-slate-500">{t.conditions.map(describeCondition).join(" e ")} → {describeAction(t.action)}</p>
            </Link>
          ))}
        </div>

        <h2 id="nuova" className="mt-10 text-lg font-semibold">Nuova regola</h2>
        <RuleForm key={JSON.stringify(sp)} sp={sp} clients={clients} />
        {draft?.ok && <Preview rule={draft.rule} matches={matches} />}
      </main>
    </>
  );
}
