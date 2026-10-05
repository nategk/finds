# Facebook Marketplace refresh (Claude in Chrome)

Facebook Marketplace only opens signed in, so the server never crawls it.
Instead, Claude in Chrome browses **your own signed-in Chrome** once a day
(or when you say "refresh FB") and sends what it finds to Finds's
`/api/intake`, which screens, scores, finds the maker's page and saves the
listings like any crawled ones.

Run it from the Claude desktop app with Claude in Chrome connected: paste
the prompt below, or save it as a scheduled task. Your machine and Chrome
need to be on.

## Pace: keep it human

Meta's terms prohibit automated collection, and Facebook flags bot-like
browsing. Your account is what's at risk, so:

- Only the saved searches below, once a day. No scrolling past the first
  screen or two of results.
- Open at most **5 listings per search** (the ones intake says are worth it),
  ~25 total per run.
- Pause a few seconds between pages. Stop at once on any checkpoint,
  captcha or "you're going too fast" notice, and tell me.
- Never message sellers, never click Buy / Make offer, never change account
  settings.

## Setup

- `FINDS_URL`: the deployment, e.g. `https://finds.vercel.app`
- `FINDS_ADMIN_TOKEN`: the deployment's `ADMIN_TOKEN`. Keep it in the
  desktop app's environment or a local file the task reads. Never paste it
  into the prompt.

## The prompt

> Refresh Facebook Marketplace for Finds. Follow
> routines/fb-refresh.md in the finds repo exactly, including the
> pace rules.
>
> 1. GET `$FINDS_URL/api/snapshot`. For each search with state Active, find
>    its source named "Facebook Marketplace" and its saved search links.
> 2. For each link: open it in a new tab in my Chrome, wait for results, and
>    read the first screen or two of result cards. For each card collect
>    `{ key: "fb-<item id from /marketplace/item/<id>/>", title, price,
>    location, url }`.
> 3. POST `$FINDS_URL/api/intake` with `Authorization: Bearer
>    $FINDS_ADMIN_TOKEN` and `{ searchId, source: "Facebook Marketplace",
>    step: "screen", candidates }` (all cards for that search, deduped by
>    key). The reply's `keep` lists the keys worth opening.
> 4. Open each kept listing (at most 5 per search). Collect the full
>    description, the condition and any listed details, the seller's
>    location, the price, and **every photo**: step through the whole
>    gallery and take each full-size image URL (`scontent…fbcdn.net`).
> 5. POST `{ searchId, source: "Facebook Marketplace", step: "add", items:
>    [{ key, url, title, price, location, description, photos: [url…],
>    raw: { condition, details } }] }` to `/api/intake` right away (photo
>    URLs expire within hours; the server copies them as they arrive).
> 6. Close the tabs you opened. Report per search: cards read, kept, added.
