# Working on Finds

## Shipping changes
- Small changes (UI tweaks, copy, styling, small fixes): merge to `main`
  and push without asking. Open a PR from the working branch and merge it
  right away, so there's a record. Run `node --check` on touched JS (and
  `npm test` when `TEST_DATABASE_URL` is available) first.
- Larger changes (schema/API changes, sync logic, anything that touches
  data or credentials, multi-file refactors): open a PR and ask before
  merging.
- `main` deploys to Vercel. Bump `SHELL` in `app/sw.js` when app files
  change so installed copies pick up the new version.

## Live data
One app holds every shortlist (furniture, rugs, NY Car, the archived
apartment hunt): https://finds-nate-3636s-projects.vercel.app (the Vercel
project "shortlist", deployed from this repo; the address predates its
rename and keeps working). Photos live in Cloudflare R2 (Vercel Blob as fallback; see lib/photos.js); the old
apartment project is paused as "shortlist-archived". Its data is in its database,
not this repo. Use `scripts/remote.mjs` or `scripts/send.mjs`
(`FINDS_URL`, `ADMIN_TOKEN`) to triage, update or send listings.
There is no Airtable mirror on it.

## Facebook Marketplace
Never crawled from the server. The Mac's Marketplace plugin and the
Claude-in-Chrome routine send listings in through `/api/intake`
(`clients/finds.mjs`, `routines/`), at a human pace.
