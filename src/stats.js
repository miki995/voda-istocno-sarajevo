import { LANGUAGES } from './messages.js';
import { dayKey } from './time.js';

const VISITOR_PATTERN = /^[a-z0-9-]{8,40}$/;
const SUBS_SET = 'subs';
const TOP_WATCHES = 10;

const visitorsKey = day => `stat:visitors:${day}`;
const opensKey = day => `stat:opens:${day}`;
const appKey = day => `stat:app:${day}`;
const langKey = (day, lang) => `stat:lang:${day}:${lang}`;
const pushKey = (day, outcome) => `stat:push:${day}:${outcome}`;
const SOURCE_PATTERN = /^[a-z0-9_-]{1,24}$/;
const SOURCES_SET = 'stat:sources';
const sourceKey = (day, source) => `stat:src:${day}:${source}`;
const inAppKey = day => `stat:inapp:${day}`;
const CRON_KEY = 'cron:last';
const HEALTH_KEY = 'health';

export function sanitizeHit(body) {
  if (typeof body?.visitor !== 'string' || !VISITOR_PATTERN.test(body.visitor)) {
    return null;
  }
  return {
    visitor: body.visitor,
    lang: LANGUAGES.includes(body.lang) ? body.lang : null,
    standalone: body.standalone === true,
    source: typeof body.source === 'string' && SOURCE_PATTERN.test(body.source) ? body.source : null,
    inApp: body.inApp === true,
  };
}

export async function recordHit(store, hit, now = Date.now()) {
  const day = dayKey(now);
  await Promise.all([
    store.sadd(visitorsKey(day), hit.visitor),
    store.incr(opensKey(day)),
    hit.standalone ? store.incr(appKey(day)) : null,
    hit.lang ? store.incr(langKey(day, hit.lang)) : null,
    hit.source ? store.sadd(SOURCES_SET, hit.source) : null,
    hit.source ? store.incr(sourceKey(day, hit.source)) : null,
    hit.inApp ? store.incr(inAppKey(day)) : null,
  ]);
}

// outcome: 'ok' (delivered), 'failed' (push service refused it) or 'gone' (device unsubscribed and was removed)
export async function recordPush(store, outcome, now = Date.now()) {
  await store.incr(pushKey(dayKey(now), outcome));
}

export async function recordCron(store, info) {
  await store.set(CRON_KEY, info);
}

function previousDays(now, count) {
  return Array.from({ length: count }, (_, index) => dayKey(now - index * 24 * 60 * 60 * 1000));
}

async function topWatches(store) {
  const records = await Promise.all((await store.smembers(SUBS_SET)).map(id => store.get(`sub:${id}`)));
  const counts = new Map();
  for (const watch of records.flatMap(record => record?.watches ?? [])) {
    const label = watch.kind === 'ZONE' ? `Zone ${watch.value}` : watch.value;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, TOP_WATCHES)
    .map(([watch, subscribers]) => ({ watch, subscribers }));
}

export async function loadStats(store, now = Date.now(), days = 30) {
  const rows = await Promise.all(
    previousDays(now, days).map(async day => {
      const [visitors, opens, app, sr, srLatn, en, pushOk, pushFailed, pushGone, inApp] = await Promise.all([
        store.scard(visitorsKey(day)),
        store.get(opensKey(day)),
        store.get(appKey(day)),
        store.get(langKey(day, 'sr')),
        store.get(langKey(day, 'sr-Latn')),
        store.get(langKey(day, 'en')),
        store.get(pushKey(day, 'ok')),
        store.get(pushKey(day, 'failed')),
        store.get(pushKey(day, 'gone')),
        store.get(inAppKey(day)),
      ]);
      return { day, visitors, opens: opens ?? 0, appOpens: app ?? 0, sr: sr ?? 0, srLatn: srLatn ?? 0, en: en ?? 0, pushOk: pushOk ?? 0, pushFailed: pushFailed ?? 0, pushGone: pushGone ?? 0, inApp: inApp ?? 0 };
    }),
  );
  const days30 = previousDays(now, days);
  const sources = await Promise.all(
    (await store.smembers(SOURCES_SET)).map(async source => {
      const counts = await Promise.all(days30.map(day => store.get(sourceKey(day, source))));
      return { source, visits: counts.reduce((total, count) => total + (count ?? 0), 0) };
    }),
  );
  return {
    sources: sources.filter(item => item.visits > 0).sort((first, second) => second.visits - first.visits),
    subscribers: await store.scard(SUBS_SET),
    lastCron: await store.get(CRON_KEY),
    sourceProblem: await store.get(HEALTH_KEY),
    topWatches: await topWatches(store),
    days: rows,
  };
}
