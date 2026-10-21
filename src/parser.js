import { fold } from './text.js';
import { dayKey, formatTime, localEpoch } from './time.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADER_PATTERN = /ZATVARANJE\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s+od\s+(\d{1,2}):(\d{2})\s+do\s+(\d{1,2}):(\d{2})\s*(?:časova|časa|sati)?\.?\s*(?:(\d{1,2})\.(\d{1,2})\.(\d{4})\.?)?\s*[-–]?\s*ZONA\s+(IV|V|I{1,3})/i;
const LEADING_WORDS = /^(naselje|naselja|ulice|ulica|ulici|dio|dijela)\s*:?\s+/i;
const CONNECTOR_WORDS = /\s+(od|do|zatim|prema)\s+/i;

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function htmlToLines(fragment) {
  return fragment
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, entity => ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);
}

function extractDescription(html) {
  const marker = html.indexOf('modal-description');
  if (marker === -1) {
    return '';
  }
  const open = html.indexOf('>', marker);
  const close = html.indexOf('</div>', open);
  return html.slice(open + 1, close === -1 ? undefined : close);
}

function extractStatus(html) {
  const match = html.match(/class="title">([^<]+)</);
  return match ? match[1].trim() : '';
}

function buildClosure(header) {
  const [, day, month, year, startHour, startMinute, endHour, endMinute, endDay, endMonth, endYear, zone] = header;
  const start = localEpoch(Number(year), Number(month), Number(day), Number(startHour), Number(startMinute));
  const end = endDay
    ? localEpoch(Number(endYear), Number(endMonth), Number(endDay), Number(endHour), Number(endMinute))
    : localEpoch(Number(year), Number(month), Number(day), Number(endHour), Number(endMinute));
  const zoneName = zone.toUpperCase();
  return {
    id: `${dayKey(start)}-${formatTime(start).replace(':', '')}-${zoneName}`,
    zone: zoneName,
    start,
    end: end > start ? end : end + DAY_MS,
    lines: [],
  };
}

export function parsePlan(html) {
  const closures = [];
  let current = null;

  for (const line of htmlToLines(extractDescription(html))) {
    const header = line.match(HEADER_PATTERN);
    if (header) {
      current = buildClosure(header);
      closures.push(current);
    } else if (current) {
      current.lines.push(line.replace(/^[-–]\s*/, ''));
    }
  }

  return {
    status: extractStatus(html),
    closures: closures.map(closure => ({ ...closure, text: closure.lines.join(' ') })),
  };
}

function cleanPlace(raw) {
  let place = raw.replace(/[„“”"']|,,/g, '').trim();
  if (/^(od|do|zatim|prema)\s/i.test(place) || /(neparni|parni|brojevi)/i.test(place)) {
    return '';
  }
  let previous;
  do {
    previous = place;
    place = place.replace(LEADING_WORDS, '');
  } while (place !== previous);
  const trimmed = place
    .split(CONNECTOR_WORDS)[0]
    .replace(/\s+\d+$/, '')
    .replace(/\s+(ulice|ulica)$/i, '')
    .replace(/[.:;\s]+$/, '')
    .trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function extractPlaces(closure) {
  const seen = new Map();
  for (const line of closure.lines) {
    for (const token of line.replace(/[()]/g, ',').split(/[,;–]|\s-\s|\s+i\s+/)) {
      const place = cleanPlace(token);
      const key = fold(place);
      if (place.length >= 3 && place.length <= 40 && !/^\d+$/.test(key) && !seen.has(key)) {
        seen.set(key, place);
      }
    }
  }
  return [...seen.values()];
}

export function mergePlacesByZone(existing, closures) {
  const merged = { ...existing };
  for (const closure of closures) {
    const known = new Map((merged[closure.zone] ?? []).map(place => [fold(place), place]));
    for (const place of extractPlaces(closure)) {
      if (!known.has(fold(place))) {
        known.set(fold(place), place);
      }
    }
    merged[closure.zone] = [...known.values()].sort((first, second) => first.localeCompare(second, 'sr-Latn'));
  }
  return merged;
}
