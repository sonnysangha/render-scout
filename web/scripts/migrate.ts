import { getPool } from "../lib/db";

const pool = getPool();

await pool.query(`
  CREATE TABLE IF NOT EXISTS audits (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

await pool.end();
console.log("migrated");
