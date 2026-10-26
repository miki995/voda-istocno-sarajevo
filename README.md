# Вода ИС · Voda Istočno Sarajevo

Water outage alerts for Istočno Sarajevo. Pick your streets and get a push notification when the water is about to be cut, when it is back, and a summary the evening before. The data comes from the reduction plan and notices published on https://vikis.info/ (the website of the water utility).

Live at https://vodais.vercel.app. It is a web app (PWA): it can be added to the Home Screen, works offline and sends push notifications. There are no accounts; everything the person chooses is kept on their device.

## What people see

**Home screen.** One card per watched street with the state of the water, shown by a small animated drop: happy (no outages planned), with a ticking clock (an outage is coming) or sad (no water now). The card has a live countdown ("in 4 h 51 min", "2 h 10 min left"), buttons to add the outage to the calendar (.ics with a reminder an hour before), share it as text or remove the street (with a few seconds to undo), and an "All times" grid of the next seven days with a 24-hour bar per day. While the plan loads there are shimmering placeholders, and if it cannot be loaded there is an honest message with "Try again" instead of a green "all good".

**Menu.** My streets, Utility notices (breakdowns, works, shutdown announcements, shortages; the ones mentioning your streets are marked), Full plan, Share the app, Settings, Sources and Collaboration.

- **Add a street:** "Find my street" compares the phone position with the known streets on the device itself (the position is never sent anywhere) and offers the nearest ones; or type a name (Cyrillic or Latin, matching ignores š, đ, č, ć, ž); or pick it on the map. A typed street that is not on the list can still be added and will match when it appears in a plan. Whole zones cannot be added any more, but a zone someone already watches keeps working.
- **Full plan:** the week ahead as a grid (one row per day, one column per zone, in the zone colours of the map), "Share as picture" for a ready image for stories and group chats, and a tap on a zone opens the list of its streets.
- **Zone map:** every known street is a dot in the colour of its zone (I blue, II orange, III purple) on OpenStreetMap. The map is approximate: an outage applies to the streets named in the plan.
- **Settings:** language and script (Cyrillic by default, Latin, English), text size (three sizes), alerts on/off and "Install the app".
- **Sources:** the utility's website, its Facebook page, its phone number and the map credit.
- **Collaboration:** a form for business enquiries only. The sender never sees where the message goes, and messages that look like questions about water or breakdowns are refused with the utility's phone number.

Also: an install popup shown once on the home screen after a street is added (and not again for two weeks after "Not now"), a notice for people who open the link inside Instagram, Facebook or Viber (alerts and installing do not work in those in-app browsers), and a warning with the utility's Facebook page and phone number if the plan cannot be refreshed.

**Language.** Serbian is the default whatever the browser language is: Cyrillic, with Latin as an option, and English. The Serbian texts are written in Latin in the code and converted to Cyrillic on the way out (`public/translit.js`), which is also used for street names and notices and for push notifications. Zone numerals (II, IV) and brand names stay in Latin letters. The name under the installed icon is "Вода ИС".

## How it works

- `/api/cron` reads vikis.info, extracts the closures (zone, time window, neighbourhoods and streets) and notices, stores them in Redis and sends the push notifications that are due. Plans for the next 7 days are read from the calendar of the home page (`/sr/event/show/{id}`) and refreshed every 30 minutes or when the list changes; notices from the last 14 days are kept.
- A subscription is a device with a list of watches (a street, or a whole zone for older subscriptions). Each subscriber has a `sent` list so nothing is sent twice.
- Notifications per street, at most one per kind per closure: **published** (when the plan appears), **morning** (after 07:00 on the day), **soon** (about 2 hours before), **evening** (after 20:00, one message with everything closed tomorrow), **restored** (up to 2 hours after a closure ends, but not when another one for the same street follows right away) and **notice** (once, when a notice mentions the street). If more than three are due at once for one person (for example after the checker was down) the two most urgent are sent and the rest become one "N more new alerts" message.
- The street list per zone grows with every plan the site sees (`/api/zones`); the first list is `src/zones-seed.json`.
- **Light on Redis:** all subscribers are read with one `MGET` per 200 and notified in groups of 25 within a 22-second budget (the rest waits for the next run, in shuffled order).

## Keeping it running

- **The schedule.** `.github/workflows/poll.yml` calls `/api/cron` every 5 minutes, but GitHub delays or drops scheduled runs, so for a steady schedule add a free cron-job.org job: GET `https://YOUR-SITE/api/cron` every 5 minutes with the header `Authorization: Bearer <CRON_SECRET>`. The Vercel cron in `vercel.json` (daily, the Hobby limit) is only a last resort. As a safety net `/api/plan` also refreshes the data itself when the last check is older than 10 minutes (only the first visitor in each 5 minutes does the work). The workflow fails unless the answer is HTTP 200, and the `SITE_URL` secret must be the live domain, not one that redirects.
- **The source is watched.** If vikis.info cannot be read, its layout changed, a closure header cannot be understood, or the text of notice pages cannot be read, a mail is sent after the same problem has lasted 30 minutes (at most once a day), and one more when it is fine again. The home page shows its warning only when the check itself fails (cannot read, layout changed, or no check for an hour), never just because there is no news.
- **Status page** `/admin.html` asks for `CRON_SECRET` and shows subscribers, the last cron run, any source problem, push delivery (ok / failed / removed devices), visits per day and per source, in-app browser opens and the most watched streets, plus a "Send test mail" button.
- **Usage statistics** live in Redis, with no cookies and no third-party service. Once per browser session the app sends a random device id (kept in `localStorage`), the language, whether it was opened from the Home Screen, an optional `utm_source` and whether it runs inside an in-app browser to `/api/hit`. No IP address or user agent is stored. Share links as `https://YOUR-SITE/?utm_source=instagram` to see what brings people (counted names: instagram, facebook, viber, whatsapp, tiktok, telegram, youtube, google, sms, email, qr; anything else is `other`). The same numbers are available with `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SITE/api/stats`.
- **Google Analytics (optional):** paste a GA4 Measurement ID into `MEASUREMENT_ID` in `public/analytics.js`. While it is empty nothing from Google is loaded; IP anonymisation is on, Do Not Track and Global Privacy Control are respected and street names are never sent.

## Security and privacy

- The open endpoints (`hit`, `subscribe`, `unsubscribe`) and the secret-protected ones (`cron`, `stats`, `test-alert`) allow a limited number of calls per minute per caller (20 to 30, the test mail 10). The caller address is taken from what Vercel sets, kept only in a counter that expires after two minutes, and never from a header the caller can write. The contact form allows 3 messages per hour per caller and 40 per day overall, reserved before sending (the day is handed back whenever a mail fails; the caller's try only when the fault is ours: no mail settings or the mail service answering 5xx); it fails closed if the store is down, a hidden field catches robots, and messages need a collaboration word, at most two links and a confirmed checkbox (`public/contact-rules.js`, checked in the form and again on the server).
- The address that receives alerts and contact messages is only read from the server setting `ALERT_EMAIL`; it is not written anywhere in the code.
- Visit sources are counted from a fixed list, so the open endpoint cannot grow the database without bound.
- The phone position is compared on the device; map tiles and the Leaflet library (loaded from cdnjs with an integrity hash) come from third parties.

## Project layout

```
api/        Vercel functions: plan, zones, vapid, subscribe, unsubscribe, hit, cron, stats, test-alert, contact
src/        parser, calendar events, notices, notification planning, health checks and mail, rate limits, storage, messages (sr/en)
public/     the app: index.html, app.js, i18n.js, translit.js, map.js, calendar.js, share-image.js, status-art.js, contact-rules.js,
            service worker (sw.js), manifest, places.json (map coordinates), admin page, link-preview image
scripts/    VAPID keys, zone seeding, geocoding of the streets, local dev server
test/       parser, notification, notices, usage and script-conversion tests, run against saved copies of the vikis.info pages
```

## Local development

```
npm install
npm test
npm run dev
```

Locally an in-memory store is used, so data is lost when the server stops. Put your keys in `.env.local` (git-ignored):

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=anything
```

`npm run keys` generates a VAPID key pair. To run the cron by hand:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:8787/api/cron
```

The local server sends no cache headers, so a changed file shows at once. The first time a service worker is registered, API answers are only cached from the second load on.

## Deploying to Vercel

Environment variables (Production):

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: web push keys.
- `CRON_SECRET`: protects `/api/cron`, `/api/stats` and `/api/test-alert`, and is the key of the status page.
- Upstash Redis: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the Marketplace integration.
- `RESEND_API_KEY` and `ALERT_EMAIL` for the problem mails and the contact form (optionally `ALERT_FROM`). Resend's test sender `onboarding@resend.dev` can only deliver to the address the Resend account was made with. Without `ALERT_EMAIL` nothing is mailed.

GitHub repository secrets for the poll workflow: `SITE_URL` (for example `https://vodais.vercel.app`, no trailing slash) and `CRON_SECRET` (the same value as on Vercel).

After changing an environment variable, redeploy so it takes effect. The first call to `/admin.html` → "Send test mail" shows whether mail works.

## Maintenance

- **New streets on the map.** `public/places.json` has coordinates for every street the app knows. When new streets appear in the plan run `node scripts/geocode-places.mjs https://YOUR-SITE` (it asks OpenStreetMap Nominatim, one request per second, and keeps what it already has). Places the plan names differently than the map does are listed in `ALIASES` and `SEARCH_NAMES` at the top of the script.
- **If vikis.info changes its layout,** the problem mail says what could not be read; only `src/parser.js` (plans) or `src/notices.js` (notices) needs fixing. `npm test` shows whether the parser still reads the saved real pages (`test/fixture-*.html`).
- **A new file the app imports must also be added to `SHELL` in `public/sw.js`** (and the cache name bumped), otherwise the app opens empty without a connection.
- iPhone: push notifications only work after the site is added to the Home Screen (Safari → Share → Add to Home Screen).
