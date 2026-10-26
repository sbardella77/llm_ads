import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ConnectForm } from "./connect-form";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <Link href="/" className="text-sm text-slate-500 hover:underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">Collega un account OpenAI Ads</h1>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>
          Apri{" "}
          <a href="https://ads.openai.com" target="_blank" rel="noreferrer" className="underline">Ads Manager</a>{" "}
          e accedi con l&apos;account OpenAI del cliente.
        </li>
        <li>Vai in <strong>Settings</strong> e crea una nuova chiave API per l&apos;account pubblicitario.</li>
        <li>Incollala qui sotto: la verifichiamo con OpenAI e la salviamo cifrata.</li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">
        OpenAI rilascia una chiave per ogni account pubblicitario. La piattaforma per ora legge solo i dati e non modifica le campagne.
      </p>
      <ConnectForm />
    </main>
  );
}
