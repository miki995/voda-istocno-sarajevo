import { removeSubscription } from '../src/core.js';
import { getStore } from '../src/store.js';
import { readBody, sendJson } from '../src/http.js';
import { rateLimited } from '../src/ratelimit.js';

export default async function handler(req, res) {
  if (await rateLimited(req, 'unsubscribe', 30)) {
    return sendJson(res, 429, { error: 'Too many requests' });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const body = readBody(req);
  if (typeof body?.endpoint !== 'string') {
    return sendJson(res, 400, { error: 'Missing endpoint' });
  }
  try {
    await removeSubscription(getStore(), body.endpoint);
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
