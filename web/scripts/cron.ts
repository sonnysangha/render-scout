import { Render } from "@renderinc/sdk";
import { getPool } from "../lib/db";

const workflowSlug = process.env.WORKFLOW_SLUG ?? "scout";
const render = new Render();
const pool = getPool();

const { rows } = await pool.query<{ url: string }>(
  `SELECT DISTINCT ON (url) url
   FROM audits
   ORDER BY url, created_at DESC
   LIMIT 5`,
);

for (const row of rows) {
  const inserted = await pool.query<{ id: number; url: string }>(
    `INSERT INTO audits (url, status) VALUES ($1, 'queued') RETURNING id, url`,
    [row.url],
  );
  const audit = inserted.rows[0];
  if (!audit) {
    continue;
  }

  await render.workflows.startTask(`${workflowSlug}/startAudit`, [
    audit.id,
    audit.url,
  ]);
  console.log(`started ${workflowSlug}/startAudit for ${audit.url}`);
}

await pool.end();
