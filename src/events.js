const EVENT_PATTERN = /\{\s*date:\s*'(\d{4}-\d{2}-\d{2})',\s*title:\s*'([^']*)',\s*url:\s*'(\d+)'\s*\}/g;
const PLAN_TITLE = /plan\s+redukcij/i;

export function parseCalendarEvents(html) {
  return [...html.matchAll(EVENT_PATTERN)].map(([, date, title, id]) => ({ date, title, id }));
}

export function selectUpcomingPlanEvents(events, todayKey, maxDays = 7) {
  const limit = new Date(`${todayKey}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + maxDays);
  const limitKey = limit.toISOString().slice(0, 10);
  return events
    .filter(event => PLAN_TITLE.test(event.title) && event.date > todayKey && event.date <= limitKey)
    .sort((first, second) => first.date.localeCompare(second.date));
}
