import { Redis } from '@upstash/redis';

function memoryStore() {
  const values = new Map();
  const sets = new Map();
  return {
    persistent: false,
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
    },
    async del(key) {
      values.delete(key);
    },
    async sadd(key, member) {
      sets.set(key, new Set([...(sets.get(key) ?? []), member]));
    },
    async srem(key, member) {
      sets.get(key)?.delete(member);
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async scard(key) {
      return sets.get(key)?.size ?? 0;
    },
    async incr(key) {
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    },
    async decr(key) {
      const next = (values.get(key) ?? 0) - 1;
      values.set(key, next);
      return next;
    },
    async mget(keys) {
      return keys.map(key => (values.has(key) ? structuredClone(values.get(key)) : null));
    },
    async expire(key, seconds) {
      setTimeout(() => values.delete(key), seconds * 1000).unref?.();
    },
  };
}

function redisStore(redis) {
  return {
    persistent: true,
    async get(key) {
      return (await redis.get(key)) ?? null;
    },
    async set(key, value) {
      await redis.set(key, value);
    },
    async del(key) {
      await redis.del(key);
    },
    async sadd(key, member) {
      await redis.sadd(key, member);
    },
    async srem(key, member) {
      await redis.srem(key, member);
    },
    async smembers(key) {
      return redis.smembers(key);
    },
    async scard(key) {
      return redis.scard(key);
    },
    async incr(key) {
      return redis.incr(key);
    },
    async decr(key) {
      return redis.decr(key);
    },
    async mget(keys) {
      return keys.length === 0 ? [] : (await redis.mget(...keys)).map(value => value ?? null);
    },
    async expire(key, seconds) {
      await redis.expire(key, seconds);
    },
  };
}

let cached;

export function getStore(env = process.env) {
  if (cached) {
    return cached;
  }
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) {
    cached = redisStore(new Redis({ url, token }));
  } else if (env.VERCEL) {
    throw new Error('Redis is not configured');
  } else {
    cached = memoryStore();
  }
  return cached;
}
