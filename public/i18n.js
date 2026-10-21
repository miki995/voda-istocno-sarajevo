export const LANGUAGES = ['sr', 'en'];
const DEFAULT_LANGUAGE = 'sr';
const STORAGE_KEY = 'voda-lang';

const DICTIONARY = {
  sr: {
    'meta.title': 'Voda Istočno Sarajevo',
    'meta.description': 'Obavještenja o nestanku vode u Istočnom Sarajevu za tvoju ulicu ili zonu.',
    'header.title': 'Voda · Istočno Sarajevo',
    'header.loading': 'Učitavam plan…',
    'header.language': 'Jezik',
    'alerts.title': 'Obavještenja',
    'alerts.enable': 'Uključi obavještenja',
    'alerts.disable': 'Isključi obavještenja',
    'alerts.ios': 'Na iPhoneu obavještenja rade tek kad sajt dodaš na početni ekran.',
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
    'footer.source': 'Izvor:',
    'footer.official': 'službeni sajt vodovoda Istočno Sarajevo.',
  },
  en: {
    'meta.title': 'Water Istočno Sarajevo',
    'meta.description': 'Water outage alerts for Istočno Sarajevo, for your street or zone.',
    'header.title': 'Water · Istočno Sarajevo',
    'header.loading': 'Loading the plan…',
    'header.language': 'Language',
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
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LANGUAGE;
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

export function t(key, values = {}) {
  const template = DICTIONARY[currentLanguage][key] ?? DICTIONARY[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

export function formatDayLabel(epochMs) {
  if (currentLanguage === 'en') return englishDayFormat.format(epochMs);
  const parts = Object.fromEntries(dayPartsFormat.formatToParts(new Date(epochMs)).map(part => [part.type, part.value]));
  return `${WEEKDAYS_SR[WEEKDAY_INDEX[parts.weekday]]}, ${parts.day}.${parts.month}.`;
}

export function applyStaticTexts() {
  document.documentElement.lang = currentLanguage === 'en' ? 'en' : 'sr-Latn';
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
