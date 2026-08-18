import { getPool } from "../lib/db";

async function main() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS script_runs (
      id SERIAL PRIMARY KEY,
      public_id UUID NOT NULL UNIQUE,
      prompt TEXT NOT NULL,
      request_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      research TEXT,
      hooks TEXT,
      outline TEXT,
      audience TEXT,
      final_script TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS script_runs_request_key_created_at_idx
    ON script_runs (request_key, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS script_runs_created_at_idx
    ON script_runs (created_at DESC)
  `);

  await pool.end();
  console.log("migrated");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
