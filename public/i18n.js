import { toCyrillic } from './translit.js';

// 'sr' is Serbian in Cyrillic (the default), 'sr-Latn' is Serbian in Latin. The Serbian texts are
// written in Latin and turned into Cyrillic on the way out.
export const LANGUAGES = ['sr', 'sr-Latn', 'en'];
export const LANGUAGE_LABELS = { sr: 'ЋИР', 'sr-Latn': 'LAT', en: 'EN' };
const DEFAULT_LANGUAGE = 'sr';
const STORAGE_KEY = 'voda-lang';
const HTML_LANG = { sr: 'sr-Cyrl', 'sr-Latn': 'sr-Latn', en: 'en' };

const DICTIONARY = {
  sr: {
    'meta.title': 'Voda Istočno Sarajevo',
    'meta.description': 'Obavještenja o nestanku vode u Istočnom Sarajevu za tvoju ulicu ili zonu.',
    'app.title': 'Voda',
    'app.subtitle': 'Istočno Sarajevo',
    'header.loading': 'Učitavam plan…',
    'nav.back': 'Nazad',
    'menu.title': 'Meni',
    'menu.add': 'Moje ulice',
    'menu.alerts': 'Obavještenja',
    'menu.plan': 'Cijeli plan redukcije',
    'menu.notices': 'Obavještenja vodovoda',
    'menu.zones': 'Zone i ulice',
    'menu.language': 'Jezik',
    'menu.on': 'Uključena',
    'menu.off': 'Isključena',
    'menu.selected': '{count} izabrano',
    'add.done': 'Gotovo',
    'home.emptyTitle': 'Izaberi svoju ulicu',
    'home.emptyText': 'Javićemo ti kada nestane vode u tvojoj ulici ili zoni.',
    'home.add': 'Dodaj ulicu',
    'home.addMore': 'Dodaj ulicu',
    'home.allTimes': 'Svi termini ({count})',
    'home.bannerText': 'Uključi obavještenja da ti poruka stigne i kad stranica nije otvorena.',
    'home.bannerButton': 'Uključi',
    'status.liveNow': 'Trenutno nema vode',
    'status.until': 'do {time}',
    'status.next': 'Sljedeći prekid',
    'status.none': 'Nema planiranih prekida',
    'status.noneDetail': 'u objavljenom planu',
    'alerts.title': 'Obavještenja',
    'alerts.enable': 'Uključi obavještenja',
    'alerts.disable': 'Isključi obavještenja',
    'alerts.ios': 'Na iPhone-u obavještenja rade tek kad sajt dodaš na početni ekran.',
    'alerts.iosHint': 'Safari → dugme Podijeli → "Dodaj na početni ekran", pa otvori sajt odatle i uključi obavještenja.',
    'alerts.unsupported': 'Ovaj preglednik ne podržava obavještenja. Plan i dalje možeš pratiti na ovoj stranici.',
    'alerts.blocked': 'Obavještenja su blokirana u postavkama preglednika. Dozvoli ih za ovaj sajt pa osvježi stranicu.',
    'alerts.active': 'Obavještenja su uključena na ovom uređaju.',
    'alerts.inactive': 'Uključi obavještenja da ti poruka stigne i kad stranica nije otvorena.',
    'alerts.saveFailed': 'Nisam uspio da sačuvam izbor na serveru. Pokušaj ponovo.',
    'alerts.failed': 'Nešto nije uspjelo pri uključivanju obavještenja. Pokušaj ponovo.',
    'watch.title': 'Moje ulice i zone',
    'watch.help': 'Dobijaš poruku čim se plan objavi, ujutru na dan zatvaranja i oko 2 sata prije nego što voda nestane.',
    'watch.searchLabel': 'Pretraži ulicu ili naselje',
    'watch.placeholder': 'Ukucaj ulicu ili naselje…',
    'watch.zoneGroup': 'Izaberi cijelu zonu',
    'watch.empty': 'Još ništa nije izabrano.',
    'watch.remove': 'Ukloni {name}',
    'watch.addTyped': 'dodaj kako si ukucao',
    'watch.noClosure': 'Nema objavljenog zatvaranja u trenutnom planu.',
    'notices.title': 'Obavještenja vodovoda',
    'notices.help': 'Kvarovi, radovi i najave isključenja koje vodovod objavi van redovnog plana.',
    'notices.none': 'Nema obavještenja u posljednjih 14 dana.',
    'notices.mine': 'tvoja ulica',
    'notices.read': 'Pročitaj obavještenje',
    'home.noticeMine': 'Obavještenje za tvoju ulicu',
    'kind.breakdown': 'Obavještenje',
    'kind.shutdown': 'Najava isključenja',
    'kind.shortage': 'Smanjena isporuka vode',
    'kind.closure': 'Zatvaranje vode',
    'home.shortage': 'Smanjena isporuka vode',
    'home.shortageDetail': 'zbog niske izdašnosti izvorišta, pogledaj gdje',
    'home.noticesOther': 'Obavještenja vodovoda ({count})',
    'home.noticesOtherDetail': 'kvarovi i radovi u ostalim naseljima',
    'day.today': 'Danas',
    'day.tomorrow': 'Sutra',
    'plan.title': 'Plan redukcije',
    'plan.none': 'Trenutno nema objavljenog plana redukcije.',
    'plan.live': 'traje sada',
    'plan.mine': 'tvoja ulica',
    'plan.nextDay': 'sutradan',
    'plan.notLoaded': 'Plan još nije učitan.',
    'plan.updated': 'ažurirano {time}',
    'plan.loadFailed': 'Ne mogu da učitam plan. Pokušaj kasnije.',
    'zones.title': 'Šta pripada kojoj zoni',
    'zones.help': 'Spisak se dopunjuje iz svakog objavljenog plana. Dodirni ulicu da je dodaš.',
    'zones.count': '{count} mjesta',
    'zone': 'Zona {zone}',
    'menu.map': 'Mapa zona',
    'count.left': 'još {duration}',
    'count.in': 'za {duration}',
    'plan.week': 'Sedmica unaprijed',
    'plan.gridHelp': 'Crveno su termini za tvoje ulice. Dodirni dan ispod za cijeli spisak.',
    'plan.shareImage': 'Podijeli sliku',
    'img.title': 'Redukcija vode · Istočno Sarajevo',
    'img.footer': 'Obavještenja za tvoju ulicu: {host}',
    'img.more': '+{count} još',
    'stats.avg': 'prosječno {avg} {h} po prekidu',
    'inapp.text': 'Ovo je ugrađeni preglednik (Instagram, Facebook…). Obavještenja i instalacija ovdje ne rade. Otvori sajt u pregledniku.',
    'inapp.openChrome': 'Otvori u Chrome-u',
    'inapp.copy': 'Kopiraj link',
    'install.title': 'Dodaj na početni ekran',
    'install.text': 'Otvaraj Vodu jednim dodirom, kao običnu aplikaciju, i primaj obavještenja.',
    'install.iosText': 'U Safariju dodirni dugme Podijeli, pa "Dodaj na početni ekran". Tek tada na iPhone-u stižu obavještenja.',
    'install.button': 'Instaliraj aplikaciju',
    'install.later': 'Ne sada',
    'install.how': 'Kako',
    'install.gotIt': 'Razumijem',
    'menu.settings': 'Podešavanja',
    'menu.textSize': 'Veličina teksta',
    'text.normal': 'Običan tekst',
    'text.large': 'Veći tekst',
    'text.xlarge': 'Najveći tekst',
    'map.help': 'Svaka tačka je ulica ili naselje u boji svoje zone. Mapa je okvirna: prekid važi za ulice iz plana. Dodirni tačku da je dodaš.',
    'map.needsInternet': 'Mapa treba internet. Pokušaj ponovo kad se povežeš.',
    'map.add': 'Dodaj u moje',
    'map.remove': 'Ukloni iz mojih',
    'map.locate': 'Moja lokacija',
    'locate.button': 'Pronađi moju ulicu',
    'locate.notMine': 'Nije tvoja ulica? Ukucaj je ispod.',
    'add.map': 'Ili izaberi na mapi',
    'locate.privacy': 'Lokacija ostaje na tvom telefonu.',
    'locate.working': 'Tražim…',
    'locate.denied': 'Lokacija nije dozvoljena. Dozvoli je u postavkama preglednika ili ukucaj ulicu.',
    'locate.unavailable': 'Ne mogu da odredim lokaciju. Pokušaj napolju ili ukucaj ulicu.',
    'locate.found': 'Najbliže tebi:',
    'locate.far': 'Nema poznate ulice u blizini. Najbliže je:',
    'distance.m': '{value} m',
    'distance.km': '{value} km',
    'stats.last30': 'Zadnjih 30 dana: {count}× bez vode · {hours} {h}',
    'source.stale': 'Ne uspijevamo da pročitamo podatke vodovoda od {time}. Provjeri njihovu stranicu ili ih pozovi.',
    'source.facebook': 'Facebook vodovoda',
    'source.call': 'Pozovi 057 342 742',
    'footer.contact': 'Vodovod:',
    'card.calendar': 'Dodaj u kalendar',
    'card.share': 'Podijeli',
    'share.copied': 'Kopirano',
    'share.cardText': '{name}: {title}, {detail}',
    'share.appText': 'Obavještenja o nestanku vode u Istočnom Sarajevu za tvoju ulicu:',
    'menu.share': 'Podijeli aplikaciju',
    'cal.title': 'Nema vode – {name}',
    'cal.description': 'Planirana redukcija vode prema planu vodovoda Istočno Sarajevo.',
    'plan.offline': 'Nema interneta · ažurirano {time}',
    'footer.source': 'Izvor:',
    'footer.official': 'službeni sajt vodovoda Istočno Sarajevo.',
  },
  en: {
    'meta.title': 'Water Istočno Sarajevo',
    'meta.description': 'Water outage alerts for Istočno Sarajevo, for your street or zone.',
    'app.title': 'Water',
    'app.subtitle': 'Istočno Sarajevo',
    'header.loading': 'Loading the plan…',
    'nav.back': 'Back',
    'menu.title': 'Menu',
    'menu.add': 'My streets',
    'menu.alerts': 'Alerts',
    'menu.plan': 'Full outage plan',
    'menu.notices': 'Utility notices',
    'menu.zones': 'Zones and streets',
    'menu.language': 'Language',
    'menu.on': 'On',
    'menu.off': 'Off',
    'menu.selected': '{count} selected',
    'add.done': 'Done',
    'home.emptyTitle': 'Pick your street',
    'home.emptyText': 'We will tell you when the water goes off on your street or in your zone.',
    'home.add': 'Add a street',
    'home.addMore': 'Add a street',
    'home.allTimes': 'All times ({count})',
    'home.bannerText': 'Turn on alerts to get a message even when this page is closed.',
    'home.bannerButton': 'Turn on',
    'status.liveNow': 'No water right now',
    'status.until': 'until {time}',
    'status.next': 'Next outage',
    'status.none': 'No planned outages',
    'status.noneDetail': 'in the published plan',
    'alerts.title': 'Alerts',
    'alerts.enable': 'Turn on alerts',
    'alerts.disable': 'Turn off alerts',
    'alerts.ios': 'On iPhone, alerts only work once the site is added to your Home Screen.',
    'alerts.iosHint': 'Safari → Share button → "Add to Home Screen", then open the site from there and turn on alerts.',
    'alerts.unsupported': 'This browser does not support alerts. You can still follow the plan on this page.',
    'alerts.blocked': 'Alerts are blocked in your browser settings. Allow them for this site, then reload the page.',
    'alerts.active': 'Alerts are on for this device.',
    'alerts.inactive': 'Turn on alerts to get a message even when this page is closed.',
    'alerts.saveFailed': 'Could not save your choices on the server. Try again.',
    'alerts.failed': 'Something went wrong while turning on alerts. Try again.',
    'watch.title': 'My streets and zones',
    'watch.help': 'You get a message as soon as the plan is published, in the morning of the closure day, and about 2 hours before the water goes off.',
    'watch.searchLabel': 'Search for a street or neighbourhood',
    'watch.placeholder': 'Type a street or neighbourhood…',
    'watch.zoneGroup': 'Pick a whole zone',
    'watch.empty': 'Nothing selected yet.',
    'watch.remove': 'Remove {name}',
    'watch.addTyped': 'add as typed',
    'watch.noClosure': 'No closure in the currently published plan.',
    'notices.title': 'Utility notices',
    'notices.help': 'Breakdowns, works and shutdown announcements the utility publishes outside the regular plan. The text is published in Serbian.',
    'notices.none': 'No notices in the last 14 days.',
    'notices.mine': 'your street',
    'notices.read': 'Read the notice',
    'home.noticeMine': 'Notice for your street',
    'kind.breakdown': 'Notice',
    'kind.shutdown': 'Planned shutdown',
    'kind.shortage': 'Reduced water supply',
    'kind.closure': 'Water cut',
    'home.shortage': 'Reduced water supply',
    'home.shortageDetail': 'low spring yield, see where',
    'home.noticesOther': 'Utility notices ({count})',
    'home.noticesOtherDetail': 'breakdowns and works in other neighbourhoods',
    'day.today': 'Today',
    'day.tomorrow': 'Tomorrow',
    'plan.title': 'Outage plan',
    'plan.none': 'No outage plan is currently published.',
    'plan.live': 'in progress',
    'plan.mine': 'your street',
    'plan.nextDay': 'next day',
    'plan.notLoaded': 'Plan not loaded yet.',
    'plan.updated': 'updated {time}',
    'plan.loadFailed': 'Could not load the plan. Try again later.',
    'zones.title': 'What belongs to which zone',
    'zones.help': 'The list grows with every published plan. Tap a street to add it.',
    'zones.count': '{count} places',
    'zone': 'Zone {zone}',
    'menu.map': 'Zone map',
    'count.left': '{duration} left',
    'count.in': 'in {duration}',
    'plan.week': 'The week ahead',
    'plan.gridHelp': 'Red marks the times for your streets. Tap a day below for the full list.',
    'plan.shareImage': 'Share as picture',
    'img.title': 'Water outage plan · Istočno Sarajevo',
    'img.footer': 'Alerts for your street: {host}',
    'img.more': '+{count} more',
    'stats.avg': 'about {avg} {h} per outage',
    'inapp.text': 'This is an in-app browser (Instagram, Facebook…). Alerts and installing do not work here. Open the site in your browser.',
    'inapp.openChrome': 'Open in Chrome',
    'inapp.copy': 'Copy link',
    'install.title': 'Add to your Home Screen',
    'install.text': 'Open Water with one tap, like any app, and get alerts.',
    'install.iosText': 'In Safari tap the Share button, then "Add to Home Screen". Only then do alerts work on iPhone.',
    'install.button': 'Install the app',
    'install.later': 'Not now',
    'install.how': 'How',
    'install.gotIt': 'Got it',
    'menu.settings': 'Settings',
    'menu.textSize': 'Text size',
    'text.normal': 'Normal text',
    'text.large': 'Larger text',
    'text.xlarge': 'Largest text',
    'map.help': 'Each dot is a street or neighbourhood in the colour of its zone. The map is approximate: an outage applies to the streets in the plan. Tap a dot to add it.',
    'map.needsInternet': 'The map needs internet. Try again once you are connected.',
    'map.add': 'Add to mine',
    'map.remove': 'Remove from mine',
    'map.locate': 'My location',
    'locate.button': 'Find my street',
    'locate.notMine': 'Not your street? Type it below.',
    'add.map': 'Or pick on the map',
    'locate.privacy': 'Your location stays on your phone.',
    'locate.working': 'Looking…',
    'locate.denied': 'Location is not allowed. Allow it in your browser settings or type your street.',
    'locate.unavailable': 'Could not get your location. Try outdoors or type your street.',
    'locate.found': 'Closest to you:',
    'locate.far': 'No known street nearby. The closest is:',
    'distance.m': '{value} m',
    'distance.km': '{value} km',
    'stats.last30': 'Last 30 days: {count}× without water · {hours} {h}',
    'source.stale': 'We have not been able to read the water utility data since {time}. Check their page or call them.',
    'source.facebook': 'Utility on Facebook',
    'source.call': 'Call 057 342 742',
    'footer.contact': 'Water utility:',
    'card.calendar': 'Add to calendar',
    'card.share': 'Share',
    'share.copied': 'Copied',
    'share.cardText': '{name}: {title}, {detail}',
    'share.appText': 'Water outage alerts for Istočno Sarajevo, for your street:',
    'menu.share': 'Share the app',
    'cal.title': 'No water – {name}',
    'cal.description': 'Planned water outage from the Istočno Sarajevo water utility plan.',
    'plan.offline': 'Offline · updated {time}',
    'footer.source': 'Source:',
    'footer.official': 'the official website of the Istočno Sarajevo water utility.',
  },
};

const WEEKDAYS_SR = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const TIME_ZONE = 'Europe/Sarajevo';

const dayPartsFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'numeric' });
const englishDayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'short' });

function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(stored)) return stored;
  } catch {
    return DEFAULT_LANGUAGE;
  }
  return DEFAULT_LANGUAGE;
}

let currentLanguage = detectLanguage();

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang) {
  currentLanguage = LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  try {
    localStorage.setItem(STORAGE_KEY, currentLanguage);
  } catch {
    return;
  }
}

// Serbian text that comes from the site (street names, notices) is Latin; show it in the chosen script.
export function local(text) {
  return currentLanguage === 'sr' ? toCyrillic(text) : text;
}

export function t(key, values = {}) {
  const dictionary = DICTIONARY[currentLanguage === 'en' ? 'en' : 'sr'];
  const template = dictionary[key] ?? DICTIONARY[DEFAULT_LANGUAGE][key] ?? key;
  return local(template.replace(/\{(\w+)\}/g, (_, name) => String(name === 'h' ? hourUnit() : (values[name] ?? ''))));
}

export function formatDayLabel(epochMs) {
  if (currentLanguage === 'en') return englishDayFormat.format(epochMs);
  const parts = Object.fromEntries(dayPartsFormat.formatToParts(new Date(epochMs)).map(part => [part.type, part.value]));
  return local(`${WEEKDAYS_SR[WEEKDAY_INDEX[parts.weekday]]}, ${parts.day}.${parts.month}.`);
}

// Hours are "h" in Latin and English text and "ч" in Cyrillic; `t` would turn a plain "h" into "х".
export function hourUnit() {
  return currentLanguage === 'sr' ? 'ч' : 'h';
}

export function formatDuration(ms) {
  const total = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hourUnit()}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} min`);
  return local(parts.join(' '));
}

export function dayKeyOf(epochMs) {
  return dayKeyFormat.format(epochMs);
}

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatRelativeDay(epochMs, nowMs = Date.now()) {
  const key = dayKeyFormat.format(epochMs);
  if (key === dayKeyFormat.format(nowMs)) return t('day.today');
  if (key === dayKeyFormat.format(nowMs + DAY_MS)) return t('day.tomorrow');
  return formatDayLabel(epochMs);
}

export function applyStaticTexts() {
  document.documentElement.lang = HTML_LANG[currentLanguage];
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  }
  for (const node of document.querySelectorAll('[data-i18n-label]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  }
}
