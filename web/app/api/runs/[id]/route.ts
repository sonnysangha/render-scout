import { getRun } from "@/lib/runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "invalid run id" }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(run);
}
