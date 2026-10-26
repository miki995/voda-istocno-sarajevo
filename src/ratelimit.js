import { getStore } from './store.js';

// A counter per caller and minute. The keys expire by themselves after two minutes; the address is only held that long.
// The address is taken from what the platform sets (Vercel overwrites these headers), never from the first entry of
// X-Forwarded-For, which a caller can write himself. Without a platform header the last entry (added by the nearest
// proxy) is used.
export function clientIp(req) {
  const header = name => String(req.headers?.[name] ?? '').split(',').map(part => part.trim()).filter(Boolean);
  return header('x-vercel-forwarded-for')[0] ?? header('x-real-ip')[0] ?? header('x-forwarded-for').at(-1) ?? req.socket?.remoteAddress ?? 'unknown';
}

function counterKey(name, req, windowSeconds, now) {
  return `rl:${name}:${clientIp(req)}:${Math.floor(now / (windowSeconds * 1000))}`;
}

async function count(store, name, req, windowSeconds, now) {
  const key = counterKey(name, req, windowSeconds, now);
  const used = await store.incr(key);
  if (used === 1) {
    await store.expire(key, windowSeconds * 2);
  }
  return used;
}

// Fails open: if the store cannot be reached, nobody is blocked because of it.
export async function allow(store, name, req, limit, windowSeconds = 60, now = Date.now()) {
  try {
    return (await count(store, name, req, windowSeconds, now)) <= limit;
  } catch {
    return true;
  }
}

// Fails closed: for endpoints that cost something (they send mail), an unreachable store is an error, not a free pass.
export async function allowStrict(store, name, req, limit, windowSeconds = 60, now = Date.now()) {
  return (await count(store, name, req, windowSeconds, now)) <= limit;
}

// Hands back one try, for when the failure was ours and not the caller's.
export async function refund(store, name, req, windowSeconds = 60, now = Date.now()) {
  try {
    await store.decr(counterKey(name, req, windowSeconds, now));
  } catch {
    // nothing to hand back if the store is unreachable
  }
}

// true when this caller has used up its allowance for the current window
export async function rateLimited(req, name, limit, windowSeconds = 60) {
  try {
    return !(await allow(getStore(), name, req, limit, windowSeconds));
  } catch {
    return false;
  }
}
