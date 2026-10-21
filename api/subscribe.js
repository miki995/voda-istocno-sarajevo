import { isValidSubscription, saveSubscription } from '../src/core.js';
import { getStore } from '../src/store.js';
import { readBody, sendJson } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const body = readBody(req);
  if (!isValidSubscription(body?.subscription)) {
    return sendJson(res, 400, { error: 'Invalid subscription' });
  }
  try {
    const watches = await saveSubscription(getStore(), body.subscription, body.watches, body.lang);
    return sendJson(res, 200, { ok: true, watches });
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
