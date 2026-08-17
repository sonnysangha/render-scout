import { Render } from "@renderinc/sdk";
import { getPool } from "./db";
import { getRedis } from "./redis";

export type Audit = {
  id: number;
  url: string;
  status: string;
  report: unknown;
  created_at: Date;
};

const workflowSlug = process.env.WORKFLOW_SLUG ?? "scout";

export async function listAudits(): Promise<Audit[]> {
  const { rows } = await getPool().query<Audit>(
    `SELECT id, url, status, report, created_at
     FROM audits
     ORDER BY created_at DESC
     LIMIT 20`,
  );
  return rows;
}

export async function getAudit(id: number): Promise<Audit | null> {
  const cached = await getRedis().get(`audit:${id}`);
  if (cached) {
    return JSON.parse(cached) as Audit;
  }

  const { rows } = await getPool().query<Audit>(
    `SELECT id, url, status, report, created_at FROM audits WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createAudit(url: string): Promise<Audit> {
  const { rows } = await getPool().query<Audit>(
    `INSERT INTO audits (url, status) VALUES ($1, 'queued') RETURNING id, url, status, report, created_at`,
    [url],
  );
  const audit = rows[0];
  if (!audit) {
    throw new Error("failed to create audit");
  }

  await getRedis().set(`audit:${audit.id}`, JSON.stringify(audit));
  const render = new Render();
  await render.workflows.startTask(`${workflowSlug}/startAudit`, [
    audit.id,
    audit.url,
  ]);
  return audit;
}
