import { buildPushPayload } from '@block65/webcrypto-web-push';
import { parseCalendarEvents, selectRecentNoticeEvents, selectUpcomingPlanEvents } from './events.js';
import { extrasToNotices, parseNotice } from './notices.js';
import { mergePlacesByZone, parsePlan } from './parser.js';
import { dayKey } from './time.js';
import { normalizeLanguage } from './messages.js';
import { noticeNotifications, planNotifications, pruneSent } from './notify.js';
import { fold } from './text.js';
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
  const known = new Map((cached?.notices ?? []).map(notice => [notice.id, notice]));
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

  if (closuresChanged || noticesChanged || now - previous.fetchedAt > HOUR_MS) {
    await store.set('plan', plan);
  }
  if (closuresChanged) {
    await store.set('zonePlaces', mergePlacesByZone(await loadZonePlaces(store), closures));
  }
  return plan;
}

async function sendPush(env, subscription, message) {
  const payload = await buildPushPayload(
    { data: message, options: { ttl: 6 * HOUR_MS / 1000, urgency: 'high' } },
    subscription,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  );
  return fetch(subscription.endpoint, payload);
}

async function notifySubscriber(store, env, plan, now, id) {
  const record = await store.get(subKey(id));
  if (!record) {
    await store.srem(SUBS_SET, id);
    return 0;
  }
  const notifications = [
    ...planNotifications({ closures: plan.closures, watches: record.watches, sent: record.sent, now, lang: record.lang }),
    ...noticeNotifications({ notices: plan.notices, watches: record.watches, sent: record.sent, now, lang: record.lang }),
  ];
  let delivered = 0;
  for (const notification of notifications) {
    const response = await sendPush(env, record.subscription, {
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      lang: normalizeLanguage(record.lang),
    }).catch(() => null);
    if (response?.status === 404 || response?.status === 410) {
      await store.del(subKey(id));
      await store.srem(SUBS_SET, id);
      return delivered;
    }
    if (response?.ok) {
      record.sent.push(...notification.markSent);
      delivered += 1;
    }
  }
  const prunedSent = pruneSent(record.sent, [...plan.closures, ...plan.notices]);
  if (delivered > 0 || prunedSent.length !== record.sent.length) {
    await store.set(subKey(id), { ...record, sent: prunedSent });
  }
  return delivered;
}

export async function dispatchNotifications(store, env, plan, now) {
  const ids = await store.smembers(SUBS_SET);
  const results = await Promise.all(ids.map(id => notifySubscriber(store, env, plan, now, id)));
  return results.reduce((total, count) => total + count, 0);
}

export async function runCron(store, env, now = Date.now()) {
  let planError = '';
  const plan = await refreshPlan(store, now).catch(async error => {
    planError = error.message;
    return loadPlan(store);
  });
  const delivered = await dispatchNotifications(store, env, plan, now);
  return { closures: plan.closures.length, notices: plan.notices.length, delivered, planError };
}

export async function saveSubscription(store, subscription, rawWatches, lang) {
  const watches = sanitizeWatches(rawWatches);
  const id = await subscriptionId(subscription.endpoint);
  const existing = await store.get(subKey(id));
  const plan = await loadPlan(store);
  const alreadyKnown = [
    ...plan.closures.map(closure => `${closure.id}|PUBLISHED`),
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
