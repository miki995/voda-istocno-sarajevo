export const LANGUAGES = ['sr', 'en'];
export const DEFAULT_LANGUAGE = 'sr';

const MESSAGES = {
  sr: {
    zone: zone => `Zona ${zone}`,
    soon: minutes => `Voda nestaje za oko ${minutes} min`,
    morning: 'Danas nema vode',
    notice: {
      breakdown: where => `Vanredno obavještenje – ${where}`,
      shutdown: where => `Najava isključenja – ${where}`,
      shortage: where => `Smanjena isporuka vode – ${where}`,
      closure: where => `Zatvaranje vode – ${where}`,
    },
    published: (day, window) => `Plan redukcije ${day} ${window}`,
  },
  en: {
    zone: zone => `Zone ${zone}`,
    soon: minutes => `Water cuts off in about ${minutes} min`,
    morning: 'No water today',
    notice: {
      breakdown: where => `Water utility notice – ${where}`,
      shutdown: where => `Planned shutdown – ${where}`,
      shortage: where => `Reduced water supply – ${where}`,
      closure: where => `Water cut – ${where}`,
    },
    published: (day, window) => `Outage plan ${day} ${window}`,
  },
};

export function normalizeLanguage(lang) {
  return LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

export function messagesFor(lang) {
  return MESSAGES[normalizeLanguage(lang)];
}
