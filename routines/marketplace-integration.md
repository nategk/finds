# Marketplace integration → Shortlist

The Facebook Marketplace integration on the Mac searches in a signed-in
browser. Everything it finds goes to the Shortlist board, which is the one
place listings and triage live. Craigslist is searched by the board itself
(daily, or Sources → Run crawl from your phone).

## Live: feed the board on every run

Use `clients/shortlist.mjs` (no dependencies; copy it into the integration or
import it from this repo). Each run:

1. `board.plan()`: the board says what to search: every active item with
   its saved Facebook searches (`links`, edited in the board's Sources
   panel) and its board link. Don't keep a separate list on the Mac.
2. For each link, read the results page, then `board.screen(searchId,
   cards)` with `cards: [{ key: "fb-<item id>", title, price, location, url }]`.
   It returns the keys worth opening (all new ones while Claude has no
   credit).
3. Open those, then `board.add(searchId, items)` right away with the full
   post and every photo URL (https or data:image). Facebook photo links
   expire within hours; the board copies them as they arrive. The first
   photo is the card's cover.
4. Keep only what `add` returns: `listings: [{ key, id, result, board }]`.
   `board` is the listing's link on the board
   (`https://finds-nate-3636s-projects.vercel.app/?l=crawl-fb-<id>`); use it
   wherever the integration refers to a listing (logs, notifications,
   messages). `board.link("fb-<id>")` builds the same link offline.

Triage (status, notes, rank) happens on the board, from any device; the
integration never writes it.

## Once: move an existing export

    SHORTLIST_URL=https://finds-nate-3636s-projects.vercel.app ADMIN_TOKEN=… \
      node scripts/send.mjs ~/Documents/Src/marketplace/searches/*/finds-import.json

Listings that appear in more than one file go once; your status, notes and
rank stay as you set them. After that, keep working in the board.

## The admin token

Vercel → the live project → Settings → Environment Variables → `ADMIN_TOKEN`
(reveal it there). Keep it in the Mac's environment or keychain, not in
files in this repo.
