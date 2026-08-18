import { Render } from "@renderinc/sdk";
import { getPool } from "../lib/db";
import { isRedditPostUrl } from "../lib/reddit-url";

async function main() {
  const workflowSlug = process.env.WORKFLOW_SLUG ?? "scout";
  const render = new Render();
  const pool = getPool();

  const { rows } = await pool.query<{ url: string }>(
    `SELECT url
     FROM (
       SELECT DISTINCT ON (COALESCE(report #>> '{post,id}', url))
         url,
         created_at
       FROM audits
       WHERE status = 'done'
       ORDER BY COALESCE(report #>> '{post,id}', url), created_at DESC
     ) AS latest
     ORDER BY created_at DESC
     LIMIT 5`,
  );

  for (const row of rows) {
    if (!isRedditPostUrl(row.url)) {
      continue;
    }
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
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
