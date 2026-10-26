"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decideSuggestion } from "@/lib/rules/run";

export async function decide(form: FormData): Promise<void> {
  const user = await requireUser();
  const approve = form.get("decision") === "approve";
  const res = await decideSuggestion(user.agencyId, user.id, String(form.get("id") ?? ""), approve);
  revalidatePath("/avvisi");
  redirect(res.ok ? `/avvisi?ok=${approve ? "applicato" : "ignorato"}` : `/avvisi?errore=${encodeURIComponent(res.error ?? "")}`);
}

export async function acknowledgeAlert(form: FormData): Promise<void> {
  const user = await requireUser();
  await sql()`
    UPDATE alerts SET acknowledged_at = now()
    WHERE id = ${String(form.get("id") ?? "")} AND agency_id = ${user.agencyId} AND acknowledged_at IS NULL`;
  revalidatePath("/avvisi");
}
