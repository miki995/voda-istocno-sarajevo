import { DEFAULT_LANGUAGE, messagesFor } from './messages.js';
import { fold } from './text.js';
import { dayKey, formatDay, formatTime, localParts } from './time.js';

export const LEAD_MS = 2 * 60 * 60 * 1000;
export const MORNING_HOUR = 7;

const KIND_PRIORITY = ['SOON', 'MORNING', 'PUBLISHED'];

export function matchedWatches(closure, watches, lang = DEFAULT_LANGUAGE) {
  const haystack = ` ${fold(closure.text)} `;
  const labels = [];
  for (const watch of watches) {
    if (watch.kind === 'ZONE') {
      if (watch.value === closure.zone) {
        labels.push(messagesFor(lang).zone(watch.value));
      }
    } else {
      const needle = fold(watch.value);
      if (needle.length >= 3 && haystack.includes(needle)) {
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
  const window = `${formatTime(closure.start)}–${formatTime(closure.end)}`;
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

export function pruneSent(sent, closures) {
  const knownIds = new Set(closures.map(closure => closure.id));
  return sent.filter(entry => knownIds.has(entry.split('|')[0]));
}
