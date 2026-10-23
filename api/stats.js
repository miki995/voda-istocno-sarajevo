import { getStore } from '../src/store.js';
import { isAuthorized, sendJson } from '../src/http.js';
import { loadStats } from '../src/stats.js';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  try {
    return sendJson(res, 200, await loadStats(getStore()));
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
