# Finds

A [Shortlist](https://github.com/nategk/shortlist) board for buying
high-quality second-hand things: right now a desk chair, standing desk, bed
frame and pull-out couch in New York; later anything (a bike, skis, a
camera) anywhere. Each item is its own search with its own rubric. Listings
arrive daily from Craigslist and, through a Claude-in-Chrome routine, from
Facebook Marketplace. Each one is scored on its text and photos, matched to
the maker's product page, and given the official product image as its last
photo.

Where you are (city, home base, Craigslist area, Facebook city) is one
`PLACE` block in `seed/searches.mjs`; nothing else is tied to a city.

## How it's built

This repo is a **layer** on the Shortlist engine, not a fork:

| Path | What |
|---|---|
| `vendor/shortlist/` | The engine, pinned (`vendor/ENGINE.json`). Never edited here. `npm run engine -- <ref>` moves the pin. |
| `layer.js` | Registers this layer's additions with the engine (`lib/layer.js` there). |
| `enrich/manufacturer.js` | Maker + exact model → product page, official image (last photo, labeled "Official"), retail price, % of retail. Only exact matches on the maker's own site get a link. |
| `api/` | Generated wrappers (`scripts/wrap-api.mjs`): register the layer, re-export the engine's handler. |
| `overrides/` | Name, manifest, icon laid over the engine's `app/` at build time (`scripts/build.mjs` → `public/`). |
| `seed/searches.mjs` | `PLACE` (your city) and the starting searches: rubrics, statuses, card metrics, sources. |
| `routines/fb-refresh.md` | The Facebook Marketplace routine for Claude in Chrome. |

Need something from the engine? Build it in Shortlist as a generic feature,
then `npm run engine -- main` here.

## Deploy

1. Vercel → Add New → Project → import `nategk/finds`. Keep the
   defaults (vercel.json sets the build and output).
2. Storage: create a **Neon** database and a **Blob** store and connect both.
3. Environment variables: `ADMIN_TOKEN` (16+ random chars), `CRON_SECRET`
   (16+), `ANTHROPIC_API_KEY`, `DAILY_CRAWL=1`. Redeploy. No Airtable for
   now: leave the `AIRTABLE_*` variables unset and the sync stays off.
4. Seed: `SHORTLIST_URL=https://<app>.vercel.app ADMIN_TOKEN=… npm run seed`
5. First crawl: Sources → Run crawl on each search (after that, daily).

## Local

```sh
npm install
DATABASE_URL=postgres://user:pass@localhost/finds npm run dev
npm test
```
