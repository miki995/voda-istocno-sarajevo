// Looks up coordinates for every street and neighbourhood the app knows (OpenStreetMap Nominatim, one request
// per second as its usage policy asks) and writes public/places.json for the zone map. Already known places are kept.
// Usage: node scripts/geocode-places.mjs [https://your-site.example]  (the site's /api/zones adds places seen since the seed)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fold } from '../src/text.js';

const OUTPUT = new URL('../public/places.json', import.meta.url);
const SEED = new URL('../src/zones-seed.json', import.meta.url);
const VIEWBOX = '18.31,43.87,18.45,43.75';
const USER_AGENT = 'voda-istocno-sarajevo/1.0 (miroslavmaksimovic95@gmail.com)';

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
  const params = new URLSearchParams({ q: `${place}, Istočno Sarajevo`, format: 'jsonv2', limit: '1', countrycodes: 'ba', viewbox: VIEWBOX, bounded: '1' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const [hit] = await response.json();
  return hit ? { lat: Number(Number(hit.lat).toFixed(5)), lon: Number(Number(hit.lon).toFixed(5)) } : null;
}

let missing = 0;
for (const [zone, places] of Object.entries(zones)) {
  for (const place of places) {
    const key = fold(place);
    if (byKey.get(key)?.lat) continue;
    const coords = await lookup(place);
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
