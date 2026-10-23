import { getStore } from '../src/store.js';
import { readBody, sendJson } from '../src/http.js';
import { recordHit, sanitizeHit } from '../src/stats.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const hit = sanitizeHit(readBody(req));
  if (!hit) {
    return sendJson(res, 400, { error: 'Invalid hit' });
  }
  try {
    await recordHit(getStore(), hit);
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
