import { timingSafeEqual } from 'node:crypto';
import { runCron } from '../src/core.js';
import { getStore } from '../src/store.js';
import { sendJson } from '../src/http.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const given = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

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
