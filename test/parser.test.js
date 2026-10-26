import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCalendarEvents, selectRecentNoticeEvents, selectUpcomingPlanEvents } from '../src/events.js';
import { classifyNotice, extrasToNotices, parseNotice } from '../src/notices.js';
import { loadStats, recordHit, sanitizeHit } from '../src/stats.js';
import { getStore } from '../src/store.js';
import { extractPlaces, mergePlacesByZone, parsePlan } from '../src/parser.js';
import { matchedWatches, noticeNotifications, planNotifications, pruneSent } from '../src/notify.js';
import { fold } from '../src/text.js';
import { toCyrillic, toLatin } from '../public/translit.js';
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
      lang: 'sr-Latn',
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

  it('writes the notification in Cyrillic by default and in Latin when asked to', () => {
    const now = localEpoch(2026, 10, 21, 9, 0);
    const args = { closures: plan.closures, watches: [{ kind: 'ZONE', value: 'III' }], sent: [], now };
    const [cyrillic] = planNotifications(args);
    assert.match(cyrillic.title, /Вода нестаје за око 90 мин/);
    assert.match(cyrillic.body, /Зона III/);
    const [latin] = planNotifications({ ...args, lang: 'sr-Latn' });
    assert.match(latin.title, /Voda nestaje za oko 90 min/);
    assert.match(latin.body, /Zona III/);
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
    assert.match(notification.body, /Зона III/);
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
    const now = localEpoch(2026, 10, 21, 18, 0);
    const closure = plan.closures[0];
    const result = planNotifications({ closures: [closure], watches: [{ kind: 'ZONE', value: 'II' }], sent: [], now });
    assert.equal(result.length, 0);
  });
});

describe('utility notices', () => {
  const events = parseCalendarEvents(html);
  const notice = parseNotice({ id: '652', date: '2026-10-16', title: 'Vanredno obavještenje' }, readFileSync(new URL('./fixture-notice.html', import.meta.url), 'utf8'));
  const now = localEpoch(2026, 10, 16, 9, 0);

  it('decodes calendar titles', () => {
    assert.ok(events.some(event => event.title === 'Vanredno obavještenje'));
    assert.ok(events.every(event => !event.title.includes('&')));
  });

  it('selects recent notices but not plans or old schedules', () => {
    const picked = selectRecentNoticeEvents(events, '2026-10-16');
    assert.ok(picked.length > 0);
    assert.ok(picked.every(event => event.date >= '2026-10-02' && event.date <= '2026-10-23'));
    assert.ok(picked.every(event => !/plan redukcij|raspored redukcij/i.test(event.title)));
    assert.deepEqual(picked.map(event => event.date), [...picked.map(event => event.date)].sort().reverse());
  });

  it('reads the text of a notice', () => {
    assert.equal(notice.id, 'notice-652');
    assert.ok(notice.lines.length >= 2);
    assert.match(notice.text, /Vojkovići i Radulovac/);
    assert.match(notice.text, /Trg Sabora Bosanskog/);
  });

  it('notifies only people whose street is mentioned', () => {
    const mine = noticeNotifications({ notices: [notice], watches: [{ kind: 'PLACE', value: 'Radulovac' }], sent: [], now });
    assert.equal(mine.length, 1);
    assert.match(mine[0].title, /Најава искључења – Радуловац/);
    assert.deepEqual(mine[0].markSent, ['notice-652|NOTICE']);
    assert.equal(noticeNotifications({ notices: [notice], watches: [{ kind: 'PLACE', value: 'Dobrinja IV' }], sent: [], now }).length, 0);
    assert.equal(noticeNotifications({ notices: [notice], watches: [{ kind: 'ZONE', value: 'I' }], sent: [], now }).length, 0);
  });

  it('does not repeat a notice or announce one from an earlier day', () => {
    const watches = [{ kind: 'PLACE', value: 'Radulovac' }];
    assert.equal(noticeNotifications({ notices: [notice], watches, sent: ['notice-652|NOTICE'], now }).length, 0);
    assert.equal(noticeNotifications({ notices: [notice], watches, sent: [], now: localEpoch(2026, 10, 18, 9, 0) }).length, 0);
  });

  it('writes the notice in English when asked to', () => {
    const [english] = noticeNotifications({ notices: [notice], watches: [{ kind: 'PLACE', value: 'Radulovac' }], sent: [], now, lang: 'en' });
    assert.match(english.title, /Planned shutdown – Radulovac/);
  });

  it('keeps sent entries for notices that are still listed', () => {
    assert.deepEqual(pruneSent(['notice-652|NOTICE', 'notice-1|NOTICE'], [notice]), ['notice-652|NOTICE']);
  });

  it('does not match a street inside a longer name', () => {
    assert.deepEqual(matchedWatches({ text: 'Naselje Dobrinja IV' }, [{ kind: 'PLACE', value: 'Dobrinja I' }]), []);
    assert.deepEqual(matchedWatches({ text: 'Naselje Dobrinja IV' }, [{ kind: 'PLACE', value: 'Dobrinja IV' }]), ['Dobrinja IV']);
  });
});

describe('kinds of notices', () => {
  it('recognises a planned shutdown', () => {
    assert.equal(notice().kind, 'shutdown');
    assert.equal(classifyNotice('Najava isključenja', 'Radovi na cjevovodu'), 'shutdown');
  });

  it('recognises a water shortage', () => {
    const text = 'zbog izuzetno nepovoljnih hidroloških prilika i niske izdašnosti izvorišta pristupit će djelimičnim redukcijama vode';
    assert.equal(classifyNotice('Vanredno obavještenje', text), 'shortage');
  });

  it('does not mistake a fault notice that quotes the daily plan for a shortage', () => {
    const text = 'došlo je do prekida zbog kvara na cjevovodu. PLAN REDUKCIJA ZATVARANJE 19.10.2026 od 11:00 do 18:00 časova ZONA I';
    assert.equal(classifyNotice('Vanredno obavještenje', text), 'breakdown');
  });

  it('treats an ordinary fault as a breakdown', () => {
    assert.equal(classifyNotice('Vanredno obavještenje', 'došlo je do prekida zbog kvara na cjevovodu'), 'breakdown');
  });

  function notice() {
    return parseNotice({ id: '652', date: '2026-10-16', title: 'Vanredno obavještenje' }, readFileSync(new URL('./fixture-notice.html', import.meta.url), 'utf8'));
  }
});

describe('closures the parser cannot read', () => {
  const page = '<div class="modal-description"><p>Obavještavamo potrošače u naselju Dobrinja 1 da je nastao kvar.</p><p><strong>ZATVARANJE 23.10.2026 od 04:30 do 12:00 časova - ZONA I</strong></p><p>-Mladičko polje</p><p><strong>ZATVARANJE od 20:30 do 05:00 časova - ZONA SA REZERVOARA PAVLOVAC (KRIŽ)</strong></p><p>Jovana Dučića, Kninska, Gatačka</p></div>';
  const result = parsePlan(page);

  it('keeps the readable closure and does not mix in the unreadable one', () => {
    assert.equal(result.closures.length, 1);
    assert.equal(result.closures[0].text, 'Mladičko polje');
  });

  it('keeps the unreadable closure with its streets', () => {
    const closure = result.extras.find(extra => extra.kind === 'closure');
    assert.match(closure.title, /PAVLOVAC/);
    assert.ok(closure.lines.includes('Jovana Dučića, Kninska, Gatačka'));
  });

  it('keeps text published before the first closure', () => {
    assert.match(result.extras[0].lines[0], /Dobrinja 1/);
  });

  it('turns them into notices people can be alerted about', () => {
    const notices = extrasToNotices(result.extras, '2026-10-22', '656');
    assert.equal(notices.length, 2);
    assert.equal(notices.find(item => item.title.includes('PAVLOVAC')).kind, 'closure');
    const [alert] = noticeNotifications({ notices, watches: [{ kind: 'PLACE', value: 'Kninska' }], sent: [], now: localEpoch(2026, 10, 22, 9, 0) });
    assert.match(alert.title, /Затварање воде – Книнска/);
  });

  it('gives the same notice the same id every time', () => {
    assert.equal(extrasToNotices(result.extras, '2026-10-22', '656')[0].id, extrasToNotices(result.extras, '2026-10-22', '656')[0].id);
  });
});

describe('script conversion', () => {
  it('turns Latin into Cyrillic, including digraphs', () => {
    assert.equal(toCyrillic('Njegoševa, Ljubović, Džamija, Đure Jakšića'), 'Његошева, Љубовић, Џамија, Ђуре Јакшића');
    assert.equal(toCyrillic('NJEGOŠEVA'), 'ЊЕГОШЕВА');
  });

  it('keeps zone numerals and product names in Latin letters', () => {
    assert.equal(toCyrillic('Zona II, Dobrinja IV, Na iPhone-u'), 'Зона II, Добриња IV, На iPhone-у');
    assert.equal(toCyrillic('i ostalo'), 'и остало');
  });

  it('turns Cyrillic back into Latin', () => {
    assert.equal(toLatin('Његошева, Ђуре Јакшића, Џамија'), 'Njegoševa, Đure Jakšića, Džamija');
  });

  it('matches a street typed in Cyrillic', () => {
    assert.deepEqual(matchedWatches(plan.closures[0], [{ kind: 'PLACE', value: 'Ђуре Јакшића' }]), ['Ђуре Јакшића']);
  });
});

describe('usage statistics', () => {
  const now = localEpoch(2026, 10, 23, 12, 0);

  it('rejects hits without a proper anonymous id', () => {
    assert.equal(sanitizeHit({ visitor: 'x' }), null);
    assert.equal(sanitizeHit({ visitor: 'a b c d e f g h' }), null);
    assert.deepEqual(sanitizeHit({ visitor: 'abcd1234-ef', lang: 'de', standalone: 'yes' }), { visitor: 'abcd1234-ef', lang: null, standalone: false });
  });

  it('counts unique visitors and every open', async () => {
    const store = getStore({});
    await recordHit(store, { visitor: 'visitor-one', lang: 'sr', standalone: true }, now);
    await recordHit(store, { visitor: 'visitor-one', lang: 'sr', standalone: false }, now);
    await recordHit(store, { visitor: 'visitor-two', lang: 'en', standalone: false }, now);
    const stats = await loadStats(store, now, 2);
    assert.deepEqual(stats.days[0], { day: '2026-10-23', visitors: 2, opens: 3, appOpens: 1, sr: 2, srLatn: 0, en: 1, pushOk: 0, pushFailed: 0, pushGone: 0 });
    assert.equal(stats.days[1].visitors, 0);
  });
});
