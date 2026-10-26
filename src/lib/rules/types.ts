import { z } from "zod";

// Metriche calcolate sulla finestra della regola (ultimi N giorni, oggi incluso).
export const METRICS = {
  impressions: "Impression",
  clicks: "Clic",
  spend: "Spesa (€)",
  conversions: "Conversioni",
  ctr: "CTR (%)",
  cpc: "CPC (€)",
  cpa: "CPA (€)",
} as const;
export type Metric = keyof typeof METRICS;

export const OPERATORS = [">", ">=", "<", "<="] as const;

export const conditionSchema = z.object({
  metric: z.enum(Object.keys(METRICS) as [Metric, ...Metric[]]),
  op: z.enum(OPERATORS),
  value: z.number().finite(),
});
export type Condition = z.infer<typeof conditionSchema>;

// La variazione di budget è limitata a ±50% per esecuzione, come i "change limits" di Optmyzr.
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("alert") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("activate") }),
  z.object({ type: z.literal("budget"), pct: z.number().int().min(-50).max(50).refine((v) => v !== 0) }),
]);
export type Action = z.infer<typeof actionSchema>;

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientId: z.string().uuid().nullable(),
  conditions: z.array(conditionSchema).min(1).max(5),
  lookbackDays: z.number().int().min(1).max(90),
  action: actionSchema,
  mode: z.enum(["suggest", "auto"]),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export function describeAction(a: Action): string {
  switch (a.type) {
    case "alert":
      return "Solo avviso";
    case "pause":
      return "Metti in pausa";
    case "activate":
      return "Riattiva";
    case "budget":
      return `Budget giornaliero ${a.pct > 0 ? "+" : ""}${a.pct}%`;
  }
}

export function describeCondition(c: Condition): string {
  return `${METRICS[c.metric]} ${c.op} ${c.value.toLocaleString("it-IT")}`;
}

/** Modelli pronti, come i Blueprint di Optmyzr: si creano con un clic e si possono modificare. */
export const TEMPLATES: (RuleInput & { description: string })[] = [
  {
    name: "Spesa senza conversioni",
    description: "Ferma le campagne che hanno speso più di 50 € in 7 giorni senza convertire.",
    clientId: null,
    conditions: [
      { metric: "spend", op: ">", value: 50 },
      { metric: "conversions", op: "<", value: 1 },
    ],
    lookbackDays: 7,
    action: { type: "pause" },
    mode: "suggest",
  },
  {
    name: "CTR basso",
    description: "Segnala le campagne con CTR sotto lo 0,5% su almeno 1.000 impression.",
    clientId: null,
    conditions: [
      { metric: "impressions", op: ">=", value: 1000 },
      { metric: "ctr", op: "<", value: 0.5 },
    ],
    lookbackDays: 7,
    action: { type: "alert" },
    mode: "suggest",
  },
  {
    name: "CPA troppo alto",
    description: "Riduce del 20% il budget giornaliero se il costo per conversione supera 30 €.",
    clientId: null,
    conditions: [
      { metric: "conversions", op: ">=", value: 3 },
      { metric: "cpa", op: ">", value: 30 },
    ],
    lookbackDays: 14,
    action: { type: "budget", pct: -20 },
    mode: "suggest",
  },
  {
    name: "Campagne che convertono bene",
    description: "Aumenta del 15% il budget giornaliero se il CPA è sotto 10 € con almeno 5 conversioni.",
    clientId: null,
    conditions: [
      { metric: "conversions", op: ">=", value: 5 },
      { metric: "cpa", op: "<", value: 10 },
    ],
    lookbackDays: 14,
    action: { type: "budget", pct: 15 },
    mode: "suggest",
  },
];
