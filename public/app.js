import { initAnalytics, trackEvent } from './analytics.js';
import { LANGUAGES, LANGUAGE_LABELS, applyStaticTexts, formatDayLabel, formatRelativeDay, getLanguage, local, setLanguage, t } from './i18n.js';
import { buildIcs, downloadIcs } from './calendar.js';
import { toLatin } from './translit.js';

const STORAGE_KEY = 'voda-watches';
const ZONE_NAMES = ['I', 'II', 'III'];
const TIME_ZONE = 'Europe/Sarajevo';
const SCREENS = ['home', 'menu', 'add', 'alerts', 'notices', 'plan', 'zones'];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOME_NOTICE_DAYS = 3;
const VISITOR_KEY = 'voda-visitor';
const SESSION_KEY = 'voda-session-counted';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const ICONS = {
  drop: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
};

const state = {
  watches: loadWatches(),
  plan: { fetchedAt: 0, status: '', closures: [], notices: [] },
  zonePlaces: {},
  subscription: null,
  alertsMessage: '',
  planLoadFailed: false,
  openDetails: new Set(),
};

const nodes = {
  screens: [...document.querySelectorAll('[data-screen]')],
  updated: document.getElementById('updated'),
  homeBanner: document.getElementById('home-banner'),
  homeContent: document.getElementById('home-content'),
  menuButton: document.getElementById('menu-button'),
  menuAddValue: document.getElementById('menu-add-value'),
  menuAlertsValue: document.getElementById('menu-alerts-value'),
  menuNoticesValue: document.getElementById('menu-notices-value'),
  notices: document.getElementById('notices'),
  languageSwitch: document.getElementById('language-switch'),
  alertsText: document.getElementById('alerts-text'),
  alertsToggle: document.getElementById('alerts-toggle'),
  alertsHint: document.getElementById('alerts-hint'),
  searchInput: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  zonePicker: document.getElementById('zone-picker'),
  watchList: document.getElementById('watch-list'),
  watchEmpty: document.getElementById('watch-empty'),
  addDone: document.getElementById('add-done'),
  closures: document.getElementById('closures'),
  zones: document.getElementById('zones'),
};

function fold(value) {
  return toLatin(value)
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

function iconTile(name, tone) {
  const tile = el('span', { className: `tile tile-${tone}`, attrs: { 'aria-hidden': 'true' } });
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ICONS[name]}</svg>`,
    'image/svg+xml',
  ).documentElement;
  tile.append(document.importNode(svg, true));
  return tile;
}

function watchKey(watch) {
  return watch.kind === 'ZONE' ? `ZONE:${watch.value}` : `PLACE:${fold(watch.value)}`;
}

function watchLabel(watch) {
  return watch.kind === 'ZONE' ? t('zone', { zone: watch.value }) : local(watch.value);
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
  if (!exists) trackEvent('add_watch', { kind });
  saveWatches();
  renderAll();
  syncSubscription();
}

function watchMatchesClosure(watch, closure) {
  if (watch.kind === 'ZONE') return watch.value === closure.zone;
  const needle = fold(watch.value);
  return needle.length >= 3 && ` ${fold(closure.text)} `.includes(` ${needle} `);
}

function noticeMatches(notice) {
  return state.watches.some(watch => watch.kind === 'PLACE' && watchMatchesClosure(watch, notice));
}

function noticeEpoch(notice) {
  return Date.parse(`${notice.date}T12:00:00Z`);
}

function noticeList() {
  return state.plan.notices ?? [];
}

function closureMatches(closure) {
  return state.watches.some(watch => watchMatchesClosure(watch, closure));
}

function upcomingClosuresFor(watch) {
  const now = Date.now();
  return state.plan.closures
    .filter(closure => closure.end > now && watchMatchesClosure(watch, closure))
    .sort((first, second) => first.start - second.start);
}

function endsAnotherDay(closure) {
  return formatDayLabel(closure.end) !== formatDayLabel(closure.start);
}

function endTimeText(closure) {
  const endTime = timeFormat.format(closure.end);
  return endsAnotherDay(closure) && endTime === '00:00' ? '24:00' : endTime;
}

function formatWindow(closure) {
  const endTime = endTimeText(closure);
  const suffix = endsAnotherDay(closure) && endTime !== '24:00' ? ` (${t('plan.nextDay')})` : '';
  return `${timeFormat.format(closure.start)} – ${endTime}${suffix}`;
}

function dayHeading(epochMs) {
  const relative = formatRelativeDay(epochMs);
  const label = formatDayLabel(epochMs);
  return relative === label ? label : `${relative} · ${label}`;
}

function statusFor(upcoming) {
  const now = Date.now();
  const live = upcoming.find(closure => closure.start <= now);
  if (live) {
    const endsToday = formatRelativeDay(live.end) === formatRelativeDay(now);
    const until = endsToday ? endTimeText(live) : `${formatRelativeDay(live.end)} ${endTimeText(live)}`;
    return { tone: 'bad', title: t('status.liveNow'), detail: t('status.until', { time: until }) };
  }
  const next = upcoming[0];
  if (next) {
    return { tone: 'warn', title: t('status.next'), detail: `${formatRelativeDay(next.start)} · ${formatWindow(next)}` };
  }
  return { tone: 'ok', title: t('status.none'), detail: t('status.noneDetail') };
}

function linkButton(text, onClick) {
  return el('button', { text, className: 'link-btn', attrs: { type: 'button' }, onClick });
}

function addToCalendar(closure, name) {
  const summary = t('cal.title', { name });
  const description = `${t('cal.description')} ${t('zone', { zone: closure.zone })}.`;
  downloadIcs(buildIcs(closure, { summary, description, reminder: summary }));
  trackEvent('add_to_calendar');
}

async function shareText(text, button) {
  const url = location.origin;
  trackEvent('share');
  if (navigator.share) {
    await navigator.share({ title: t('app.title'), text, url }).catch(() => undefined);
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
  } catch {
    return;
  }
  const label = button.textContent;
  button.textContent = t('share.copied');
  setTimeout(() => { button.textContent = label; }, 1800);
}

function scheduleItem(closure, showZone, watch) {
  const live = closure.start <= Date.now();
  return el('li', {}, [
    el('strong', { text: formatRelativeDay(closure.start) }),
    el('span', { text: ` · ${formatWindow(closure)}` }),
    ...(showZone ? [el('span', { text: ` · ${t('zone', { zone: closure.zone })}` })] : []),
    ...(live ? [el('span', { text: t('plan.live'), className: 'badge live' })] : []),
    ...(live ? [] : [linkButton(t('card.calendar'), () => addToCalendar(closure, watchLabel(watch)))]),
  ]);
}

function homeCard(watch) {
  const upcoming = upcomingClosuresFor(watch);
  const status = statusFor(upcoming);
  const key = watchKey(watch);
  const card = el('article', { className: `home-card tone-${status.tone}` }, [
    el('p', { text: watchLabel(watch), className: 'home-card-name' }),
    el('p', { text: status.title, className: 'home-card-title' }),
    el('p', { text: status.detail, className: 'home-card-detail' }),
  ]);
  const nextClosure = upcoming.find(closure => closure.start > Date.now());
  card.append(
    el('div', { className: 'card-actions' }, [
      ...(nextClosure ? [linkButton(t('card.calendar'), () => addToCalendar(nextClosure, watchLabel(watch)))] : []),
      linkButton(t('card.share'), event =>
        shareText(t('share.cardText', { name: watchLabel(watch), title: status.title, detail: status.detail }), event.currentTarget),
      ),
    ]),
  );
  if (upcoming.length > 1) {
    const details = el('details', { className: 'all-times', attrs: { 'data-key': key } }, [
      el('summary', { text: t('home.allTimes', { count: upcoming.length }) }),
      el('ul', {}, upcoming.map(closure => scheduleItem(closure, watch.kind !== 'ZONE', watch))),
    ]);
    details.open = state.openDetails.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) state.openDetails.add(key);
      else state.openDetails.delete(key);
    });
    card.append(details);
  }
  return card;
}

function noticeBody(notice) {
  return el('div', { className: 'notice-body' }, notice.lines.map(line => el('p', { text: local(line) })));
}

const KIND_TONE = { breakdown: 'bad', closure: 'bad', shutdown: 'bad', shortage: 'warn' };

function noticeKind(notice) {
  return KIND_TONE[notice.kind] ? notice.kind : 'breakdown';
}

function noticeSummary(notice) {
  const text = notice.text.replace(/^obavje[sš]tavamo (potro[sš]a[cč]e )?/i, '');
  return local(text.length > 110 ? `${text.slice(0, 110).trim()}…` : text);
}

function noticeCard(notice) {
  const details = el('details', { className: 'all-times', attrs: { 'data-key': notice.id } }, [
    el('summary', { text: t('notices.read') }),
    noticeBody(notice),
  ]);
  details.open = state.openDetails.has(notice.id);
  details.addEventListener('toggle', () => {
    if (details.open) {
      state.openDetails.add(notice.id);
      trackEvent('read_notice', { kind: noticeKind(notice) });
    } else {
      state.openDetails.delete(notice.id);
    }
  });
  const kind = noticeKind(notice);
  return el('article', { className: `home-card notice-card tone-${KIND_TONE[kind]}` }, [
    el('p', { text: `${t(`kind.${kind}`)} · ${t('notices.mine')} · ${formatRelativeDay(noticeEpoch(notice))}`, className: 'home-card-name' }),
    el('p', { text: local(notice.title), className: 'home-card-title' }),
    el('p', { text: noticeSummary(notice), className: 'home-card-detail' }),
    details,
  ]);
}

function noticeCards() {
  const notices = noticeList();
  const fresh = notice => noticeEpoch(notice) >= Date.now() - HOME_NOTICE_DAYS * DAY_MS;
  const mine = notices.filter(notice => fresh(notice) && noticeMatches(notice));
  const recentOthers = notices.filter(notice => !noticeMatches(notice) && noticeEpoch(notice) >= Date.now() - 1.5 * DAY_MS);
  const shortage = recentOthers.filter(notice => notice.kind === 'shortage');
  const others = recentOthers.filter(notice => notice.kind !== 'shortage');
  const cards = mine.map(noticeCard);
  if (shortage.length > 0) {
    cards.push(
      el('button', { className: 'home-card home-link tone-warn', attrs: { type: 'button' }, onClick: () => navigate('notices') }, [
        el('p', { text: t('home.shortage'), className: 'home-card-title' }),
        el('p', { text: t('home.shortageDetail'), className: 'home-card-detail' }),
      ]),
    );
  }
  if (others.length > 0) {
    cards.push(
      el('button', { className: 'home-card home-link', attrs: { type: 'button' }, onClick: () => navigate('notices') }, [
        el('p', { text: t('home.noticesOther', { count: others.length }), className: 'home-card-title' }),
        el('p', { text: t('home.noticesOtherDetail'), className: 'home-card-detail muted' }),
      ]),
    );
  }
  return cards;
}

function renderHome() {
  renderBanner();
  if (state.watches.length === 0) {
    nodes.homeContent.replaceChildren(
      ...noticeCards(),
      el('div', { className: 'empty-state' }, [
        iconTile('drop', 'blue'),
        el('h2', { text: t('home.emptyTitle') }),
        el('p', { text: t('home.emptyText'), className: 'muted' }),
        el('button', { text: t('home.add'), className: 'btn primary', attrs: { type: 'button' }, onClick: () => navigate('add') }),
      ]),
    );
    return;
  }
  nodes.homeContent.replaceChildren(
    ...noticeCards(),
    ...state.watches.map(homeCard),
    el('button', { text: t('home.addMore'), className: 'btn wide', attrs: { type: 'button' }, onClick: () => navigate('add') }),
  );
}

function alertsMode() {
  if (isIosBrowserTab()) return 'ios';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

function renderBanner() {
  const mode = alertsMode();
  const needsBanner = state.watches.length > 0 && !state.subscription && (mode === 'ready' || mode === 'ios');
  if (!needsBanner) {
    nodes.homeBanner.replaceChildren();
    return;
  }
  nodes.homeBanner.replaceChildren(
    el('div', { className: 'banner' }, [
      iconTile('bell', 'orange'),
      el('p', { text: t('home.bannerText'), className: 'banner-text' }),
      el('button', {
        text: t('home.bannerButton'),
        className: 'btn primary small',
        attrs: { type: 'button' },
        onClick: () => (mode === 'ios' ? navigate('alerts') : startEnableAlerts()),
      }),
    ]),
  );
}

function renderMenuValues() {
  nodes.menuAddValue.textContent = state.watches.length > 0 ? t('menu.selected', { count: state.watches.length }) : '';
  nodes.menuAlertsValue.textContent = state.subscription ? t('menu.on') : t('menu.off');
  nodes.menuNoticesValue.textContent = noticeList().length > 0 ? String(noticeList().length) : '';
}

function renderLanguageSwitch() {
  nodes.languageSwitch.replaceChildren(
    ...LANGUAGES.map(lang =>
      el('button', {
        text: LANGUAGE_LABELS[lang],
        className: 'lang-btn',
        attrs: { type: 'button', 'aria-pressed': String(getLanguage() === lang), lang: lang === 'sr' ? 'sr-Cyrl' : lang },
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
      el('li', { className: 'watch-item' }, [
        el('div', { className: 'watch-head' }, [
          el('span', { text: watchLabel(watch), className: 'watch-name' }),
          el('button', {
            text: '×',
            className: 'watch-remove',
            attrs: { type: 'button', 'aria-label': t('watch.remove', { name: watchLabel(watch) }) },
            onClick: () => toggleWatch(watch.kind, watch.value),
          }),
        ]),
      ]),
    ),
  );
}

function renderNotices() {
  const notices = noticeList();
  if (notices.length === 0) {
    nodes.notices.replaceChildren(el('p', { text: t('notices.none'), className: 'muted' }));
    return;
  }
  nodes.notices.replaceChildren(
    ...notices.map(notice => {
      const mine = noticeMatches(notice);
      const badges = [el('span', { text: t(`kind.${noticeKind(notice)}`), className: 'badge' })];
      if (mine) badges.push(el('span', { text: t('notices.mine'), className: 'badge mine' }));
      return el('article', { className: `notice${mine ? ' mine' : ''}` }, [
        el('div', { className: 'closure-head' }, [
          el('strong', { text: local(notice.title) }),
          el('span', { className: 'row' }, badges),
        ]),
        el('p', { text: dayHeading(noticeEpoch(notice)), className: 'muted' }),
        noticeBody(notice),
      ]);
    }),
  );
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
        el('p', { text: dayHeading(closure.start), className: 'muted' }),
        el('ul', {}, closure.lines.map(line => el('li', { text: local(line) }))),
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
              text: local(place),
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
    nodes.updated.textContent = navigator.onLine ? t('header.loading') : t('plan.loadFailed');
    return;
  }
  const key = navigator.onLine ? 'plan.updated' : 'plan.offline';
  nodes.updated.textContent = t(key, { time: timeFormat.format(state.plan.fetchedAt) });
}

function renderAll() {
  renderLanguageSwitch();
  renderUpdated();
  renderHome();
  renderMenuValues();
  renderZonePicker();
  renderWatchList();
  renderNotices();
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

function setSuggestionsOpen(open) {
  nodes.suggestions.hidden = !open;
  nodes.searchInput.setAttribute('aria-expanded', String(open));
  nodes.searchInput.removeAttribute('aria-activedescendant');
}
let suggestionValues = [];

function renderSuggestions() {
  const query = nodes.searchInput.value;
  const items = allSuggestions(query);
  const typed = query.trim();
  const showTyped = fold(typed).length >= 3 && !items.some(item => fold(item.place) === fold(typed));
  const rows = items.map(item => ({ value: item.place, tag: t('zone', { zone: item.zone }) }));
  if (showTyped) rows.push({ value: toLatin(typed), tag: t('watch.addTyped') });
  suggestionValues = rows.map(row => row.value);
  activeSuggestion = -1;
  setSuggestionsOpen(rows.length > 0);
  nodes.suggestions.replaceChildren(
    ...rows.map((row, index) =>
      el(
        'li',
        { attrs: { id: `suggestion-${index}`, role: 'option', 'aria-selected': 'false' } },
        [el('span', { text: local(row.value) }), el('span', { text: row.tag, className: 'tag' })],
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
  setSuggestionsOpen(false);
}

function moveSuggestion(step) {
  const options = [...nodes.suggestions.children];
  if (options.length === 0) return;
  activeSuggestion = (activeSuggestion + step + options.length) % options.length;
  options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSuggestion)));
  nodes.searchInput.setAttribute('aria-activedescendant', `suggestion-${activeSuggestion}`);
}

nodes.searchInput.addEventListener('input', renderSuggestions);
nodes.searchInput.addEventListener('blur', () => setSuggestionsOpen(false));
nodes.searchInput.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestion(1); }
  if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestion(-1); }
  if (event.key === 'Enter') {
    event.preventDefault();
    const chosen = suggestionValues[Math.max(activeSuggestion, 0)];
    if (chosen) pickSuggestion(chosen);
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
  const mode = alertsMode();
  if (mode === 'ios') {
    nodes.alertsText.textContent = t('alerts.ios');
    nodes.alertsHint.textContent = t('alerts.iosHint');
    nodes.alertsHint.hidden = false;
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (mode === 'unsupported') {
    nodes.alertsText.textContent = t('alerts.unsupported');
    nodes.alertsToggle.hidden = true;
    return;
  }
  if (mode === 'blocked') {
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
    renderAll();
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch('/api/vapid')).json();
  state.subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(publicKey),
  });
  await syncSubscription();
  trackEvent('enable_alerts');
  renderAll();
}

async function disableAlerts() {
  if (!state.subscription) return;
  const endpoint = state.subscription.endpoint;
  await state.subscription.unsubscribe();
  state.subscription = null;
  await postJson('/api/unsubscribe', { endpoint }).catch(() => undefined);
  renderAll();
}

async function toggleAlerts(action) {
  nodes.alertsToggle.disabled = true;
  state.alertsMessage = '';
  try {
    await action();
  } catch {
    showAlertsMessage('alerts.failed');
  } finally {
    nodes.alertsToggle.disabled = false;
  }
}

function startEnableAlerts() {
  toggleAlerts(enableAlerts);
}

nodes.alertsToggle.addEventListener('click', () => toggleAlerts(state.subscription ? disableAlerts : enableAlerts));

function changeLanguage(lang) {
  setLanguage(lang);
  trackEvent('change_language', { language: lang });
  state.alertsMessage = '';
  applyStaticTexts();
  renderAll();
  syncSubscription();
}

function screenFromHash() {
  const name = location.hash.slice(1);
  return SCREENS.includes(name) ? name : 'home';
}

function showScreen(name, moveFocus = true) {
  for (const section of nodes.screens) {
    section.hidden = section.dataset.screen !== name;
  }
  window.scrollTo(0, 0);
  const heading = document.querySelector(`[data-screen="${name}"] h1, [data-screen="${name}"] h2`);
  if (moveFocus && heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function navigate(name) {
  if (name === screenFromHash()) return;
  const depth = (history.state?.depth ?? 0) + 1;
  history.pushState({ screen: name, depth }, '', name === 'home' ? location.pathname : `#${name}`);
  showScreen(name);
}

function goBack() {
  if ((history.state?.depth ?? 0) > 0) {
    history.back();
    return;
  }
  history.replaceState({ screen: 'home', depth: 0 }, '', location.pathname);
  showScreen('home');
}

window.addEventListener('popstate', () => showScreen(screenFromHash()));

nodes.menuButton.addEventListener('click', () => navigate('menu'));
nodes.addDone.addEventListener('click', () => navigate('home'));
document.getElementById('menu-share').addEventListener('click', event =>
  shareText(t('share.appText'), event.currentTarget.querySelector('.menu-label')),
);
window.addEventListener('offline', renderUpdated);
window.addEventListener('online', () => {
  renderUpdated();
  loadDataQuietly();
});
document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
document.querySelectorAll('[data-nav-back]').forEach(button => button.addEventListener('click', goBack));

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

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function trackVisit() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    return;
  }
  const visitor = visitorId();
  if (!visitor) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  fetch('/api/hit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visitor, lang: getLanguage(), standalone }),
    keepalive: true,
  }).catch(() => {});
}

async function init() {
  history.replaceState({ screen: screenFromHash(), depth: 0 }, '', location.href);
  showScreen(screenFromHash(), false);
  applyStaticTexts();
  renderAll();
  initAnalytics();
  trackVisit();
  await loadDataQuietly();
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.register('/sw.js').catch(() => null) : null;
  if (registration && pushSupported() && !isIosBrowserTab()) {
    state.subscription = await registration.pushManager.getSubscription();
    renderAll();
    syncSubscription();
  }
  setInterval(loadDataQuietly, 5 * 60 * 1000);
}

init();
