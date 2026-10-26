// Looks up coordinates for every street and neighbourhood the app knows (OpenStreetMap Nominatim, one request
// per second as its usage policy asks) and writes public/places.json for the zone map. Already known places are kept.
// Usage: node scripts/geocode-places.mjs [https://your-site.example]  (the site's /api/zones adds places seen since the seed)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fold } from '../src/text.js';

const OUTPUT = new URL('../public/places.json', import.meta.url);
const SEED = new URL('../src/zones-seed.json', import.meta.url);
const VIEWBOX = '18.31,43.87,18.45,43.75';
// Nominatim asks for a way to reach whoever runs the script; the site is that way.
const USER_AGENT = 'voda-istocno-sarajevo/1.0 (+https://vodais.vercel.app)';

// The plan writes some streets in a different grammatical form than OpenStreetMap does.
const SEARCH_NAMES = { Ozrenske: 'Ozrenska', Dečanske: 'Dečanska', Spasovdanske: 'Spasovdanska', Hilandarske: 'Hilandarska' };

// Places the plan names differently than the map does. "like" takes the position of another place, "search" takes the
// middle of the named streets or buildings.
const ALIASES = {
  'Famosovo naselje': { like: 'Trg Miroslava Berjana' },
  'TC TOM': { like: 'Zmaj Jovina' },
  'Novakovići': { like: 'Donji Kotorac' },
  'Miroslava Krleže': { search: ['Autobuska stanica'] },
  Radulovac: { search: ['Aerodromska', 'Rajlovačka'] },
};

const zones = JSON.parse(readFileSync(SEED, 'utf8'));
if (process.argv[2]) {
  const live = await (await fetch(`${process.argv[2].replace(/\/$/, '')}/api/zones`)).json();
  for (const [zone, places] of Object.entries(live)) {
    zones[zone] = [...new Set([...(zones[zone] ?? []), ...places])];
  }
}

const known = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : [];
const byKey = new Map(known.map(entry => [fold(entry.place), entry]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function lookup(place) {
  const params = new URLSearchParams({ q: `${SEARCH_NAMES[place] ?? place}, Istočno Sarajevo`, format: 'jsonv2', limit: '1', countrycodes: 'ba', viewbox: VIEWBOX, bounded: '1' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const [hit] = await response.json();
  return hit ? { lat: Number(Number(hit.lat).toFixed(5)), lon: Number(Number(hit.lon).toFixed(5)) } : null;
}

async function resolveAlias(alias) {
  if (alias.like) {
    const known = byKey.get(fold(alias.like));
    return known?.lat ? { lat: known.lat, lon: known.lon } : null;
  }
  const found = [];
  for (const name of alias.search) {
    const hit = await lookup(name);
    await sleep(1100);
    if (hit) found.push(hit);
  }
  if (found.length === 0) return null;
  const middle = key => Number((found.reduce((total, hit) => total + hit[key], 0) / found.length).toFixed(5));
  return { lat: middle('lat'), lon: middle('lon') };
}

let missing = 0;
for (const [zone, places] of Object.entries(zones)) {
  for (const place of places) {
    const key = fold(place);
    if (byKey.get(key)?.lat) continue;
    const coords = ALIASES[place] ? await resolveAlias(ALIASES[place]) : await lookup(place);
    await sleep(1100);
    if (!coords) {
      missing += 1;
      console.log(`no result: ${place} (zone ${zone})`);
    }
    byKey.set(key, { place, zone, ...(coords ?? {}) });
  }
}
const entries = [...byKey.values()].sort((first, second) => first.place.localeCompare(second.place, 'sr'));
writeFileSync(OUTPUT, `${JSON.stringify(entries, null, 1)}\n`);
console.log(`${entries.filter(entry => entry.lat).length} places with coordinates, ${missing} not found`);
