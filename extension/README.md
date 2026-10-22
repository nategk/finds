# Shortlist for Facebook Marketplace (Chrome extension)

Sends Marketplace listings you're looking at in desktop Chrome to your
Shortlist board, through the deployment's intake endpoint
(`POST /api/intake`, see ARCHITECTURE.md → Crawling → Intake). Listings
arrive like crawled ones: screened, scored against the search's criteria,
located, photos copied to Blob, and synced to Airtable.

It only reads pages in your own signed-in browser, and only when you click.
It doesn't log in, crawl in the background or run on a schedule.

## Install

1. Open `chrome://extensions`, turn on **Developer mode** (top right).
2. **Load unpacked** → choose this `extension/` folder.
3. Pin the extension, click it, and fill in **Settings**:
   - **Shortlist URL**: your deployment, e.g. `https://your-app.vercel.app`.
     Chrome asks once to let the extension reach it.
   - **Admin token**: the deployment's `ADMIN_TOKEN`. Kept in this browser's
     extension storage only.
   - **Search**: which search the listings go to.
   - **Source name**: defaults to "Facebook Marketplace" (matches an existing
     source of that name, case-insensitively).

After pulling a new version, click the reload icon on the extension's card in
`chrome://extensions`.

## Use

- **On a results or search page** (e.g. Marketplace → Vehicles with your
  filters): scroll until the listings you want have loaded, then **Send this
  page's listings**. The cards (title, price, place, miles) go to the intake
  screen, which drops anything already seen or on the board and picks the
  ones worth opening (Claude against the search's criteria; the first 12
  when scoring is off).
- **Open and add picks**: opens each pick in a background tab, one at a time
  with a few seconds' pause, reads the post (description, vehicle details
  such as miles and colors, photos, approximate location), sends it, and
  closes the tab. **Stop** halts after the current one.
- **On a single listing**: **Add this listing** sends just that one.

Facebook's photo links expire within hours; the intake copies them to Blob
straight away (when Blob storage is configured and has room).

## Notes

- Facebook's markup changes often. `extract.js` avoids class names: it reads
  the listing JSON Facebook embeds in item pages and falls back to the
  visible text. If a field stops coming through, compare a saved page with
  `test/fixtures/fb-*.html` and adjust `extract.js`; `npm test` runs
  `test/fb-extract.test.mjs` against those fixtures.
- If you're signed out of Facebook, listings open on its login page; the
  extension stops on that listing and says so.
- Meta's terms restrict automated collection from its sites. The extension is
  built to stay at a person's pace (it reads only what you open, at most 12
  listings per click, one at a time), but how you use it on your account is
  your call.
