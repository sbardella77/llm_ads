"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { syncAll } from "@/lib/sync";

export async function syncNow(): Promise<void> {
  const user = await requireUser();
  await syncAll(user.agencyId);
  revalidatePath("/");
}
