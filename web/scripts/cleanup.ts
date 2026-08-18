import { getPool } from "../lib/db";

async function main() {
  const pool = getPool();
  try {
    const result = await pool.query(
      "DELETE FROM script_runs WHERE created_at < NOW() - INTERVAL '7 days'",
    );
    console.log(`deleted=${result.rowCount ?? 0} retention_days=7`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
