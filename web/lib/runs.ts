import { Render } from "@renderinc/sdk";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";

export type RunStatus =
  | "queued"
  | "running"
  | "synthesizing"
  | "done"
  | "failed";

export type ScriptRun = {
  id: string;
  status: RunStatus;
  research: string | null;
  hooks: string | null;
  outline: string | null;
  audience: string | null;
  final_script: string | null;
};

type RunRow = Omit<ScriptRun, "id"> & {
  public_id: string;
};

export class RunLimitError extends Error {}

const workflowSlug = process.env.WORKFLOW_SLUG ?? "draftroom";
const globalLockKey = "draftroom:global-runs";
const activeWindow = "20 minutes";
const hourlyWindow = "1 hour";
const clientActiveLimit = 1;
const clientHourlyLimit = 3;
const globalActiveLimit = 2;
const globalHourlyLimit = 12;

const runColumns = `
  public_id,
  status,
  research,
  hooks,
  outline,
  audience,
  final_script
`;

function toScriptRun(row: RunRow): ScriptRun {
  return {
    id: row.public_id,
    status: row.status,
    research: row.research,
    hooks: row.hooks,
    outline: row.outline,
    audience: row.audience,
    final_script: row.final_script,
  };
}

export async function getRun(publicId: string): Promise<ScriptRun | null> {
  const { rows } = await getPool().query<RunRow>(
    `SELECT ${runColumns} FROM script_runs WHERE public_id = $1`,
    [publicId],
  );
  return rows[0] ? toScriptRun(rows[0]) : null;
}

export async function createRun(
  prompt: string,
  requestKey: string,
): Promise<{ publicId: string }> {
  const client = await getPool().connect();
  const publicId = randomUUID();
  let runId: number;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      globalLockKey,
    ]);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      requestKey,
    ]);
    const { rows: usageRows } = await client.query<{
      client_active: number;
      client_recent: number;
      global_active: number;
      global_recent: number;
    }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE request_key = $1
             AND status IN ('queued', 'running', 'synthesizing')
             AND updated_at > NOW() - $2::interval
         )::int AS client_active,
         COUNT(*) FILTER (
           WHERE request_key = $1
             AND created_at > NOW() - $3::interval
             AND NOT (status = 'failed' AND error LIKE 'dispatch:%')
         )::int AS client_recent,
         COUNT(*) FILTER (
           WHERE status IN ('queued', 'running', 'synthesizing')
             AND updated_at > NOW() - $2::interval
         )::int AS global_active,
         COUNT(*) FILTER (
           WHERE created_at > NOW() - $3::interval
             AND NOT (status = 'failed' AND error LIKE 'dispatch:%')
         )::int AS global_recent
       FROM script_runs
       WHERE created_at > NOW() - $3::interval
          OR updated_at > NOW() - $2::interval`,
      [requestKey, activeWindow, hourlyWindow],
    );
    const usage = usageRows[0] ?? {
      client_active: 0,
      client_recent: 0,
      global_active: 0,
      global_recent: 0,
    };
    if (usage.client_active >= clientActiveLimit) {
      throw new RunLimitError("A script is already running for this client.");
    }
    if (usage.client_recent >= clientHourlyLimit) {
      throw new RunLimitError("The hourly script limit has been reached.");
    }
    if (
      usage.global_active >= globalActiveLimit ||
      usage.global_recent >= globalHourlyLimit
    ) {
      throw new RunLimitError("Draftroom is currently at capacity.");
    }

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO script_runs (public_id, prompt, request_key)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [publicId, prompt, requestKey],
    );
    const created = rows[0];
    if (!created) {
      throw new Error("Could not create the script run.");
    }
    runId = created.id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  try {
    const render = new Render();
    await render.workflows.startTask(`${workflowSlug}/writeYouTubeScript`, [
      runId,
      prompt,
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start the workflow.";
    await getPool().query(
      `UPDATE script_runs
       SET status = 'failed', error = $2, updated_at = NOW()
       WHERE id = $1`,
      [runId, `dispatch:${message}`],
    );
  }

  return { publicId };
}
