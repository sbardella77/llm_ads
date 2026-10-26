"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { applyCampaignAction } from "@/lib/changes";
import { actionSchema } from "@/lib/rules/types";

export async function campaignAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const clientId = String(form.get("clientId") ?? "");
  const type = String(form.get("type") ?? "");
  const pct = Number(form.get("pct") ?? 0);
  const action = actionSchema.safeParse(type === "budget" ? { type, pct } : { type });
  const res = action.success
    ? await applyCampaignAction({
        agencyId: user.agencyId,
        campaignId: String(form.get("campaignId") ?? ""),
        action: action.data,
        source: "user",
        userId: user.id,
      })
    : { ok: false as const, error: "Azione non valida." };
  const q = res.ok ? `ok=${encodeURIComponent(res.summary)}` : `errore=${encodeURIComponent(res.error)}`;
  redirect(`/clienti/${clientId}?${q}`);
}
