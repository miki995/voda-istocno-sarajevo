import { buildPushPayload } from '@block65/webcrypto-web-push';
import { parseCalendarEvents, selectRecentNoticeEvents, selectUpcomingPlanEvents } from './events.js';
import { extrasToNotices, parseNotice } from './notices.js';
import { mergePlacesByZone, parsePlan } from './parser.js';
import { dayKey } from './time.js';
import { normalizeLanguage } from './messages.js';
import { eveningNotifications, limitNotifications, noticeNotifications, planNotifications, pruneSent } from './notify.js';
import { fold } from './text.js';
import { checkHealth } from './health.js';
import { recordCron, recordPush } from './stats.js';
import zonesSeed from './zones-seed.json' with { type: 'json' };

const SOURCE_URL = 'https://vikis.info/';
const EVENT_URL = 'https://vikis.info/sr/event/show/';
const UPCOMING_REFRESH_MS = 30 * 60 * 1000;
const NOTICES_REFRESH_MS = 10 * 60 * 1000;
const MAX_NOTICES = 20;
const MAX_WATCHES = 30;
const ZONES = ['I', 'II', 'III'];
const SUBS_SET = 'subs';
const HOUR_MS = 60 * 60 * 1000;

const subKey = id => `sub:${id}`;

export async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sanitizeWatches(rawWatches) {
  if (!Array.isArray(rawWatches)) {
    return [];
  }
  const unique = new Map();
  for (const raw of rawWatches.slice(0, MAX_WATCHES)) {
    if (raw?.kind === 'ZONE' && ZONES.includes(raw.value)) {
      unique.set(`ZONE:${raw.value}`, { kind: 'ZONE', value: raw.value });
    } else if (raw?.kind === 'PLACE' && typeof raw.value === 'string') {
      const value = raw.value.trim().slice(0, 60);
      if (fold(value).length >= 3) {
        unique.set(`PLACE:${fold(value)}`, { kind: 'PLACE', value });
      }
    }
  }
  return [...unique.values()];
}

export function isValidSubscription(subscription) {
  return (
    typeof subscription?.endpoint === 'string' &&
    subscription.endpoint.startsWith('https://') &&
    typeof subscription?.keys?.auth === 'string' &&
    typeof subscription?.keys?.p256dh === 'string'
  );
}

export async function loadPlan(store) {
  const plan = (await store.get('plan')) ?? { fetchedAt: 0, status: '', closures: [] };
  return { ...plan, notices: plan.notices ?? [] };
}

export async function loadZonePlaces(store) {
  return (await store.get('zonePlaces')) ?? zonesSeed;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'voda-istocno-sarajevo/1.0' } });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.text();
}

// The site is read by pattern, so a changed layout shows up as a page we can no longer make sense of.
function findProblem(homeHtml, parsed, notices = []) {
  if (parsed.unparsedHeaders.length > 0) {
    return { kind: 'unparsed-header', detail: ['Zaglavlja koja parser ne razumije:', ...parsed.unparsedHeaders].join('\n') };
  }
  if (parseCalendarEvents(homeHtml).length === 0 && parsed.closures.length === 0) {
    return { kind: 'layout-changed', detail: 'Na početnoj stranici nema ni kalendara ni plana redukcije. Moguće je da se promijenio izgled sajta.' };
  }
  const unreadable = notices.filter(notice => notice.id.startsWith('notice-') && notice.lines.length === 0);
  if (unreadable.length > 0) {
    return { kind: 'notice-unreadable', detail: `Ne mogu da pročitam tekst ${unreadable.length} obavještenja (promijenila se struktura stranice obavještenja?):\n${unreadable.map(notice => `${notice.date} ${notice.title} (${notice.id})`).join('\n')}` };
  }
  return null;
}

function reportUnparsed(headers) {
  for (const header of headers) {
    console.error('could not read closure header:', header);
  }
}

async function loadUpcoming(store, homeHtml, now) {
  const events = selectUpcomingPlanEvents(parseCalendarEvents(homeHtml), dayKey(now));
  const idsKey = events.map(event => event.id).join(',');
  const cached = await store.get('upcoming');
  const cachedGroup = cached && { closures: cached.closures, extras: cached.extras ?? [] };
  if (cached && cached.idsKey === idsKey && cached.extras && now - cached.fetchedAt < UPCOMING_REFRESH_MS) {
    return cachedGroup;
  }
  const results = await Promise.allSettled(events.map(event => fetchText(`${EVENT_URL}${event.id}`)));
  const failed = results.some(result => result.status === 'rejected');
  if (failed && cached) {
    return cachedGroup;
  }
  const pages = results.flatMap((result, index) => (result.status === 'fulfilled' ? [{ event: events[index], page: parsePlan(result.value) }] : []));
  pages.forEach(({ page }) => reportUnparsed(page.unparsedHeaders));
  const closures = pages.flatMap(({ page }) => page.closures);
  const extras = pages.flatMap(({ event, page }) => extrasToNotices(page.extras, event.date, event.id));
  await store.set('upcoming', { idsKey, fetchedAt: now, closures, extras });
  return { closures, extras };
}

async function loadNotices(store, homeHtml, now) {
  const events = selectRecentNoticeEvents(parseCalendarEvents(homeHtml), dayKey(now)).slice(0, MAX_NOTICES);
  const idsKey = events.map(event => event.id).join(',');
  const cached = await store.get('notices');
  if (cached && cached.idsKey === idsKey && now - cached.fetchedAt < NOTICES_REFRESH_MS) {
    return cached.notices;
  }
  // A notice that was read with no text is fetched again, so a fixed parser clears the alert instead of waiting for it to age out.
  const known = new Map((cached?.notices ?? []).filter(notice => notice.lines.length > 0).map(notice => [notice.id, notice]));
  const results = await Promise.allSettled(
    events.map(async event => known.get(`notice-${event.id}`) ?? parseNotice(event, await fetchText(`${EVENT_URL}${event.id}`))),
  );
  const notices = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (notices.length < events.length && cached) {
    return cached.notices;
  }
  await store.set('notices', { idsKey, fetchedAt: now, notices });
  return notices;
}

function mergeNotices(...groups) {
  const byId = new Map(groups.flat().map(notice => [notice.id, notice]));
  return [...byId.values()].sort((first, second) => second.date.localeCompare(first.date));
}

function mergeClosures(...groups) {
  const byId = new Map();
  for (const closure of groups.flat()) {
    if (!byId.has(closure.id)) {
      byId.set(closure.id, closure);
    }
  }
  return [...byId.values()].sort((first, second) => first.start - second.start);
}

export async function refreshPlan(store, now) {
  const homeHtml = await fetchText(SOURCE_URL);
  const parsed = parsePlan(homeHtml);
  reportUnparsed(parsed.unparsedHeaders);
  const upcoming = await loadUpcoming(store, homeHtml, now).catch(() => ({ closures: [], extras: [] }));
  const closures = mergeClosures(parsed.closures, upcoming.closures);
  const previous = await loadPlan(store);
  const published = await loadNotices(store, homeHtml, now).catch(() => previous.notices.filter(notice => notice.id.startsWith('notice-')));
  const notices = mergeNotices(extrasToNotices(parsed.extras, dayKey(now), 'home'), upcoming.extras, published);
  const closuresChanged = JSON.stringify(previous.closures) !== JSON.stringify(closures);
  const noticesChanged = JSON.stringify(previous.notices) !== JSON.stringify(notices);
  const plan = { fetchedAt: now, status: parsed.status, closures, notices };
  const problem = findProblem(homeHtml, parsed, notices);

  if (closuresChanged || noticesChanged || now - previous.fetchedAt > HOUR_MS) {
    await store.set('plan', plan);
  }
  if (closuresChanged) {
    await store.set('zonePlaces', mergePlacesByZone(await loadZonePlaces(store), closures));
  }
  return { plan, problem };
}

async function sendPush(env, subscription, message) {
  const payload = await buildPushPayload(
    { data: message, options: { ttl: 6 * HOUR_MS / 1000, urgency: 'high' } },
    subscription,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  );
  return fetch(subscription.endpoint, payload);
}

async function notifySubscriber(store, env, plan, now, id, record) {
  if (!record) {
    await store.srem(SUBS_SET, id);
    return 0;
  }
  const planned = planNotifications({ closures: plan.closures, watches: record.watches, sent: record.sent, now, lang: record.lang });
  const evening = eveningNotifications({
    closures: plan.closures,
    watches: record.watches,
    sent: record.sent,
    now,
    lang: record.lang,
    skipIds: planned.map(notification => notification.closureId),
  });
  const notifications = limitNotifications(
    [
      ...planned,
      ...evening,
      ...noticeNotifications({ notices: plan.notices, watches: record.watches, sent: record.sent, now, lang: record.lang }),
    ],
    record.lang,
  );
  let delivered = 0;
  for (const notification of notifications) {
    const response = await sendPush(env, record.subscription, {
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      lang: normalizeLanguage(record.lang),
    }).catch(() => null);
    if (response?.status === 404 || response?.status === 410) {
      await recordPush(store, 'gone', now);
      await store.del(subKey(id));
      await store.srem(SUBS_SET, id);
      return delivered;
    }
    if (response?.ok) {
      record.sent.push(...notification.markSent);
      delivered += 1;
      await recordPush(store, 'ok', now);
    } else {
      await recordPush(store, 'failed', now);
    }
  }
  const prunedSent = pruneSent(record.sent, [...plan.closures, ...plan.notices]);
  if (delivered > 0 || prunedSent.length !== record.sent.length) {
    await store.set(subKey(id), { ...record, sent: prunedSent });
  }
  return delivered;
}

const GROUP_SIZE = 25;
const READ_SIZE = 200;
const TIME_BUDGET_MS = 22000;

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// All records are read with one command per 200 subscribers and sent in groups of 25. If the time runs out the rest
// waits for the next run; the order is shuffled so the same people are not always last.
export async function dispatchNotifications(store, env, plan, now) {
  const ids = shuffled(await store.smembers(SUBS_SET));
  const started = Date.now();
  let delivered = 0;
  let skipped = 0;
  for (let offset = 0; offset < ids.length; offset += READ_SIZE) {
    const batch = ids.slice(offset, offset + READ_SIZE);
    if (Date.now() - started > TIME_BUDGET_MS) {
      skipped += batch.length;
      continue;
    }
    const records = await store.mget(batch.map(subKey));
    for (let start = 0; start < batch.length; start += GROUP_SIZE) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped += batch.length - start;
        break;
      }
      const counts = await Promise.all(batch.slice(start, start + GROUP_SIZE).map((id, index) => notifySubscriber(store, env, plan, now, id, records[start + index])));
      delivered += counts.reduce((total, count) => total + count, 0);
    }
  }
  return { delivered, skipped };
}

export async function runCron(store, env, now = Date.now()) {
  let planError = '';
  let problem = null;
  let plan;
  try {
    ({ plan, problem } = await refreshPlan(store, now));
  } catch (error) {
    planError = error.message;
    problem = { kind: 'fetch-failed', detail: `vikis.info se ne može učitati: ${error.message}` };
    plan = await loadPlan(store);
  }
  const { delivered, skipped } = await dispatchNotifications(store, env, plan, now);
  const health = await checkHealth(store, env, problem, now).catch(error => `health check failed: ${error.message}`);
  await recordCron(store, { at: now, closures: plan.closures.length, notices: plan.notices.length, delivered, problem: problem?.kind ?? null }).catch(() => undefined);
  return { closures: plan.closures.length, notices: plan.notices.length, delivered, skipped, planError, health };
}

export async function saveSubscription(store, subscription, rawWatches, lang) {
  const watches = sanitizeWatches(rawWatches);
  const id = await subscriptionId(subscription.endpoint);
  const existing = await store.get(subKey(id));
  const plan = await loadPlan(store);
  const alreadyKnown = [
    ...plan.closures.map(closure => `${closure.id}|PUBLISHED`),
    ...plan.closures.filter(closure => closure.end <= Date.now()).map(closure => `${closure.id}|RESTORED`),
    ...plan.notices.map(notice => `${notice.id}|NOTICE`),
  ];
  const sent = [...new Set([...(existing?.sent ?? []), ...alreadyKnown])];
  await store.set(subKey(id), { subscription, watches, sent, lang: normalizeLanguage(lang) });
  await store.sadd(SUBS_SET, id);
  return watches;
}

export async function removeSubscription(store, endpoint) {
  const id = await subscriptionId(endpoint);
  await store.del(subKey(id));
  await store.srem(SUBS_SET, id);
}
