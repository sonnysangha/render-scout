import { Pool } from "pg";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export type Specialist = "research" | "hooks" | "outline" | "audience";

export async function setRunStatus(
  id: number,
  status: "running" | "synthesizing",
): Promise<void> {
  await getPool().query(
    `UPDATE script_runs SET status = $2, updated_at = NOW() WHERE id = $1`,
    [id, status],
  );
}

export async function saveSpecialistOutput(
  id: number,
  specialist: Specialist,
  output: string,
): Promise<void> {
  const column = {
    research: "research",
    hooks: "hooks",
    outline: "outline",
    audience: "audience",
  }[specialist];
  await getPool().query(
    `UPDATE script_runs SET ${column} = $2, updated_at = NOW() WHERE id = $1`,
    [id, output],
  );
}

export async function completeRun(id: number, script: string): Promise<void> {
  await getPool().query(
    `UPDATE script_runs
     SET status = 'done', final_script = $2, error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id, script],
  );
}

export async function failRun(id: number, message: string): Promise<void> {
  await getPool().query(
    `UPDATE script_runs
     SET status = 'failed', error = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, message],
  );
}
