import { LANGUAGES } from './messages.js';
import { dayKey } from './time.js';

const VISITOR_PATTERN = /^[a-z0-9-]{8,40}$/;
const SUBS_SET = 'subs';
const TOP_WATCHES = 10;

const visitorsKey = day => `stat:visitors:${day}`;
const opensKey = day => `stat:opens:${day}`;
const appKey = day => `stat:app:${day}`;
const langKey = (day, lang) => `stat:lang:${day}:${lang}`;

export function sanitizeHit(body) {
  if (typeof body?.visitor !== 'string' || !VISITOR_PATTERN.test(body.visitor)) {
    return null;
  }
  return {
    visitor: body.visitor,
    lang: LANGUAGES.includes(body.lang) ? body.lang : null,
    standalone: body.standalone === true,
  };
}

export async function recordHit(store, hit, now = Date.now()) {
  const day = dayKey(now);
  await Promise.all([
    store.sadd(visitorsKey(day), hit.visitor),
    store.incr(opensKey(day)),
    hit.standalone ? store.incr(appKey(day)) : null,
    hit.lang ? store.incr(langKey(day, hit.lang)) : null,
  ]);
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
      const [visitors, opens, app, sr, en] = await Promise.all([
        store.scard(visitorsKey(day)),
        store.get(opensKey(day)),
        store.get(appKey(day)),
        store.get(langKey(day, 'sr')),
        store.get(langKey(day, 'en')),
      ]);
      return { day, visitors, opens: opens ?? 0, appOpens: app ?? 0, sr: sr ?? 0, en: en ?? 0 };
    }),
  );
  return {
    subscribers: await store.scard(SUBS_SET),
    topWatches: await topWatches(store),
    days: rows,
  };
}
