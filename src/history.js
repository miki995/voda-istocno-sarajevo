const HISTORY_KEY = 'history';
const KEEP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// Every closure the site has ever published, kept for a couple of months so the app can say how often a street was without water.
export async function recordHistory(store, closures, now) {
  const stored = (await store.get(HISTORY_KEY)) ?? {};
  const next = {};
  for (const [id, entry] of Object.entries(stored)) {
    if (entry.end >= now - KEEP_DAYS * DAY_MS) {
      next[id] = entry;
    }
  }
  for (const closure of closures) {
    next[closure.id] = { id: closure.id, zone: closure.zone, start: closure.start, end: closure.end, text: closure.text };
  }
  if (JSON.stringify(next) !== JSON.stringify(stored)) {
    await store.set(HISTORY_KEY, next);
  }
}

export async function loadHistory(store) {
  return Object.values((await store.get(HISTORY_KEY)) ?? {}).sort((first, second) => first.start - second.start);
}
