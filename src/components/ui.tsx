import type { Severity } from "@/lib/audit";

export const card = "rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
export const btn = "rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800";
export const btnPrimary = "rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900";
export const input = "rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critico", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  warning: { label: "Da sistemare", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  info: { label: "Consiglio", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Attiva", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  paused: { label: "In pausa", cls: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  archived: { label: "Archiviata", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: STATUS.archived.cls };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const cls =
    grade === "A" || grade === "B"
      ? "bg-emerald-600"
      : grade === "C"
        ? "bg-amber-500"
        : "bg-red-600";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${cls}`}>{grade}</span>
      <span className="text-sm text-slate-500">{score}/100</span>
    </span>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  const cls =
    kind === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
      : "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200";
  return (
    <p role="status" className={`mt-6 rounded border px-4 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export const dateTime = (d: Date) =>
  d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
