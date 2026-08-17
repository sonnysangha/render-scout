"use server";

import { redirect } from "next/navigation";
import { createAudit } from "@/lib/audits";

export async function startAudit(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    throw new Error("url is required");
  }

  try {
    new URL(url);
  } catch {
    throw new Error("url is invalid");
  }

  const audit = await createAudit(url);
  redirect(`/?id=${audit.id}`);
}
