import Redis from "ioredis";

let cache: Redis | undefined;

function getCache(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }
  if (!cache) {
    cache = new Redis(url, {
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => (attempt === 1 ? 200 : null),
    });
    cache.on("error", () => undefined);
  }
  return cache;
}

export async function readCache(key: string): Promise<string | null> {
  try {
    return (await getCache()?.get(key)) ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await getCache()?.set(key, value, "EX", ttlSeconds);
  } catch {
    // Cache misses must never make the Postgres-backed app unavailable.
  }
}
