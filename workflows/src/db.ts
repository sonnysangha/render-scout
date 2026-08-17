import { Pool } from "pg";
import { Redis } from "ioredis";

let pool: Pool | undefined;
let redis: Redis | undefined;

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

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is not set");
    }
    redis = new Redis(redisUrl);
  }
  return redis;
}

export async function setAudit(
  id: number,
  fields: { status: string; report?: unknown },
): Promise<void> {
  if (fields.report !== undefined) {
    await getPool().query(
      `UPDATE audits SET status = $2, report = $3 WHERE id = $1`,
      [id, fields.status, JSON.stringify(fields.report)],
    );
  } else {
    await getPool().query(`UPDATE audits SET status = $2 WHERE id = $1`, [
      id,
      fields.status,
    ]);
  }

  const { rows } = await getPool().query(
    `SELECT id, url, status, report, created_at FROM audits WHERE id = $1`,
    [id],
  );
  if (rows[0]) {
    await getRedis().set(`audit:${id}`, JSON.stringify(rows[0]));
  }
}
