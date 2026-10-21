# Voda · Istočno Sarajevo

Water outage alerts for Istočno Sarajevo. Pick your streets, neighbourhoods or a whole zone and get a push notification when the water is about to be cut. The data comes from the reduction plan published on https://vikis.info/ ("Servisne informacije").

The site is available in Serbian (default, Latin script) and English. The language is chosen with the switch in the header and also decides the language of the push notifications.

## How it works

- `/api/cron` reads vikis.info, extracts the closures (zone, time window, neighbourhoods and streets), stores them in Redis and sends web push notifications.
- A GitHub Actions workflow (`.github/workflows/poll.yml`) calls `/api/cron` every 5 minutes. Vercel Hobby only allows a daily cron, so the daily cron in `vercel.json` is just a fallback.
- A subscription is a set of watches: a street or neighbourhood (matching ignores š, đ, č, ć, ž) or a whole zone (I, II, III).
- Notifications are sent when the plan is published, in the morning of the closure day (after 07:00) and about 2 hours before the closure starts. If several are due at once, only the most urgent one is sent.
- The street list per zone grows with every plan the site sees. The initial list lives in `src/zones-seed.json`.

## Project layout

```
api/        Vercel serverless functions (plan, zones, vapid, subscribe, unsubscribe, cron)
src/        parser, notification planning, storage, messages (sr/en)
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
