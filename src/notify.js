import { toCyrillic } from '../public/translit.js';
import { DEFAULT_LANGUAGE, messagesFor, usesCyrillic } from './messages.js';
import { mentions } from './text.js';
import { dayKey, formatDay, formatEndTime, formatTime, localParts } from './time.js';

export const LEAD_MS = 2 * 60 * 60 * 1000;
export const RESTORED_WINDOW_MS = 2 * 60 * 60 * 1000;
const CONTINUATION_GAP_MS = 15 * 60 * 1000;
export const MORNING_HOUR = 7;
export const EVENING_HOUR = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_PRIORITY = ['SOON', 'MORNING', 'PUBLISHED'];

export function matchedWatches(closure, watches, lang = DEFAULT_LANGUAGE) {
  const labels = [];
  for (const watch of watches) {
    if (watch.kind === 'ZONE') {
      if (watch.value === closure.zone) {
        labels.push(messagesFor(lang).zone(watch.value));
      }
    } else {
      if (mentions(closure.text, watch.value)) {
        labels.push(watch.value);
      }
    }
  }
  return labels;
}

function dueKinds(closure, sent, now) {
  const kinds = [];
  const minutesLeft = Math.round((closure.start - now) / 60000);
  const startsToday = dayKey(now) === dayKey(closure.start);
  if (!sent.includes(`${closure.id}|PUBLISHED`)) {
    kinds.push('PUBLISHED');
  }
  if (!sent.includes(`${closure.id}|MORNING`) && startsToday && localParts(now).hour >= MORNING_HOUR && minutesLeft > 0) {
    kinds.push('MORNING');
  }
  if (!sent.includes(`${closure.id}|SOON`) && minutesLeft > 0 && closure.start - now <= LEAD_MS) {
    kinds.push('SOON');
  }
  return kinds;
}

function localized(message, lang) {
  return usesCyrillic(lang) ? { title: toCyrillic(message.title), body: toCyrillic(message.body) } : message;
}

function buildMessage(kind, closure, labels, now, lang) {
  const messages = messagesFor(lang);
  const window = `${formatTime(closure.start)}–${formatEndTime(closure.start, closure.end)}`;
  const where = labels.join(', ');
  const zone = messages.zone(closure.zone);
  if (kind === 'SOON') {
    const minutes = Math.round((closure.start - now) / 60000);
    return { title: messages.soon(minutes), body: `${window} (${zone}) – ${where}` };
  }
  if (kind === 'MORNING') {
    return { title: messages.morning, body: `${window} (${zone}) – ${where}` };
  }
  return { title: messages.published(formatDay(closure.start), window), body: `${zone} – ${where}` };
}

// A closure that ends exactly when another one for the same street starts is not the end of the outage.
function continuedByAnother(closure, closures, watches) {
  return closures.some(
    other => other.id !== closure.id && other.start <= closure.end + CONTINUATION_GAP_MS && other.end > closure.end && matchedWatches(other, watches).length > 0,
  );
}

function restoredNotification(closure, closures, watches, sent, now, lang) {
  const recentlyEnded = closure.end <= now && now - closure.end <= RESTORED_WINDOW_MS;
  if (!recentlyEnded || sent.includes(`${closure.id}|RESTORED`) || continuedByAnother(closure, closures, watches)) {
    return null;
  }
  const labels = matchedWatches(closure, watches, lang);
  if (labels.length === 0) {
    return null;
  }
  const window = `${formatTime(closure.start)}–${formatEndTime(closure.start, closure.end)}`;
  return {
    closureId: closure.id,
    tag: `${closure.id}-RESTORED`,
    markSent: [`${closure.id}|RESTORED`],
    ...localized({ title: messagesFor(lang).restored, body: `${window} (${messagesFor(lang).zone(closure.zone)}) – ${labels.join(', ')}` }, lang),
  };
}

function isEveningBefore(closure, now) {
  return localParts(now).hour >= EVENING_HOUR && dayKey(closure.start) === dayKey(now + DAY_MS);
}

// One message after 20:00 listing everything that is closed tomorrow, so nobody has to remember three separate alerts.
export function eveningNotifications({ closures, watches, sent, now, lang = DEFAULT_LANGUAGE, skipIds = [] }) {
  const lines = [];
  const markSent = [];
  for (const closure of closures) {
    if (!isEveningBefore(closure, now) || skipIds.includes(closure.id) || sent.includes(`${closure.id}|EVENING`)) {
      continue;
    }
    const labels = matchedWatches(closure, watches, lang);
    if (labels.length === 0) {
      continue;
    }
    const messages = messagesFor(lang);
    lines.push(`${formatTime(closure.start)}–${formatEndTime(closure.start, closure.end)} (${messages.zone(closure.zone)}) – ${labels.join(', ')}`);
    markSent.push(`${closure.id}|EVENING`);
  }
  if (lines.length === 0) {
    return [];
  }
  return [{ tag: `evening-${dayKey(now)}`, markSent, ...localized({ title: messagesFor(lang).tomorrow, body: lines.join('\n') }, lang) }];
}

export function planNotifications({ closures, watches, sent, now, lang = DEFAULT_LANGUAGE }) {
  const notifications = [];
  for (const closure of closures) {
    if (closure.end <= now) {
      const restored = restoredNotification(closure, closures, watches, sent, now, lang);
      if (restored) {
        notifications.push(restored);
      }
      continue;
    }
    const labels = matchedWatches(closure, watches, lang);
    const kinds = labels.length > 0 ? dueKinds(closure, sent, now) : [];
    if (kinds.length === 0) {
      continue;
    }
    const kind = KIND_PRIORITY.find(candidate => kinds.includes(candidate));
    const markSent = kinds.map(dueKind => `${closure.id}|${dueKind}`);
    if (isEveningBefore(closure, now)) {
      markSent.push(`${closure.id}|EVENING`);
    }
    notifications.push({
      closureId: closure.id,
      tag: `${closure.id}-${kind}`,
      markSent,
      ...localized(buildMessage(kind, closure, labels, now, lang), lang),
    });
  }
  return notifications;
}

const NOTICE_SUMMARY_LENGTH = 140;

export function noticeNotifications({ notices, watches, sent, now, lang = DEFAULT_LANGUAGE }) {
  const messages = messagesFor(lang);
  const today = dayKey(now);
  return notices
    .filter(notice => notice.date >= today && !sent.includes(`${notice.id}|NOTICE`))
    .flatMap(notice => {
      const labels = matchedWatches(notice, watches, lang);
      if (labels.length === 0) {
        return [];
      }
      const summary = notice.text.length > NOTICE_SUMMARY_LENGTH ? `${notice.text.slice(0, NOTICE_SUMMARY_LENGTH).trim()}…` : notice.text;
      return [{
        tag: notice.id,
        markSent: [`${notice.id}|NOTICE`],
        ...localized({ title: (messages.notice[notice.kind] ?? messages.notice.breakdown)(labels.join(', ')), body: summary }, lang),
      }];
    });
}

export function pruneSent(sent, items) {
  const knownIds = new Set(items.map(item => item.id));
  return sent.filter(entry => knownIds.has(entry.split('|')[0]));
}
