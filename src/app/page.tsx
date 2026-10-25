import { requireUser } from "@/lib/auth";
import { agencyName, clientOverview, type ClientOverview } from "@/lib/dashboard";
import { logout } from "./login/actions";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("it-IT");
const pct = (v: number) => `${v.toFixed(0)}%`;

function BudgetBar({ c }: { c: ClientOverview }) {
  const { spentPct, forecastPct } = c.budget;
  const color = spentPct >= 95 ? "bg-red-500" : spentPct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-40">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{pct(spentPct)} speso</span>
        <span className={forecastPct > 100 ? "font-semibold text-red-600" : ""}>prev. {pct(forecastPct)}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-slate-200 dark:bg-slate-700">
        <div className={`h-2 rounded ${color}`} style={{ width: `${Math.min(spentPct, 100)}%` }} />
      </div>
    </div>
  );
}

export default async function Home() {
  const user = await requireUser();
  const name = await agencyName(user.agencyId);
  const clients = await clientOverview(user.agencyId);
  const currency = clients[0]?.currency ?? "EUR";
  const totalSpend = clients.reduce((s, c) => s + c.budget.spendMicros, 0);
  const totalBudget = clients.reduce((s, c) => s + c.budget.budgetMicros, 0);
  const atRisk = clients.filter((c) => c.budget.spentPct >= 80 || c.budget.forecastPct > 100).length;

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">ChatGPT Ads · mese in corso</p>
          <h1 className="text-2xl font-semibold">{name}</h1>
        </div>
        <dl className="flex gap-8 text-sm">
          <div>
            <dt className="text-slate-500">Spesa totale</dt>
            <dd className="text-lg font-semibold">{formatMoney(totalSpend, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Budget totale</dt>
            <dd className="text-lg font-semibold">{formatMoney(totalBudget, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Clienti a rischio</dt>
            <dd className="text-lg font-semibold">{atRisk} / {clients.length}</dd>
          </div>
        </dl>
        <form action={logout} className="text-sm text-slate-500">
          {user.name} ·{" "}
          <button type="submit" className="underline hover:text-slate-900 dark:hover:text-slate-100">Esci</button>
        </form>
      </header>

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-3 font-medium">Cliente</th>
              <th className="p-3 text-right font-medium">Oggi</th>
              <th className="p-3 text-right font-medium">Mese</th>
              <th className="p-3 font-medium">Budget</th>
              <th className="p-3 text-right font-medium">Clic</th>
              <th className="p-3 text-right font-medium">CTR</th>
              <th className="p-3 text-right font-medium">CPC</th>
              <th className="p-3 text-right font-medium">Conv.</th>
              <th className="p-3 text-right font-medium">CPA</th>
              <th className="p-3 font-medium">Revisione</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.lastSyncedAt ? `sync ${c.lastSyncedAt.toLocaleString("it-IT")}` : "mai sincronizzato"}
                  </div>
                </td>
                <td className="p-3 text-right">{formatMoney(c.todaySpendMicros, c.currency)}</td>
                <td className="p-3 text-right">{formatMoney(c.budget.spendMicros, c.currency)}</td>
                <td className="p-3"><BudgetBar c={c} /></td>
                <td className="p-3 text-right">{number.format(c.clicks)}</td>
                <td className="p-3 text-right">{c.impressions ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "–"}</td>
                <td className="p-3 text-right">{c.clicks ? formatMoney(c.budget.spendMicros / c.clicks, c.currency) : "–"}</td>
                <td className="p-3 text-right">{number.format(Math.round(c.conversions))}</td>
                <td className="p-3 text-right">{c.conversions ? formatMoney(c.budget.spendMicros / c.conversions, c.currency) : "–"}</td>
                <td className="p-3">{c.reviewStatus ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
