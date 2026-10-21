import { loadZonePlaces } from '../src/core.js';
import { getStore } from '../src/store.js';
import { sendJson } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    return sendJson(res, 200, await loadZonePlaces(getStore()));
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
