import { requireUser } from "@/lib/auth";
import { listChanges } from "@/lib/client-detail";
import { Nav } from "@/components/nav";
import { card, dateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { user: "Piattaforma", rule: "Regola", openai: "OpenAI Ads Manager" };

export default async function HistoryPage() {
  const user = await requireUser();
  const changes = await listChanges(user.agencyId);

  return (
    <>
      <Nav user={user} current="/storico" />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Storico modifiche</h1>
        <p className="text-sm text-slate-500">
          Le modifiche fatte da qui, quelle applicate dalle regole e quelle fatte direttamente su OpenAI (lette dal registro di audit dell&apos;account).
        </p>
        <div className={`${card} mt-6 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="p-3 font-medium">Quando</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Modifica</th>
                <th className="p-3 font-medium">Da</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="whitespace-nowrap p-3 text-slate-500">{dateTime(c.createdAt)}</td>
                  <td className="p-3">{c.clientName}</td>
                  <td className="p-3">{c.summary}</td>
                  <td className="p-3 text-slate-500">{SOURCE[c.source]}{c.who ? ` · ${c.who}` : ""}</td>
                </tr>
              ))}
              {!changes.length && (
                <tr><td colSpan={4} className="p-3 text-slate-500">Nessuna modifica registrata.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
