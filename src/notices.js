import { extractDescription, htmlToLines } from './parser.js';
import { fold } from './text.js';

const MAX_TEXT = 2500;
const SHORTAGE = /nepovoljn\w* hidrolo|izdasnost|nestasic|redukcij\w* (u vodosnabdijevanju|vode)/;
const SHUTDOWN = /najava iskljucenja|doci (ce )?do (prekida|obustave)|ce doci|ce (biti|se) (obustavljen|iskljucen)|bez urednog vodosnabdijevanja ce|planiran\w* (radov|prekid)/;

export function noticeId(event) {
  return `notice-${event.id}`;
}

export function classifyNotice(title, text) {
  const folded = fold(`${title} ${text}`);
  if (SHORTAGE.test(folded)) return 'shortage';
  if (SHUTDOWN.test(folded)) return 'shutdown';
  return 'breakdown';
}

function capLines(rawLines) {
  const lines = [];
  let size = 0;
  for (const line of rawLines) {
    size += line.length;
    if (size > MAX_TEXT) break;
    lines.push(line);
  }
  return lines;
}

function build(id, date, title, kind, rawLines) {
  const lines = capLines(rawLines);
  const text = lines.join(' ');
  return { id, date, title, kind: kind ?? classifyNotice(title, text), lines, text };
}

export function parseNotice(event, html) {
  return build(noticeId(event), event.date, event.title, null, htmlToLines(extractDescription(html)));
}

function shortHash(text) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

export function extrasToNotices(extras, date, source, fallbackTitle = 'Vanredno obavještenje') {
  return extras.map(extra =>
    build(`extra-${source}-${shortHash(extra.lines.join(' '))}`, date, extra.title || fallbackTitle, extra.kind, extra.lines),
  );
}
