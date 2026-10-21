import { fold } from './text.js';
import { dayKey, formatDay, formatTime, localParts } from './time.js';

export const LEAD_MS = 2 * 60 * 60 * 1000;
export const MORNING_HOUR = 7;

const KIND_PRIORITY = ['SOON', 'MORNING', 'PUBLISHED'];

export function matchedWatches(closure, watches) {
  const haystack = ` ${fold(closure.text)} `;
  const labels = [];
  for (const watch of watches) {
    if (watch.kind === 'ZONE') {
      if (watch.value === closure.zone) {
        labels.push(`Zona ${watch.value}`);
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

function buildMessage(kind, closure, labels, now) {
  const window = `${formatTime(closure.start)}–${formatTime(closure.end)}`;
  const where = labels.join(', ');
  if (kind === 'SOON') {
    const minutes = Math.round((closure.start - now) / 60000);
    return { title: `Voda nestaje za oko ${minutes} min`, body: `${window} (Zona ${closure.zone}) – ${where}` };
  }
  if (kind === 'MORNING') {
    return { title: 'Danas nema vode', body: `${window} (Zona ${closure.zone}) – ${where}` };
  }
  return { title: `Plan redukcije ${formatDay(closure.start)} ${window}`, body: `Zona ${closure.zone} – ${where}` };
}

export function planNotifications({ closures, watches, sent, now }) {
  const notifications = [];
  for (const closure of closures) {
    if (closure.end <= now) {
      continue;
    }
    const labels = matchedWatches(closure, watches);
    const kinds = labels.length > 0 ? dueKinds(closure, sent, now) : [];
    if (kinds.length === 0) {
      continue;
    }
    const kind = KIND_PRIORITY.find(candidate => kinds.includes(candidate));
    notifications.push({
      closureId: closure.id,
      tag: `${closure.id}-${kind}`,
      markSent: kinds.map(dueKind => `${closure.id}|${dueKind}`),
      ...buildMessage(kind, closure, labels, now),
    });
  }
  return notifications;
}

export function pruneSent(sent, closures) {
  const knownIds = new Set(closures.map(closure => closure.id));
  return sent.filter(entry => knownIds.has(entry.split('|')[0]));
}
