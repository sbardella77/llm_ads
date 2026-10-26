"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { createRule, runRules } from "@/lib/rules/run";
import { parseRule } from "./form";

export async function saveRule(form: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = parseRule(form);
  if (!parsed.ok) redirect(`/regole?errore=${encodeURIComponent(parsed.error)}`);
  await createRule(user.agencyId, parsed.rule);
  redirect(`/regole?ok=${encodeURIComponent(`Regola "${parsed.rule.name}" salvata`)}`);
}

export async function toggleRule(form: FormData): Promise<void> {
  const user = await requireUser();
  await sql()`UPDATE rules SET enabled = NOT enabled WHERE id = ${String(form.get("id"))} AND agency_id = ${user.agencyId}`;
  revalidatePath("/regole");
}

export async function deleteRule(form: FormData): Promise<void> {
  const user = await requireUser();
  await sql()`DELETE FROM rules WHERE id = ${String(form.get("id"))} AND agency_id = ${user.agencyId}`;
  revalidatePath("/regole");
}

export async function runAllRules(): Promise<void> {
  const user = await requireUser();
  const results = await runRules(user.agencyId);
  const suggested = results.reduce((s, r) => s + r.suggested, 0);
  const applied = results.reduce((s, r) => s + r.applied, 0);
  const failed = results.reduce((s, r) => s + r.failed, 0);
  const msg = `Regole eseguite: ${suggested} nuovi suggerimenti, ${applied} modifiche applicate${failed ? `, ${failed} errori` : ""}`;
  redirect(`/regole?ok=${encodeURIComponent(msg)}`);
}
