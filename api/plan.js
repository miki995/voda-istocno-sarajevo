import { loadPlan, runCron } from '../src/core.js';
import { getStore } from '../src/store.js';
import { sendJson } from '../src/http.js';

const CRON_KEY = 'cron:last';
const SILENT_MS = 10 * 60 * 1000;
const BUCKET_MS = 5 * 60 * 1000;

// The scheduled job is not always on time (GitHub delays or drops runs), so a visitor who finds the data
// stale refreshes it. Only the first one in every five minutes does the work.
async function refreshIfSilent(store, cron, now) {
  if (cron && now - cron.at < SILENT_MS) {
    return false;
  }
  if ((await store.incr(`cron:claim:${Math.floor(now / BUCKET_MS)}`)) !== 1) {
    return false;
  }
  await runCron(store, process.env, now).catch(error => console.error('refresh on visit failed', error.message));
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const store = getStore();
    let cron = await store.get(CRON_KEY);
    if (await refreshIfSilent(store, cron, Date.now())) {
      cron = await store.get(CRON_KEY);
    }
    return sendJson(res, 200, { ...(await loadPlan(store)), checkedAt: cron?.at ?? 0, problem: cron?.problem ?? null });
  } catch {
    return sendJson(res, 500, { error: 'Server error' });
  }
}
