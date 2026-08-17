"use server";

import { redirect } from "next/navigation";
import { createAudit } from "@/lib/audits";
import { isRedditPostUrl } from "@/lib/reddit-url";

export async function startAudit(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    redirect("/?error=reddit");
  }

  try {
    new URL(url);
  } catch {
    redirect("/?error=reddit");
  }

  if (!isRedditPostUrl(url)) {
    redirect("/?error=reddit");
  }

  const audit = await createAudit(url);
  redirect(`/?id=${audit.id}`);
}
