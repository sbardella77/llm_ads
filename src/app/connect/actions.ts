"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { connectAdAccount } from "@/lib/connect";

export interface ConnectState {
  error?: string;
}

export async function connect(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const user = await requireUser();
  const result = await connectAdAccount({
    agencyId: user.agencyId,
    clientName: String(form.get("clientName") ?? ""),
    monthlyBudgetEur: Number(String(form.get("budget") ?? "").replace(",", ".")),
    apiKey: String(form.get("apiKey") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  redirect(`/?collegato=${encodeURIComponent(result.accountName)}`);
}
