import { ruleInputSchema, type RuleInput } from "@/lib/rules/types";

// Il form delle regole arriva sia come query string (anteprima) sia come FormData (salvataggio).
type Source = { get(name: string): FormDataEntryValue | null | undefined };

export const MAX_CONDITIONS = 3;

export function parseRule(raw: Source): { ok: true; rule: RuleInput } | { ok: false; error: string } {
  const src = {
    get: (k: string) => {
      const v = raw.get(k);
      return typeof v === "string" ? v : null;
    },
  };
  const num = (v: string | null | undefined) => Number(String(v ?? "").replace(",", "."));
  const conditions = [];
  for (let i = 0; i < MAX_CONDITIONS; i++) {
    const metric = src.get(`metric${i}`);
    const value = src.get(`value${i}`);
    if (!metric || value === null || value === undefined || value === "") continue;
    conditions.push({ metric, op: src.get(`op${i}`), value: num(value) });
  }
  const type = src.get("action");
  const parsed = ruleInputSchema.safeParse({
    name: src.get("name") ?? "",
    clientId: src.get("clientId") || null,
    conditions,
    lookbackDays: num(src.get("lookbackDays")),
    action: type === "budget" ? { type, pct: num(src.get("pct")) } : { type },
    mode: src.get("mode") === "auto" ? "auto" : "suggest",
  });
  if (parsed.success) return { ok: true, rule: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  const messages: Record<string, string> = {
    name: "Dai un nome alla regola.",
    conditions: "Aggiungi almeno una condizione con un valore numerico.",
    lookbackDays: "Il periodo deve essere tra 1 e 90 giorni.",
    action: "La variazione di budget deve essere tra -50% e +50% e diversa da zero.",
    clientId: "Cliente non valido.",
  };
  return { ok: false, error: messages[field] ?? "Controlla i campi della regola." };
}

/** Rimette una regola nei parametri del form, per riaprirla in anteprima. */
export function ruleToParams(r: RuleInput): URLSearchParams {
  const p = new URLSearchParams({
    name: r.name,
    clientId: r.clientId ?? "",
    lookbackDays: String(r.lookbackDays),
    action: r.action.type,
    pct: r.action.type === "budget" ? String(r.action.pct) : "",
    mode: r.mode,
    anteprima: "1",
  });
  r.conditions.forEach((c, i) => {
    p.set(`metric${i}`, c.metric);
    p.set(`op${i}`, c.op);
    p.set(`value${i}`, String(c.value));
  });
  return p;
}
