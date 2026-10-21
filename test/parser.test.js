import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPlaces, mergePlacesByZone, parsePlan } from '../src/parser.js';
import { matchedWatches, planNotifications } from '../src/notify.js';
import { fold } from '../src/text.js';
import { localEpoch } from '../src/time.js';

const html = readFileSync(new URL('./fixture-home.html', import.meta.url), 'utf8');
const plan = parsePlan(html);

describe('parsePlan', () => {
  it('reads all four closures with zones', () => {
    assert.equal(plan.closures.length, 4);
    assert.deepEqual(plan.closures.map(closure => closure.zone), ['II', 'III', 'I', 'II']);
  });

  it('converts local times to epoch', () => {
    assert.equal(plan.closures[0].start, localEpoch(2026, 10, 21, 4, 30));
    assert.equal(plan.closures[0].end, localEpoch(2026, 10, 21, 12, 0));
  });

  it('handles a closure ending on the next day', () => {
    assert.equal(plan.closures[3].start, localEpoch(2026, 10, 21, 22, 30));
    assert.equal(plan.closures[3].end, localEpoch(2026, 10, 22, 6, 0));
  });

  it('treats 24:00 as midnight of the next day', () => {
    assert.equal(plan.closures[2].end, localEpoch(2026, 10, 22, 0, 0));
  });

  it('reads the status label', () => {
    assert.equal(plan.status, 'PLAN REDUKCIJA');
  });
});

describe('extractPlaces', () => {
  const zoneThree = extractPlaces(plan.closures[1]);

  it('splits neighbourhoods and streets', () => {
    assert.ok(zoneThree.includes('Dobrinja I'));
    assert.ok(zoneThree.includes('Dabrobosanska'));
    assert.ok(zoneThree.includes('Ive Andrića'));
    assert.ok(zoneThree.includes('Beogradska'));
  });

  it('drops filler such as house number ranges', () => {
    const zoneOne = extractPlaces(plan.closures[2]);
    assert.ok(!zoneOne.some(place => /neparni/i.test(place)));
    assert.ok(zoneOne.includes('Mladičko polje'));
    assert.ok(zoneOne.includes('Donje Mladice'));
  });

  it('merges places per zone without duplicates', () => {
    const merged = mergePlacesByZone({}, plan.closures);
    assert.equal(merged.II.filter(place => fold(place) === 'vojkovici').length, 1);
    assert.ok(merged.II.includes('Karađorđeva'));
  });
});

describe('matching and notifications', () => {
  it('matches a street without diacritics', () => {
    const labels = matchedWatches(plan.closures[0], [{ kind: 'PLACE', value: 'djure jaksica' }]);
    assert.deepEqual(labels, ['djure jaksica']);
  });

  it('matches a whole zone', () => {
    assert.deepEqual(matchedWatches(plan.closures[1], [{ kind: 'ZONE', value: 'III' }]), ['Zona III']);
    assert.deepEqual(matchedWatches(plan.closures[1], [{ kind: 'ZONE', value: 'I' }]), []);
  });

  it('sends only the most urgent notification and marks the rest as sent', () => {
    const now = localEpoch(2026, 10, 21, 9, 0);
    const result = planNotifications({
      closures: plan.closures,
      watches: [{ kind: 'PLACE', value: 'Dobrinja IV' }],
      sent: [],
      now,
    });
    assert.equal(result.length, 1);
    assert.match(result[0].title, /nestaje za oko 90 min/);
    assert.deepEqual(result[0].markSent.sort(), [`${plan.closures[1].id}|MORNING`, `${plan.closures[1].id}|PUBLISHED`, `${plan.closures[1].id}|SOON`].sort());
  });

  it('does not repeat a notification', () => {
    const now = localEpoch(2026, 10, 21, 9, 0);
    const closure = plan.closures[1];
    const result = planNotifications({
      closures: [closure],
      watches: [{ kind: 'ZONE', value: 'III' }],
      sent: [`${closure.id}|PUBLISHED`, `${closure.id}|MORNING`, `${closure.id}|SOON`],
      now,
    });
    assert.equal(result.length, 0);
  });

  it('does not send a morning notice before the morning hour', () => {
    const now = localEpoch(2026, 10, 21, 5, 0);
    const closure = plan.closures[2];
    const result = planNotifications({
      closures: [closure],
      watches: [{ kind: 'ZONE', value: 'I' }],
      sent: [`${closure.id}|PUBLISHED`],
      now,
    });
    assert.equal(result.length, 0);
  });

  it('skips closures that already ended', () => {
    const now = localEpoch(2026, 10, 21, 13, 0);
    const closure = plan.closures[0];
    const result = planNotifications({ closures: [closure], watches: [{ kind: 'ZONE', value: 'II' }], sent: [], now });
    assert.equal(result.length, 0);
  });
});
