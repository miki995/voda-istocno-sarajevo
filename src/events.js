import { decodeEntities } from './parser.js';

const EVENT_PATTERN = /\{\s*date:\s*'(\d{4}-\d{2}-\d{2})',\s*title:\s*'([^']*)',\s*url:\s*'(\d+)'\s*\}/g;
const PLAN_TITLE = /plan\s+redukcij/i;
const SCHEDULE_TITLE = /raspored\s+redukcij/i;

export function parseCalendarEvents(html) {
  return [...html.matchAll(EVENT_PATTERN)].map(([, date, title, id]) => ({
    date,
    title: decodeEntities(title).replace(/\s+/g, ' ').trim(),
    id,
  }));
}

function shiftDay(dayKeyValue, days) {
  const shifted = new Date(`${dayKeyValue}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function selectUpcomingPlanEvents(events, todayKey, maxDays = 7) {
  const limitKey = shiftDay(todayKey, maxDays);
  return events
    .filter(event => PLAN_TITLE.test(event.title) && event.date > todayKey && event.date <= limitKey)
    .sort((first, second) => first.date.localeCompare(second.date));
}

export function selectRecentNoticeEvents(events, todayKey, daysBack = 3, daysAhead = 7) {
  const fromKey = shiftDay(todayKey, -daysBack);
  const toKey = shiftDay(todayKey, daysAhead);
  return events
    .filter(event => !PLAN_TITLE.test(event.title) && !SCHEDULE_TITLE.test(event.title) && event.date >= fromKey && event.date <= toKey)
    .sort((first, second) => second.date.localeCompare(first.date) || Number(second.id) - Number(first.id));
}
