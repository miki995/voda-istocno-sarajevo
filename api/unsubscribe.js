import { removeSubscription } from '../src/core.js';
import { getStore } from '../src/store.js';
import { readBody, sendJson } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Metoda nije dozvoljena' });
  }
  const body = readBody(req);
  if (typeof body?.endpoint !== 'string') {
    return sendJson(res, 400, { error: 'Nedostaje endpoint' });
  }
  try {
    await removeSubscription(getStore(), body.endpoint);
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, { error: 'Greška servera' });
  }
}
