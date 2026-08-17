import { Redis } from "ioredis";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    redis = new Redis(url);
  }
  return redis;
}
