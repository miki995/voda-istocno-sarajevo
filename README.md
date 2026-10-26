# Voda · Istočno Sarajevo

Water outage alerts for Istočno Sarajevo. Pick your streets, neighbourhoods or a whole zone and get a push notification when the water is about to be cut. The data comes from the reduction plan published on https://vikis.info/ ("Servisne informacije").

The site is available in Serbian (default in Cyrillic, with a Latin option in the menu) and English. Serbian is always the default, whatever the browser language is; English is optional and chosen with the switch in the menu (the choice is remembered). The language also decides the language of the push notifications.

## How it works

- `/api/cron` reads vikis.info, extracts the closures (zone, time window, neighbourhoods and streets), stores them in Redis and sends web push notifications.
- The home page only shows today's plan, but its calendar lists the plans for the following days (`/sr/event/show/{id}`). Those are read as well, up to 7 days ahead, and refreshed every 30 minutes or when the list of events changes.
- If a closure header cannot be parsed, it is logged (`could not read closure header`) rather than dropped silently.
- A GitHub Actions workflow (`.github/workflows/poll.yml`) calls `/api/cron` every 5 minutes. Vercel Hobby only allows a daily cron, so the daily cron in `vercel.json` is just a fallback.
- A subscription is a set of watches: a street or neighbourhood (matching ignores š, đ, č, ć, ž) or a whole zone (I, II, III).
- Notifications are sent when the plan is published, in the morning of the closure day (after 07:00) and about 2 hours before the closure starts. If several are due at once, only the most urgent one is sent.
- Besides the plan, the site publishes notices (breakdowns, works, shutdown announcements, water shortages). They are read from the calendar (last 14 days and the next 7; the home page only highlights those from the last 3 days), sorted into `breakdown`, `shutdown`, `shortage` and `closure` (`src/notices.js`) and shown on the home page and in the menu. Text a plan page publishes before its first closure, and closure headers the parser cannot read, are kept as notices too instead of being dropped. A notice that mentions one of your streets triggers a push notification once.
- The street list per zone grows with every plan the site sees. The initial list lives in `src/zones-seed.json`.

## Usage statistics

The app counts its own usage in Redis, with no cookies and no third-party service. Once per browser session it sends a random device id (kept in `localStorage`), the language and whether it was opened from the Home Screen to `/api/hit`. No IP address or user agent is stored. To read the numbers (30 days of unique visitors, opens, Home Screen opens, language split, number of subscribers and the ten most watched streets or zones):

```
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SITE/api/stats
```

### Google Analytics (optional)

Paste a GA4 Measurement ID into `MEASUREMENT_ID` in `public/analytics.js`. While it is empty, nothing from Google is loaded. IP anonymisation is on, ad personalisation is off, Do Not Track and Global Privacy Control are respected, and street names are never sent. Events: `add_watch`, `enable_alerts`, `change_language`, `read_notice`. Google Analytics does not replace `/api/stats`, which is the only place that shows subscribers and the most watched streets.

## Project layout

```
api/        Vercel serverless functions (plan, zones, vapid, subscribe, unsubscribe, cron, hit, stats)
src/        parser, notices, notification planning, usage stats, storage, messages (sr/en)
public/     static site (index.html, app.js, i18n.js, service worker, manifest)
scripts/    VAPID key generator, zone seeding, local dev server
test/       parser and notification tests, run against a saved copy of the vikis.info page
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

## Deploying to Vercel

Environment variables (Production): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, plus Upstash Redis (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the Marketplace integration).

GitHub repository secrets for the poll workflow: `SITE_URL` (for example `https://voda-istocno-sarajevo.vercel.app`, no trailing slash) and `CRON_SECRET` (the same value as on Vercel).

## Notes

- iPhone: push notifications only work after the site is added to the Home Screen (Safari → Share → Add to Home Screen).
- If vikis.info changes the layout of the plan, only `src/parser.js` needs fixing. `npm test` shows whether the parser still reads the real page (`test/fixture-home.html`).
