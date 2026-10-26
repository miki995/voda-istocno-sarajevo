import { initAnalytics, trackEvent } from './analytics.js';
import { LANGUAGES, LANGUAGE_LABELS, applyStaticTexts, dayKeyOf, formatDayLabel, formatDuration, formatRelativeDay, getLanguage, local, setLanguage, t } from './i18n.js';
import { buildIcs, downloadIcs } from './calendar.js';
import { createZoneMap, getPosition, nearestPlaces, ZONE_COLORS } from './map.js';
import { downloadBlob, renderWeekImage } from './share-image.js';
import { toLatin } from './translit.js';

const STORAGE_KEY = 'voda-watches';
const ZONE_NAMES = ['I', 'II', 'III'];
const TIME_ZONE = 'Europe/Sarajevo';
const SCREENS = ['home', 'menu', 'add', 'notices', 'plan', 'map', 'settings'];
const TEXT_SIZES = { normal: 'A', large: 'A+', xlarge: 'A++' };
const TEXT_KEY = 'voda-text';
const CRON_SILENT_MS = 60 * 60 * 1000;
const LOCATE_RADIUS_M = 1500;
const INSTALL_KEY = 'voda-install-snoozed';
const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOME_NOTICE_DAYS = 3;
const VISITOR_KEY = 'voda-visitor';
const SESSION_KEY = 'voda-session-counted';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const ICONS = {
  warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
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
  history: [],
  placeCoords: [],
  zoneMap: null,
  textSize: loadTextSize(),
};

const nodes = {
  screens: [...document.querySelectorAll('[data-screen]')],
  updated: document.getElementById('updated'),
  homeBanner: document.getElementById('home-banner'),
  homeContent: document.getElementById('home-content'),
  menuButton: document.getElementById('menu-button'),
  menuAddValue: document.getElementById('menu-add-value'),
  menuNoticesValue: document.getElementById('menu-notices-value'),
  notices: document.getElementById('notices'),
  languageSwitch: document.getElementById('language-switch'),
  alertsText: document.getElementById('alerts-text'),
  alertsToggle: document.getElementById('alerts-toggle'),
  alertsHint: document.getElementById('alerts-hint'),
  searchInput: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  watchList: document.getElementById('watch-list'),
  watchEmpty: document.getElementById('watch-empty'),
  addDone: document.getElementById('add-done'),
  planNone: document.getElementById('plan-none'),
  shareWeek: document.getElementById('share-week'),
  zoneSheet: document.getElementById('zone-sheet'),
  zoneSheetTitle: document.getElementById('zone-sheet-title'),
  zoneSheetPlaces: document.getElementById('zone-sheet-places'),
  zoneBackdrop: document.getElementById('zone-backdrop'),
  weekGrid: document.getElementById('week-grid'),
  textSizeSwitch: document.getElementById('text-size-switch'),
  locateButton: document.getElementById('locate-button'),
  locateMessage: document.getElementById('locate-message'),
  locateHint: document.getElementById('locate-hint'),
  installSheet: document.getElementById('install-sheet'),
  installText: document.getElementById('install-text'),
  installGo: document.getElementById('install-go'),
  installLater: document.getElementById('install-later'),
  installButton: document.getElementById('install-button'),
  locateResults: document.getElementById('locate-results'),
  zoneMapBox: document.getElementById('zone-map'),
  mapLegend: document.getElementById('map-legend'),
  mapMessage: document.getElementById('map-message'),
  mapLocate: document.getElementById('map-locate'),
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

function loadTextSize() {
  try {
    const stored = localStorage.getItem(TEXT_KEY);
    return stored in TEXT_SIZES ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

function setTextSize(size) {
  state.textSize = size;
  document.documentElement.dataset.text = size;
  try {
    localStorage.setItem(TEXT_KEY, size);
  } catch {
    return;
  }
  renderTextSizeSwitch();
}

function renderTextSizeSwitch() {
  nodes.textSizeSwitch.replaceChildren(
    ...Object.entries(TEXT_SIZES).map(([size, label]) =>
      el('button', {
        text: label,
        className: 'lang-btn',
        attrs: { type: 'button', 'aria-pressed': String(state.textSize === size), 'aria-label': t(`text.${size}`) },
        onClick: () => setTextSize(size),
      }),
    ),
  );
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
    return { tone: 'bad', title: t('status.liveNow'), detail: `${t('status.until', { time: until })} · ${t('count.left', { duration: formatDuration(live.end - now) })}` };
  }
  const next = upcoming[0];
  if (next) {
    const countdown = next.start - now < DAY_MS ? ` · ${t('count.in', { duration: formatDuration(next.start - now) })}` : '';
    return { tone: 'warn', title: t('status.next'), detail: `${formatRelativeDay(next.start)} · ${formatWindow(next)}${countdown}` };
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

function pastSummary(watch) {
  const now = Date.now();
  const hits = state.history.filter(closure => closure.end <= now && closure.end >= now - 30 * DAY_MS && watchMatchesClosure(watch, closure));
  if (hits.length === 0) return '';
  const totalMs = hits.reduce((total, closure) => total + (closure.end - closure.start), 0);
  const hours = Math.round(totalMs / (60 * 60 * 1000));
  const average = hits.length > 1 ? ` · ${t('stats.avg', { avg: Math.round(totalMs / hits.length / (60 * 60 * 1000)) })}` : '';
  return `${t('stats.last30', { count: hits.length, hours })}${average}`;
}

// "No news" is not a problem. The notice only appears when the check itself fails: the site cannot be read, or the check has stopped running.
function sourceTrouble() {
  const { checkedAt, problem } = state.plan;
  if (!navigator.onLine || !checkedAt) return false;
  return Date.now() - checkedAt > CRON_SILENT_MS || problem === 'fetch-failed' || problem === 'layout-changed';
}

function sourceNotice() {
  if (!sourceTrouble()) return [];
  return [
    el('div', { className: 'banner' }, [
      iconTile('warn', 'red'),
      el('div', { className: 'banner-text' }, [
        el('p', { text: t('source.stale', { time: timeFormat.format(state.plan.checkedAt) }) }),
        el('div', { className: 'card-actions' }, [
          el('a', { text: t('source.facebook'), className: 'link-btn', attrs: { href: 'https://www.facebook.com/vodovodistocnosarajevo/', rel: 'noopener' } }),
          el('a', { text: t('source.call'), className: 'link-btn', attrs: { href: 'tel:+38757342742' } }),
        ]),
      ]),
    ]),
  ];
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
  const past = pastSummary(watch);
  if (past) {
    card.append(el('p', { text: past, className: 'home-card-detail muted' }));
  }
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
      watchGrid(upcoming),
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
      ...sourceNotice(),
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
    ...sourceNotice(),
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
  if (inAppBrowser()) {
    renderInAppBanner();
    return;
  }
  const mode = alertsMode();
  if (state.subscription || (mode !== 'ready' && mode !== 'ios')) {
    nodes.homeBanner.replaceChildren();
    return;
  }
  nodes.homeBanner.replaceChildren(
    el('div', { className: 'banner' }, [
      iconTile('bell', 'orange'),
      el('p', { text: t(mode === 'ios' ? 'alerts.ios' : 'home.bannerText'), className: 'banner-text' }),
      el('button', {
        text: t(mode === 'ios' ? 'install.how' : 'home.bannerButton'),
        className: 'btn primary small',
        attrs: { type: 'button' },
        onClick: () => (mode === 'ios' ? showInstallSheet() : startEnableAlerts()),
      }),
    ]),
  );
}

function renderMenuValues() {
  nodes.menuAddValue.textContent = state.watches.length > 0 ? t('menu.selected', { count: state.watches.length }) : '';
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

let openZone = null;

function renderZoneSheet() {
  nodes.zoneSheet.hidden = openZone === null;
  nodes.zoneBackdrop.hidden = openZone === null;
  if (openZone === null) return;
  nodes.zoneSheetTitle.textContent = t('zone', { zone: openZone });
  const places = [...(state.zonePlaces[openZone] ?? [])].sort((first, second) => first.localeCompare(second, 'sr'));
  nodes.zoneSheetPlaces.replaceChildren(
    ...(places.length === 0
      ? [el('p', { text: t('zones.none'), className: 'muted' })]
      : places.map(place =>
          el('button', {
            text: local(place),
            className: 'place',
            attrs: { type: 'button', 'aria-pressed': String(hasWatch('PLACE', place)) },
            onClick: () => toggleWatch('PLACE', place),
          }),
        )),
  );
}

function openZoneSheet(zone) {
  openZone = zone;
  renderZoneSheet();
  nodes.zoneSheetTitle.setAttribute('tabindex', '-1');
  nodes.zoneSheetTitle.focus({ preventScroll: true });
}

function closeZoneSheet() {
  openZone = null;
  renderZoneSheet();
}

document.getElementById('zone-sheet-close').addEventListener('click', closeZoneSheet);
nodes.zoneBackdrop.addEventListener('click', closeZoneSheet);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openZone !== null) closeZoneSheet();
});

async function shareWeekImage() {
  nodes.shareWeek.disabled = true;
  try {
    const now = Date.now();
    const rows = Array.from({ length: 7 }, (_, offset) => {
      const day = now + offset * DAY_MS;
      const [weekday, date] = formatDayLabel(day).split(', ');
      return {
        day: offset === 0 ? t('day.today') : offset === 1 ? t('day.tomorrow') : weekday,
        date,
        cells: ZONE_NAMES.map(zone => closuresOnDay(state.plan.closures.filter(closure => closure.zone === zone), offset, now).map(compactWindow)),
      };
    });
    const blob = await renderWeekImage({
      title: t('img.title'),
      heading: t('plan.week'),
      heads: ZONE_NAMES.map(zone => ({ label: t('zone', { zone }), color: ZONE_COLORS[zone] })),
      rows,
      footer: t('img.footer', { host: location.host }),
    });
    const file = new File([blob], 'voda-sedmica.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: t('app.title'), url: location.origin }).catch(() => undefined);
    } else {
      downloadBlob(blob, 'voda-sedmica.png');
    }
    trackEvent('share_image');
  } finally {
    nodes.shareWeek.disabled = false;
  }
}

nodes.shareWeek.addEventListener('click', shareWeekImage);

function compactWindow(closure) {
  return `${timeFormat.format(closure.start)}–${endTimeText(closure)}`;
}

function dayCellLabel(offset, day) {
  const [weekday, date] = formatDayLabel(day).split(', ');
  return el('span', { text: `${offset === 0 ? t('day.today') : offset === 1 ? t('day.tomorrow') : weekday}\n${date}`, className: 'wg-day' });
}

// A closure belongs to the day it starts on; one that began yesterday and is still going belongs to today.
function closuresOnDay(closures, offset, now) {
  const key = dayKeyOf(now + offset * DAY_MS);
  return closures.filter(closure => dayKeyOf(closure.start) === key || (offset === 0 && closure.start <= now && closure.end > now)).sort((first, second) => first.start - second.start);
}

function windowsCell(closures, now, extraClass = '') {
  const mine = closures.some(closureMatches);
  const live = closures.some(closure => closure.start <= now && closure.end > now);
  return el(
    'span',
    { className: `wg-cell${extraClass}${mine ? ' mine' : ''}${live ? ' live' : ''}${closures.length === 0 ? ' empty' : ''}` },
    closures.length === 0 ? [el('span', { text: '–' })] : closures.map(closure => el('span', { text: compactWindow(closure) })),
  );
}

// One row per day, one column per zone: a quick look at when it is a good day to do the laundry.
function renderWeekGrid() {
  const now = Date.now();
  nodes.planNone.hidden = state.plan.closures.length > 0;
  nodes.planNone.textContent = t('plan.none');
  const cells = [
    el('span'),
    ...ZONE_NAMES.map(zone => el('button', { text: t('zone', { zone }), className: 'wg-head', attrs: { type: 'button' }, onClick: () => openZoneSheet(zone) })),
  ];
  for (let offset = 0; offset < 7; offset += 1) {
    cells.push(dayCellLabel(offset, now + offset * DAY_MS));
    for (const zone of ZONE_NAMES) {
      cells.push(windowsCell(closuresOnDay(state.plan.closures.filter(closure => closure.zone === zone), offset, now), now));
    }
  }
  nodes.weekGrid.replaceChildren(...cells);
}

function minutesOfDay(epochMs) {
  const [hours, minutes] = timeFormat.format(epochMs).split(':').map(Number);
  return hours * 60 + minutes;
}

// The stretches of one day (in minutes since midnight) without water, including the end of an outage that began the evening before.
function daySegments(closures, key, now) {
  const segments = [];
  for (const closure of closures) {
    const live = closure.start <= now && closure.end > now;
    const endsThatDay = dayKeyOf(closure.end - 1) === key;
    if (dayKeyOf(closure.start) === key) {
      segments.push({ from: minutesOfDay(closure.start), to: endsThatDay ? minutesOfDay(closure.end) || 1440 : 1440, live });
    } else if (endsThatDay) {
      segments.push({ from: 0, to: minutesOfDay(closure.end) || 1440, live });
    }
  }
  return segments;
}

function dayBar(segments) {
  const bar = el('div', { className: 'wg-bar', attrs: { 'aria-hidden': 'true' } });
  for (const segment of segments) {
    const mark = el('span', { className: `wg-seg${segment.live ? ' live' : ''}` });
    mark.style.left = `${(segment.from / 1440) * 100}%`;
    mark.style.width = `${((segment.to - segment.from) / 1440) * 100}%`;
    bar.append(mark);
  }
  return bar;
}

// The same grid for one street or zone: the seven days, the hours without water as text and as a bar over the 24 hours.
function watchGrid(closures) {
  const now = Date.now();
  const cells = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = now + offset * DAY_MS;
    const key = dayKeyOf(day);
    const items = closuresOnDay(closures, offset, now);
    const times = el('div', { className: 'wg-times' }, items.length === 0 ? [el('span', { text: '–' })] : items.map(closure => el('span', { text: compactWindow(closure) })));
    cells.push(
      dayCellLabel(offset, day),
      el('span', { className: `wg-cell row${items.length === 0 ? ' empty' : ''}` }, items.length === 0 ? [times] : [times, dayBar(daySegments(closures, key, now))]),
    );
  }
  return el('div', { className: 'week-grid single' }, cells);
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
  nodes.updated.textContent = t(key, { time: timeFormat.format(state.plan.checkedAt || state.plan.fetchedAt) });
}

function renderAll() {
  renderLanguageSwitch();
  renderTextSizeSwitch();
  renderLegend();
  state.zoneMap?.refresh();
  renderUpdated();
  renderHome();
  renderMenuValues();
  renderWatchList();
  renderNotices();
  renderZoneSheet();
  renderWeekGrid();
  renderAlertsState();
  renderInstallButton();
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

function formatDistance(meters) {
  return meters < 1000 ? t('distance.m', { value: Math.max(10, Math.round(meters / 10) * 10) }) : t('distance.km', { value: (meters / 1000).toFixed(1) });
}

function renderLegend() {
  nodes.mapLegend.replaceChildren(
    ...ZONE_NAMES.map(zone => {
      const dot = el('i');
      dot.style.background = ZONE_COLORS[zone];
      return el('span', {}, [dot, el('span', { text: t('zone', { zone }) })]);
    }),
  );
}

function showLocateResults(position) {
  const nearby = nearestPlaces(state.placeCoords, position, 3);
  const close = nearby.filter(place => place.distance <= LOCATE_RADIUS_M);
  const shown = close.length > 0 ? close : nearby.slice(0, 1);
  nodes.locateMessage.textContent = shown.length === 0 ? t('locate.unavailable') : close.length > 0 ? t('locate.found') : t('locate.far');
  nodes.locateResults.replaceChildren(
    ...shown.map(place =>
      el('button', {
        text: `${local(place.place)} · ${t('zone', { zone: place.zone })} · ${formatDistance(place.distance)}`,
        className: 'place',
        attrs: { type: 'button', 'aria-pressed': String(hasWatch('PLACE', place.place)) },
        onClick: () => {
          if (!hasWatch('PLACE', place.place)) toggleWatch('PLACE', place.place);
          showLocateResults(position);
        },
      }),
    ),
  );
}

function locationErrorKey(error) {
  return error?.code === 1 ? 'locate.denied' : 'locate.unavailable';
}

async function locateMe() {
  nodes.locateButton.disabled = true;
  nodes.locateHint.hidden = true;
  nodes.locateResults.replaceChildren();
  nodes.locateMessage.textContent = t('locate.working');
  try {
    showLocateResults(await getPosition());
    trackEvent('locate_street');
  } catch (error) {
    nodes.locateMessage.textContent = t(locationErrorKey(error));
  } finally {
    nodes.locateButton.disabled = false;
    nodes.locateHint.hidden = false;
  }
}

async function openMap() {
  nodes.mapMessage.textContent = '';
  try {
    if (!state.zoneMap) {
      const places = state.placeCoords;
      const created = await createZoneMap(nodes.zoneMapBox, places, {
        isWatched: place => hasWatch('PLACE', place),
        onToggle: place => toggleWatch('PLACE', place),
        text: { name: local, zone: zone => t('zone', { zone }), add: t('map.add'), remove: t('map.remove') },
      });
      if (places !== state.placeCoords) {
        created.destroy();
        return openMap();
      }
      state.zoneMap = created;
    }
    state.zoneMap.refresh();
  } catch {
    nodes.mapMessage.textContent = t('map.needsInternet');
  }
}

async function locateOnMap() {
  nodes.mapLocate.disabled = true;
  nodes.mapMessage.textContent = '';
  try {
    const position = await getPosition();
    await openMap();
    state.zoneMap?.showPosition(position);
  } catch (error) {
    nodes.mapMessage.textContent = t(locationErrorKey(error));
  } finally {
    nodes.mapLocate.disabled = false;
  }
}

nodes.locateButton.addEventListener('click', locateMe);
nodes.mapLocate.addEventListener('click', locateOnMap);

let installPrompt = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function installMode() {
  if (isStandalone()) return null;
  if (installPrompt) return 'prompt';
  return isIosBrowserTab() ? 'ios' : null;
}

function installSnoozed() {
  try {
    const at = Number(localStorage.getItem(INSTALL_KEY));
    return at > 0 && Date.now() - at < INSTALL_SNOOZE_MS;
  } catch {
    return false;
  }
}

function showInstallSheet() {
  const mode = installMode();
  if (!mode) return;
  nodes.installText.textContent = t(mode === 'ios' ? 'install.iosText' : 'install.text');
  nodes.installGo.textContent = t(mode === 'ios' ? 'install.gotIt' : 'install.button');
  nodes.installSheet.hidden = false;
}

function hideInstallSheet(snooze) {
  nodes.installSheet.hidden = true;
  if (!snooze) return;
  try {
    localStorage.setItem(INSTALL_KEY, String(Date.now()));
  } catch {
    return;
  }
}

// The offer appears on the home screen, once the person has picked a street, and not again for two weeks after "Not now".
function maybeOfferInstall() {
  if (installMode() && !installSnoozed() && state.watches.length > 0 && screenFromHash() === 'home') showInstallSheet();
}

async function runInstall() {
  if (installMode() === 'prompt') {
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    trackEvent('install_choice', { outcome: choice.outcome });
    hideInstallSheet(choice.outcome !== 'accepted');
  } else {
    hideInstallSheet(true);
  }
  renderInstallButton();
}

function renderInstallButton() {
  nodes.installButton.hidden = !installMode();
}

nodes.installGo.addEventListener('click', runInstall);
nodes.installLater.addEventListener('click', () => hideInstallSheet(true));
nodes.installButton.addEventListener('click', showInstallSheet);
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  renderInstallButton();
  setTimeout(maybeOfferInstall, 2000);
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  hideInstallSheet(false);
  renderInstallButton();
  trackEvent('install_app');
});

// Instagram, Facebook and similar apps open links in their own browser, where alerts and installing do not work.
function inAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|Messenger|Viber|Line\//i.test(navigator.userAgent);
}

function renderInAppBanner() {
  const android = /Android/i.test(navigator.userAgent);
  const button = el('button', {
    text: t(android ? 'inapp.openChrome' : 'inapp.copy'),
    className: 'btn primary small',
    attrs: { type: 'button' },
    onClick: async event => {
      if (android) {
        location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;
        return;
      }
      try {
        await navigator.clipboard.writeText(location.origin);
        event.currentTarget.textContent = t('share.copied');
      } catch {
        event.currentTarget.textContent = location.host;
      }
    },
  });
  nodes.homeBanner.replaceChildren(
    el('div', { className: 'banner' }, [iconTile('warn', 'orange'), el('p', { text: t('inapp.text'), className: 'banner-text' }), button]),
  );
}

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
  if (name === 'map') openMap();
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
nodes.addDone.addEventListener('click', () => {
  navigate('home');
  setTimeout(maybeOfferInstall, 800);
});
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
  const [plan, zonePlaces, history, placeCoords] = await Promise.all([
    fetch('/api/plan').then(response => response.json()),
    fetch('/api/zones').then(response => response.json()),
    fetch('/api/history').then(response => response.json()).catch(() => state.history),
    fetch('/places.json').then(response => response.json()).catch(() => state.placeCoords),
  ]);
  state.plan = plan;
  state.zonePlaces = zonePlaces;
  state.history = Array.isArray(history) ? history : [];
  const previousPlaces = state.placeCoords.length;
  state.placeCoords = Array.isArray(placeCoords) ? placeCoords : [];
  if (state.zoneMap && state.placeCoords.length !== previousPlaces) {
    state.zoneMap.destroy();
    state.zoneMap = null;
    if (screenFromHash() === 'map') openMap();
  }
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

// Links shared with ?utm_source=instagram (or any short name) show which post brings people.
function visitSource() {
  const source = new URLSearchParams(location.search).get('utm_source')?.toLowerCase() ?? '';
  return /^[a-z0-9_-]{1,24}$/.test(source) ? source : null;
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
    body: JSON.stringify({ visitor, lang: getLanguage(), standalone, source: visitSource(), inApp: inAppBrowser() }),
    keepalive: true,
  }).catch(() => {});
}

async function init() {
  history.replaceState({ screen: screenFromHash(), depth: 0 }, '', location.href);
  document.documentElement.dataset.text = state.textSize;
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
  setTimeout(maybeOfferInstall, 3000);
  setInterval(() => {
    if (screenFromHash() === 'home' && !nodes.homeContent.contains(document.activeElement)) renderHome();
  }, 30000);
  setInterval(loadDataQuietly, 5 * 60 * 1000);
}

init();
