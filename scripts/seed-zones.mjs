import { readFileSync, writeFileSync } from 'node:fs';
import { mergePlacesByZone, parsePlan } from '../src/parser.js';

const html = readFileSync(new URL('../test/fixture-home.html', import.meta.url), 'utf8');
const zonePlaces = mergePlacesByZone({}, parsePlan(html).closures);
writeFileSync(new URL('../src/zones-seed.json', import.meta.url), `${JSON.stringify(zonePlaces, null, 2)}\n`);
console.log(Object.entries(zonePlaces).map(([zone, places]) => `Zona ${zone}: ${places.length} mjesta`).join('\n'));
