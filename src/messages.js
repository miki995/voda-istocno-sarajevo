export const LANGUAGES = ['sr', 'en'];
export const DEFAULT_LANGUAGE = 'sr';

const MESSAGES = {
  sr: {
    zone: zone => `Zona ${zone}`,
    soon: minutes => `Voda nestaje za oko ${minutes} min`,
    morning: 'Danas nema vode',
    published: (day, window) => `Plan redukcije ${day} ${window}`,
  },
  en: {
    zone: zone => `Zone ${zone}`,
    soon: minutes => `Water cuts off in about ${minutes} min`,
    morning: 'No water today',
    published: (day, window) => `Outage plan ${day} ${window}`,
  },
};

export function normalizeLanguage(lang) {
  return LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

export function messagesFor(lang) {
  return MESSAGES[normalizeLanguage(lang)];
}
