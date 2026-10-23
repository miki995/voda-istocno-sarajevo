import { runCron } from '../src/core.js';
import { getStore } from '../src/store.js';
import { isAuthorized, sendJson } from '../src/http.js';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  try {
    return sendJson(res, 200, await runCron(getStore(), process.env));
  } catch (error) {
    console.error('cron failed', error.message);
    return sendJson(res, 500, { error: 'Server error' });
  }
}
