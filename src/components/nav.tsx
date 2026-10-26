import Link from "next/link";
import type { SessionUser } from "@/lib/auth/sessions";
import { openItemsCount } from "@/lib/client-detail";
import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/", label: "Clienti" },
  { href: "/avvisi", label: "Avvisi" },
  { href: "/regole", label: "Regole" },
  { href: "/audit", label: "Audit" },
  { href: "/storico", label: "Storico" },
];

export async function Nav({ user, current }: { user: SessionUser; current: string }) {
  const open = await openItemsCount(user.agencyId);
  return (
    <nav className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 sm:px-8">
        <Link href="/" className="font-semibold tracking-tight">LLMAds</Link>
        <ul className="flex flex-wrap gap-1 text-sm">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                className={`rounded px-2.5 py-1.5 ${current === l.href ? "bg-slate-100 font-medium dark:bg-slate-800" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {l.label}
                {l.href === "/avvisi" && open > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">{open}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <form action={logout} className="ml-auto text-sm text-slate-500">
          {user.name} ·{" "}
          <button type="submit" className="underline hover:text-slate-900 dark:hover:text-slate-100">Esci</button>
        </form>
      </div>
    </nav>
  );
}
