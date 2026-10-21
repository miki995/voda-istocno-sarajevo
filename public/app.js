const STORAGE_KEY = 'voda-watches';
const ZONE_NAMES = ['I', 'II', 'III'];
const TIME_ZONE = 'Europe/Sarajevo';

const WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayPartsFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'numeric' });
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const dayFormat = {
  format(epochMs) {
    const parts = Object.fromEntries(dayPartsFormat.formatToParts(new Date(epochMs)).map(part => [part.type, part.value]));
    return `${WEEKDAYS[WEEKDAY_INDEX[parts.weekday]]}, ${parts.day}.${parts.month}.`;
  },
};

const state = {
  watches: loadWatches(),
  plan: { fetchedAt: 0, status: '', closures: [] },
  zonePlaces: {},
  subscription: null,
};

const nodes = {
  updated: document.getElementById('updated'),
  alertsText: document.getElementById('alerts-text'),
  alertsToggle: document.getElementById('alerts-toggle'),
  alertsHint: document.getElementById('alerts-hint'),
  searchInput: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  zonePicker: document.getElementById('zone-picker'),
  watchList: document.getElementById('watch-list'),
  watchEmpty: document.getElementById('watch-empty'),
  closures: document.getElementById('closures'),
  zones: document.getElementById('zones'),
};

function fold(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dj/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadWatches() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveWatches() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.watches));
  } catch {
    return;
  }
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { text, className, attrs = {}, onClick } = options;
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (onClick) node.addEventListener('click', onClick);
  node.append(...children);
  return node;
}

function watchKey(watch) {
  return watch.kind === 'ZONE' ? `ZONE:${watch.value}` : `PLACE:${fold(watch.value)}`;
}

function hasWatch(kind, value) {
  const key = watchKey({ kind, value });
  return state.watches.some(watch => watchKey(watch) === key);
}

function toggleWatch(kind, value) {
  const key = watchKey({ kind, value });
  const exists = state.watches.some(watch => watchKey(watch) === key);
  state.watches = exists
    ? state.watches.filter(watch => watchKey(watch) !== key)
    : [...state.watches, { kind, value }];
  afterWatchesChanged();
}

function afterWatchesChanged() {
  saveWatches();
  renderAll();
  syncSubscription();
}

function closureMatches(closure) {
  const haystack = ` ${fold(closure.text)} `;
  return state.watches.some(watch => {
    if (watch.kind === 'ZONE') return watch.value === closure.zone;
    const needle = fold(watch.value);
    return needle.length >= 3 && haystack.includes(needle);
  });
}

function renderZonePicker() {
  nodes.zonePicker.replaceChildren(
    ...ZONE_NAMES.map(zone =>
      el('button', {
        text: `Zona ${zone}`,
        className: 'zone-btn',
        attrs: { type: 'button', 'aria-pressed': String(hasWatch('ZONE', zone)) },
        onClick: () => toggleWatch('ZONE', zone),
      }),
    ),
  );
}

function renderWatchList() {
  nodes.watchEmpty.hidden = state.watches.length > 0;
  nodes.watchList.replaceChildren(
    ...state.watches.map(watch =>
      el('li', { className: 'chip' }, [
        el('span', { text: watch.kind === 'ZONE' ? `Zona ${watch.value}` : watch.value }),
        el('button', {
          text: '×',
          attrs: { type: 'button', 'aria-label': `Ukloni ${watch.value}` },
          onClick: () => toggleWatch(watch.kind, watch.value),
        }),
      ]),
    ),
  );
}

function formatWindow(closure) {
  const startDay = dayFormat.format(closure.start);
  const endsAnotherDay = dayFormat.format(closure.end) !== startDay;
  const end = timeFormat.format(closure.end);
  return `${timeFormat.format(closure.start)} – ${end}${endsAnotherDay ? ' (sutradan)' : ''}`;
}

function renderClosures() {
  const now = Date.now();
  const visible = state.plan.closures.filter(closure => closure.end > now - 6 * 60 * 60 * 1000);
  if (visible.length === 0) {
    nodes.closures.replaceChildren(el('p', { text: 'Trenutno nema objavljenog plana redukcije.', className: 'muted' }));
    return;
  }
  nodes.closures.replaceChildren(
    ...visible.map(closure => {
      const mine = closureMatches(closure);
      const live = closure.start <= now && closure.end > now;
      const past = closure.end <= now;
      const badges = [el('span', { text: `Zona ${closure.zone}`, className: 'badge' })];
      if (live) badges.push(el('span', { text: 'traje sada', className: 'badge live' }));
      if (mine) badges.push(el('span', { text: 'tvoja ulica', className: 'badge mine' }));
      return el('article', { className: `closure${mine ? ' mine' : ''}${past ? ' past' : ''}` }, [
        el('div', { className: 'closure-head' }, [
          el('span', { text: formatWindow(closure), className: 'closure-time' }),
          el('span', { className: 'row' }, badges),
        ]),
        el('p', { text: dayFormat.format(closure.start), className: 'muted' }),
        el('ul', {}, closure.lines.map(line => el('li', { text: line }))),
      ]);
    }),
  );
}

function renderZones() {
  nodes.zones.replaceChildren(
    ...ZONE_NAMES.map(zone => {
      const places = state.zonePlaces[zone] ?? [];
      const details = el('details', { className: 'zone-block' }, [
        el('summary', {}, [
          el('span', { text: `Zona ${zone}` }),
          el('span', { text: `${places.length} mjesta`, className: 'count' }),
        ]),
        el(
          'div',
          { className: 'place-list' },
          places.map(place =>
            el('button', {
              text: place,
              className: 'place',
              attrs: { type: 'button', 'aria-pressed': String(hasWatch('PLACE', place)) },
              onClick: () => toggleWatch('PLACE', place),
            }),
          ),
        ),
      ]);
      return details;
    }),
  );
}

function renderUpdated() {
  if (!state.plan.fetchedAt) {
    nodes.updated.textContent = 'Plan još nije učitan.';
    return;
  }
  const label = state.plan.status ? `${state.plan.status} · ` : '';
  nodes.updated.textContent = `${label}ažurirano ${timeFormat.format(state.plan.fetchedAt)}`;
}

function renderAll() {
  renderUpdated();
  renderZonePicker();
  renderWatchList();
  renderClosures();
  renderZones();
}

function allSuggestions(query) {
  const needle = fold(query);
  if (needle.length < 2) return [];
  const seen = new Set();
  const results = [];
  for (const zone of ZONE_NAMES) {
    for (const place of state.zonePlaces[zone] ?? []) {
      const key = fold(place);
      if (key.includes(needle) && !seen.has(key)) {
        seen.add(key);
        results.push({ place, zone });
      }
    }
  }
  return results.slice(0, 8);
}

let activeSuggestion = -1;

function renderSuggestions() {
  const query = nodes.searchInput.value;
  const items = allSuggestions(query);
  const typed = query.trim();
  const showTyped = fold(typed).length >= 3 && !items.some(item => fold(item.place) === fold(typed));
  const rows = items.map(item => ({ value: item.place, tag: `Zona ${item.zone}` }));
  if (showTyped) rows.push({ value: typed, tag: 'dodaj kako si ukucao' });
  activeSuggestion = -1;
  nodes.suggestions.hidden = rows.length === 0;
  nodes.suggestions.replaceChildren(
    ...rows.map(row =>
      el(
        'li',
        { attrs: { role: 'option', 'aria-selected': 'false' } },
        [el('span', { text: row.value }), el('span', { text: row.tag, className: 'tag' })],
      ),
    ),
  );
  [...nodes.suggestions.children].forEach((node, index) =>
    node.addEventListener('mousedown', event => {
      event.preventDefault();
      pickSuggestion(rows[index].value);
    }),
  );
}

function pickSuggestion(value) {
  if (!hasWatch('PLACE', value)) toggleWatch('PLACE', value);
  nodes.searchInput.value = '';
  nodes.suggestions.hidden = true;
}

function moveSuggestion(step) {
  const options = [...nodes.suggestions.children];
  if (options.length === 0) return;
  activeSuggestion = (activeSuggestion + step + options.length) % options.length;
  options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSuggestion)));
}

nodes.searchInput.addEventListener('input', renderSuggestions);
nodes.searchInput.addEventListener('blur', () => { nodes.suggestions.hidden = true; });
nodes.searchInput.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestion(1); }
  if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestion(-1); }
  if (event.key === 'Enter') {
    event.preventDefault();
    const options = [...nodes.suggestions.children];
    const chosen = options[Math.max(activeSuggestion, 0)];
    if (chosen) pickSuggestion(chosen.firstChild.textContent);
  }
});

function isIosBrowserTab() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return ios && !standalone;
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToBytes(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function renderAlertsState() {
  nodes.alertsHint.hidden = true;
  if (isIosBrowserTab()) {
    nodes.alertsText.textContent = 'Na iPhoneu obavještenja rade tek kad sajt dodaš na početni ekran.';
    nodes.alertsHint.textContent = 'Safari → dugme Podijeli → "Dodaj na početni ekran", pa otvori sajt odatle i uključi obavještenja.';
    nodes.alertsHint.hidden = false;
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (!pushSupported()) {
    nodes.alertsText.textContent = 'Ovaj preglednik ne podržava obavještenja. Plan i dalje možeš pratiti na ovoj stranici.';
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (Notification.permission === 'denied') {
    nodes.alertsText.textContent = 'Obavještenja su blokirana u postavkama preglednika. Dozvoli ih za ovaj sajt pa osvježi stranicu.';
    nodes.alertsToggle.hidden = true;
    return;
  }
  nodes.alertsToggle.hidden = false;
  if (state.subscription) {
    nodes.alertsText.textContent = 'Obavještenja su uključena na ovom uređaju.';
    nodes.alertsToggle.textContent = 'Isključi obavještenja';
    nodes.alertsToggle.classList.remove('primary');
  } else {
    nodes.alertsText.textContent = 'Uključi obavještenja da ti poruka stigne i kad stranica nije otvorena.';
    nodes.alertsToggle.textContent = 'Uključi obavještenja';
    nodes.alertsToggle.classList.add('primary');
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
}

async function syncSubscription() {
  if (!state.subscription) return;
  try {
    await postJson('/api/subscribe', { subscription: state.subscription.toJSON(), watches: state.watches });
  } catch {
    nodes.alertsText.textContent = 'Nisam uspio sačuvati izbor na serveru. Pokušaj ponovo.';
  }
}

async function enableAlerts() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    renderAlertsState();
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch('/api/vapid')).json();
  state.subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(publicKey),
  });
  await syncSubscription();
  renderAlertsState();
}

async function disableAlerts() {
  if (!state.subscription) return;
  const endpoint = state.subscription.endpoint;
  await state.subscription.unsubscribe();
  state.subscription = null;
  await postJson('/api/unsubscribe', { endpoint }).catch(() => undefined);
  renderAlertsState();
}

nodes.alertsToggle.addEventListener('click', async () => {
  nodes.alertsToggle.disabled = true;
  try {
    await (state.subscription ? disableAlerts() : enableAlerts());
  } catch {
    nodes.alertsText.textContent = 'Nešto nije uspjelo pri uključivanju obavještenja. Pokušaj ponovo.';
  } finally {
    nodes.alertsToggle.disabled = false;
  }
});

async function loadData() {
  const [plan, zonePlaces] = await Promise.all([
    fetch('/api/plan').then(response => response.json()),
    fetch('/api/zones').then(response => response.json()),
  ]);
  state.plan = plan;
  state.zonePlaces = zonePlaces;
  renderAll();
}

async function init() {
  renderAll();
  renderAlertsState();
  await loadData().catch(() => { nodes.updated.textContent = 'Ne mogu da učitam plan. Pokušaj kasnije.'; });
  if (pushSupported() && !isIosBrowserTab()) {
    const registration = await navigator.serviceWorker.register('/sw.js');
    state.subscription = await registration.pushManager.getSubscription();
    renderAlertsState();
    syncSubscription();
  }
  setInterval(() => loadData().catch(() => undefined), 5 * 60 * 1000);
}

init();
