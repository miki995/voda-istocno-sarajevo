import { DEFAULT_LANGUAGE, messagesFor } from './messages.js';
import { mentions } from './text.js';
import { dayKey, formatDay, formatEndTime, formatTime, localParts } from './time.js';

export const LEAD_MS = 2 * 60 * 60 * 1000;
export const MORNING_HOUR = 7;

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

export function planNotifications({ closures, watches, sent, now, lang = DEFAULT_LANGUAGE }) {
  const notifications = [];
  for (const closure of closures) {
    if (closure.end <= now) {
      continue;
    }
    const labels = matchedWatches(closure, watches, lang);
    const kinds = labels.length > 0 ? dueKinds(closure, sent, now) : [];
    if (kinds.length === 0) {
      continue;
    }
    const kind = KIND_PRIORITY.find(candidate => kinds.includes(candidate));
    notifications.push({
      closureId: closure.id,
      tag: `${closure.id}-${kind}`,
      markSent: kinds.map(dueKind => `${closure.id}|${dueKind}`),
      ...buildMessage(kind, closure, labels, now, lang),
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
        title: (messages.notice[notice.kind] ?? messages.notice.breakdown)(labels.join(', ')),
        body: summary,
      }];
    });
}

export function pruneSent(sent, items) {
  const knownIds = new Set(items.map(item => item.id));
  return sent.filter(entry => knownIds.has(entry.split('|')[0]));
}
