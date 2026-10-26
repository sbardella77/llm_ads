import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { auditClients } from "@/lib/audit";
import { Nav } from "@/components/nav";
import { GradeBadge, SeverityBadge, card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requireUser();
  // I clienti messi peggio in cima: sono quelli da guardare per primi.
  const audits = (await auditClients(user.agencyId)).sort((a, b) => a.score - b.score);

  return (
    <>
      <Nav user={user} current="/audit" />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Audit degli account</h1>
        <p className="text-sm text-slate-500">
          Controlli automatici su revisione, sync, budget, consegna e conversioni. Ogni problema critico toglie 25 punti, ogni problema da sistemare 10, ogni consiglio 3.
        </p>
        <div className="mt-6 space-y-4">
          {audits.map((a) => (
            <section key={a.clientId} className={`${card} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <Link href={`/clienti/${a.clientId}`} className="text-lg font-medium hover:underline">{a.clientName}</Link>
                <GradeBadge grade={a.grade} score={a.score} />
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {a.findings.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-center gap-2"><SeverityBadge severity={f.severity} /><span className="font-medium">{f.title}</span></div>
                    <p className="ml-1 mt-0.5 text-slate-600 dark:text-slate-300">{f.detail}</p>
                  </li>
                ))}
                {!a.findings.length && <li className="text-slate-500">Nessun problema trovato.</li>}
              </ul>
            </section>
          ))}
          {!audits.length && <p className="text-sm text-slate-500">Nessun cliente collegato.</p>}
        </div>
      </main>
    </>
  );
}
