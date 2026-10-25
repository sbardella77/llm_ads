import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-xl font-semibold">LLMAds</h1>
      <p className="mt-1 text-sm text-slate-500">Accedi con l&apos;account della tua agenzia</p>
      <LoginForm />
    </main>
  );
}
