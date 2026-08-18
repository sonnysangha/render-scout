"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRun, RunLimitError } from "@/lib/runs";

async function requestKey(): Promise<string> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_SECRET is not set");
  }
  const requestHeaders = await headers();
  const forwardedIp = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const identity =
    forwardedIp ||
    requestHeaders.get("x-real-ip") ||
    `local:${requestHeaders.get("user-agent") ?? "unknown"}`;
  return createHmac("sha256", secret || "draftroom-local")
    .update(identity)
    .digest("hex");
}

export async function startScript(formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (prompt.length < 10) {
    redirect("/?error=prompt");
  }
  if (prompt.length > 4_000) {
    redirect("/?error=long");
  }

  let publicId: string;
  try {
    ({ publicId } = await createRun(prompt, await requestKey()));
  } catch (error) {
    redirect(error instanceof RunLimitError ? "/?error=limit" : "/?error=service");
  }
  redirect(`/?id=${publicId}`);
}
