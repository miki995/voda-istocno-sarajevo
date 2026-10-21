import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCalendarEvents, selectUpcomingPlanEvents } from '../src/events.js';
import { extractPlaces, mergePlacesByZone, parsePlan } from '../src/parser.js';
import { matchedWatches, planNotifications } from '../src/notify.js';
import { fold } from '../src/text.js';
import { formatEndTime, localEpoch } from '../src/time.js';

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

describe('upcoming days', () => {
  const eventPage = parsePlan(readFileSync(new URL('./fixture-event.html', import.meta.url), 'utf8'));
  const events = parseCalendarEvents(html);

  it('reads the calendar events from the home page', () => {
    assert.ok(events.length > 20);
    assert.deepEqual(events.find(event => event.date === '2026-10-22'), { date: '2026-10-22', title: 'PLAN REDUKCIJA', id: '656' });
  });

  it('selects only plan events after today', () => {
    const upcoming = selectUpcomingPlanEvents(events, '2026-10-21');
    assert.deepEqual(upcoming.map(event => event.date), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    assert.deepEqual(upcoming.map(event => event.id), ['656', '657', '658', '659']);
  });

  it('looks at most seven days ahead', () => {
    const synthetic = Array.from({ length: 12 }, (_, index) => ({ date: `2026-10-${String(22 + index).padStart(2, '0')}`, title: 'PLAN REDUKCIJA', id: String(index) }));
    const upcoming = selectUpcomingPlanEvents(synthetic, '2026-10-21');
    assert.equal(upcoming.length, 7);
    assert.equal(upcoming.at(-1).date, '2026-10-28');
  });

  it('ignores events that are not reduction plans', () => {
    const upcoming = selectUpcomingPlanEvents([{ date: '2026-10-22', title: 'Vanredno obavještenje', id: '1' }], '2026-10-21');
    assert.equal(upcoming.length, 0);
  });

  it('reads the closures of a future day with their zones', () => {
    assert.equal(eventPage.closures.length, 4);
    assert.deepEqual(eventPage.closures.map(closure => closure.zone), ['III', 'I', 'II', 'III']);
    assert.equal(eventPage.closures[0].start, localEpoch(2026, 10, 22, 4, 30));
  });

  it('reads a header that has a doubled dash before the zone', () => {
    const doubleDash = parsePlan(readFileSync(new URL('./fixture-event-double-dash.html', import.meta.url), 'utf8'));
    assert.equal(doubleDash.closures.length, 4);
    assert.deepEqual(doubleDash.closures.map(closure => closure.zone), ['I', 'II', 'III', 'I']);
    assert.deepEqual(doubleDash.unparsedHeaders, []);
  });

  it('reports headers it cannot read instead of dropping them silently', () => {
    const broken = '<div class="modal-description"><p>ZATVARANJE 23.10.2026 nešto neočekivano</p><p>-Dobrinja</p></div>';
    const result = parsePlan(broken);
    assert.equal(result.closures.length, 0);
    assert.equal(result.unparsedHeaders.length, 1);
  });

  it('shows an end at midnight as 24:00', () => {
    const start = localEpoch(2026, 10, 22, 16, 30);
    assert.equal(formatEndTime(start, localEpoch(2026, 10, 23, 0, 0)), '24:00');
    assert.equal(formatEndTime(start, localEpoch(2026, 10, 22, 18, 0)), '18:00');
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

  it('writes the notification in English when asked to', () => {
    const now = localEpoch(2026, 10, 21, 9, 0);
    const [notification] = planNotifications({
      closures: plan.closures,
      watches: [{ kind: 'ZONE', value: 'III' }],
      sent: [],
      now,
      lang: 'en',
    });
    assert.match(notification.title, /Water cuts off in about 90 min/);
    assert.match(notification.body, /Zone III/);
  });

  it('falls back to Serbian for an unknown language', () => {
    const now = localEpoch(2026, 10, 21, 9, 0);
    const [notification] = planNotifications({
      closures: plan.closures,
      watches: [{ kind: 'ZONE', value: 'III' }],
      sent: [],
      now,
      lang: 'de',
    });
    assert.match(notification.body, /Zona III/);
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
