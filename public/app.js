import { LANGUAGES, applyStaticTexts, formatDayLabel, getLanguage, setLanguage, t } from './i18n.js';

const STORAGE_KEY = 'voda-watches';
const ZONE_NAMES = ['I', 'II', 'III'];
const TIME_ZONE = 'Europe/Sarajevo';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const state = {
  watches: loadWatches(),
  plan: { fetchedAt: 0, status: '', closures: [] },
  zonePlaces: {},
  subscription: null,
  alertsMessage: '',
  planLoadFailed: false,
};

const nodes = {
  updated: document.getElementById('updated'),
  languageSwitch: document.getElementById('language-switch'),
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

function watchLabel(watch) {
  return watch.kind === 'ZONE' ? t('zone', { zone: watch.value }) : watch.value;
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

function renderLanguageSwitch() {
  nodes.languageSwitch.replaceChildren(
    ...LANGUAGES.map(lang =>
      el('button', {
        text: lang.toUpperCase(),
        className: 'lang-btn',
        attrs: { type: 'button', 'aria-pressed': String(getLanguage() === lang), lang },
        onClick: () => changeLanguage(lang),
      }),
    ),
  );
}

function renderZonePicker() {
  nodes.zonePicker.replaceChildren(
    ...ZONE_NAMES.map(zone =>
      el('button', {
        text: t('zone', { zone }),
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
        el('span', { text: watchLabel(watch) }),
        el('button', {
          text: '×',
          attrs: { type: 'button', 'aria-label': t('watch.remove', { name: watchLabel(watch) }) },
          onClick: () => toggleWatch(watch.kind, watch.value),
        }),
      ]),
    ),
  );
}

function formatWindow(closure) {
  const endsAnotherDay = formatDayLabel(closure.end) !== formatDayLabel(closure.start);
  const suffix = endsAnotherDay ? ` (${t('plan.nextDay')})` : '';
  return `${timeFormat.format(closure.start)} – ${timeFormat.format(closure.end)}${suffix}`;
}

function renderClosures() {
  const now = Date.now();
  const visible = state.plan.closures.filter(closure => closure.end > now - 6 * 60 * 60 * 1000);
  if (visible.length === 0) {
    nodes.closures.replaceChildren(el('p', { text: t('plan.none'), className: 'muted' }));
    return;
  }
  nodes.closures.replaceChildren(
    ...visible.map(closure => {
      const mine = closureMatches(closure);
      const live = closure.start <= now && closure.end > now;
      const past = closure.end <= now;
      const badges = [el('span', { text: t('zone', { zone: closure.zone }), className: 'badge' })];
      if (live) badges.push(el('span', { text: t('plan.live'), className: 'badge live' }));
      if (mine) badges.push(el('span', { text: t('plan.mine'), className: 'badge mine' }));
      return el('article', { className: `closure${mine ? ' mine' : ''}${past ? ' past' : ''}` }, [
        el('div', { className: 'closure-head' }, [
          el('span', { text: formatWindow(closure), className: 'closure-time' }),
          el('span', { className: 'row' }, badges),
        ]),
        el('p', { text: formatDayLabel(closure.start), className: 'muted' }),
        el('ul', {}, closure.lines.map(line => el('li', { text: line }))),
      ]);
    }),
  );
}

function renderZones() {
  const openZones = new Set([...nodes.zones.querySelectorAll('details[open]')].map(details => details.dataset.zone));
  nodes.zones.replaceChildren(
    ...ZONE_NAMES.map(zone => {
      const places = state.zonePlaces[zone] ?? [];
      const details = el('details', { className: 'zone-block', attrs: { 'data-zone': zone } }, [
        el('summary', {}, [
          el('span', { text: t('zone', { zone }) }),
          el('span', { text: t('zones.count', { count: places.length }), className: 'count' }),
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
      details.open = openZones.has(zone);
      return details;
    }),
  );
}

function renderUpdated() {
  if (state.planLoadFailed) {
    nodes.updated.textContent = t('plan.loadFailed');
    return;
  }
  if (!state.plan.fetchedAt) {
    nodes.updated.textContent = t('header.loading');
    return;
  }
  const label = state.plan.status ? `${state.plan.status} · ` : '';
  nodes.updated.textContent = `${label}${t('plan.updated', { time: timeFormat.format(state.plan.fetchedAt) })}`;
}

function renderAll() {
  renderLanguageSwitch();
  renderUpdated();
  renderZonePicker();
  renderWatchList();
  renderClosures();
  renderZones();
  renderAlertsState();
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
  const rows = items.map(item => ({ value: item.place, tag: t('zone', { zone: item.zone }) }));
  if (showTyped) rows.push({ value: typed, tag: t('watch.addTyped') });
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
    nodes.alertsText.textContent = t('alerts.ios');
    nodes.alertsHint.textContent = t('alerts.iosHint');
    nodes.alertsHint.hidden = false;
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (!pushSupported()) {
    nodes.alertsText.textContent = t('alerts.unsupported');
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (Notification.permission === 'denied') {
    nodes.alertsText.textContent = t('alerts.blocked');
    nodes.alertsToggle.hidden = true;
    return;
  }
  nodes.alertsToggle.hidden = false;
  if (state.subscription) {
    nodes.alertsText.textContent = state.alertsMessage || t('alerts.active');
    nodes.alertsToggle.textContent = t('alerts.disable');
    nodes.alertsToggle.classList.remove('primary');
  } else {
    nodes.alertsText.textContent = state.alertsMessage || t('alerts.inactive');
    nodes.alertsToggle.textContent = t('alerts.enable');
    nodes.alertsToggle.classList.add('primary');
  }
}

function showAlertsMessage(key) {
  state.alertsMessage = key ? t(key) : '';
  renderAlertsState();
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
    await postJson('/api/subscribe', {
      subscription: state.subscription.toJSON(),
      watches: state.watches,
      lang: getLanguage(),
    });
  } catch {
    showAlertsMessage('alerts.saveFailed');
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
  state.alertsMessage = '';
  try {
    await (state.subscription ? disableAlerts() : enableAlerts());
  } catch {
    showAlertsMessage('alerts.failed');
  } finally {
    nodes.alertsToggle.disabled = false;
  }
});

function changeLanguage(lang) {
  setLanguage(lang);
  state.alertsMessage = '';
  applyStaticTexts();
  renderAll();
  syncSubscription();
}

async function loadData() {
  const [plan, zonePlaces] = await Promise.all([
    fetch('/api/plan').then(response => response.json()),
    fetch('/api/zones').then(response => response.json()),
  ]);
  state.plan = plan;
  state.zonePlaces = zonePlaces;
  state.planLoadFailed = false;
  renderAll();
}

function loadDataQuietly() {
  return loadData().catch(() => {
    state.planLoadFailed = state.plan.fetchedAt === 0;
    renderUpdated();
  });
}

async function init() {
  applyStaticTexts();
  renderAll();
  await loadDataQuietly();
  if (pushSupported() && !isIosBrowserTab()) {
    const registration = await navigator.serviceWorker.register('/sw.js');
    state.subscription = await registration.pushManager.getSubscription();
    renderAlertsState();
    syncSubscription();
  }
  setInterval(loadDataQuietly, 5 * 60 * 1000);
}

init();
