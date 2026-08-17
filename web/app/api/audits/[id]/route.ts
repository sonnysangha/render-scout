import { getAudit } from "@/lib/audits";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const audit = await getAudit(Number(id));
  if (!audit) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(audit);
}
