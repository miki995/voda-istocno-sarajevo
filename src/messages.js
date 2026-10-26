// 'sr' is Serbian in Cyrillic (the default), 'sr-Latn' is Serbian in Latin. The Serbian texts below are
// written in Latin and turned into Cyrillic when a notification is built.
export const LANGUAGES = ['sr', 'sr-Latn', 'en'];
export const DEFAULT_LANGUAGE = 'sr';

function pluralSr(count, one, few, many) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return one;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

const MESSAGES = {
  sr: {
    zone: zone => `Zona ${zone}`,
    soon: minutes => `Voda nestaje za oko ${minutes} min`,
    morning: 'Danas nema vode',
    restored: 'Redukcija završena – voda se vraća',
    tomorrow: 'Sutra nema vode',
    more: count => `Još ${count} ${pluralSr(count, 'novo obavještenje', 'nova obavještenja', 'novih obavještenja')}`,
    moreBody: 'Otvori aplikaciju da vidiš sve.',
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
    restored: 'Outage over – water is coming back',
    tomorrow: 'No water tomorrow',
    more: count => `${count} more new alerts`,
    moreBody: 'Open the app to see everything.',
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

export function usesCyrillic(lang) {
  return normalizeLanguage(lang) === 'sr';
}

export function messagesFor(lang) {
  return MESSAGES[normalizeLanguage(lang) === 'en' ? 'en' : 'sr'];
}
