# Voda · Istočno Sarajevo

Obavještenja o nestanku vode za izabrane ulice, naselja ili cijele zone. Izvor je plan redukcije na https://vikis.info/ (Servisne informacije).

## Kako radi

- `/api/cron` čita vikis.info, izvlači zatvaranja (zona, termin, naselja i ulice), čuva ih u Redisu i šalje web push obavještenja.
- GitHub Actions (`.github/workflows/poll.yml`) poziva `/api/cron` svakih 5 minuta. Vercel Hobby dozvoljava cron samo jednom dnevno, pa je to dnevni rezervni okidač u `vercel.json`.
- Pretplata je skup izbora: ulica/naselje (poklapanje bez obzira na š, đ, č, ć, ž) ili cijela zona I/II/III.
- Obavještenje stiže: čim se plan objavi, ujutro na dan zatvaranja (poslije 07:00) i oko 2 sata prije početka. Ako je više njih dospjelo odjednom, šalje se samo najhitnije.
- Spisak ulica po zonama se dopunjava iz svakog plana koji sajt vidi (početni spisak: `src/zones-seed.json`).

## Lokalno

```
npm install
npm test
npm run dev
```

Lokalno se koristi memorijsko skladište (nestaje pri gašenju). Ključeve stavi u `.env.local` (nije u gitu):

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:ti@example.com
CRON_SECRET=bilo-sta
```

`npm run keys` generiše VAPID par. Cron ručno: `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:8787/api/cron`.

## Vercel

Okolinske varijable (Production): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, te Upstash Redis (`UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN`, ili `KV_REST_API_URL` i `KV_REST_API_TOKEN` iz Marketplace integracije).

GitHub repo tajne za poll workflow: `SITE_URL` (npr. `https://voda-istocno-sarajevo.vercel.app`, bez kosine na kraju) i `CRON_SECRET` (ista vrijednost kao na Vercelu).

## Napomene

- iPhone: obavještenja rade tek kad se sajt doda na početni ekran (Safari → Podijeli → Dodaj na početni ekran).
- Ako vikis.info promijeni izgled plana, popravlja se samo `src/parser.js`; `npm test` pokazuje da li parser i dalje čita stvarnu stranicu (`test/fixture-home.html`).
