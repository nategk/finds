// Intake: listings sent in from outside instead of crawled. For sites that
// only open in a signed-in browser (e.g. Facebook Marketplace), a browser
// session reads the results and sends them here; the engine screens, scores,
// enriches and saves them exactly like crawled ones (lib/crawl.js addListing).
//
// Two steps, both under one source (created on first use, named by the
// sender, e.g. "Facebook Marketplace"):
//   screen(searchId, sourceName, candidates)  -> { keep: [key…] }
//     candidates: [{ key, title, price, location, url }]: what a results page
//     shows. Keys already seen or on the board are dropped; Claude keeps the
//     few worth opening. Everything not kept is marked seen.
//   add(searchId, sourceName, items)          -> { added, known, reposts, listings, … }
//     items: [{ key, url, title, price, location, description,
//               photos: [url | {id, url}], raw }]: the full posts. Photos may
//     be https URLs or data:image URLs (saved copies); all go to Blob.
//     listings: [{ key, id, result, board }] where each item now lives,
//     with `board`, the link that opens it on the board.
//   plan(sourceName, origin)                  -> { searches: [...] }
//     what an outside integration should search: each active search with
//     that source's saved search links and its board link.
import * as pg from "./postgres.js";
import { startRun, addListing, safeId, parallel } from "./crawl.js";
import { screenOrFirst, scoringEnabled } from "./score.js";

const KEEP = 12;
const MAX_ITEMS = 25;
const SEEN_CAP = 4000;

// Links into the board's app: one search, or one listing on it.
export const boardUrl = (origin, { searchId, listingId } = {}) => !origin ? "" :
  origin.replace(/\/$/, "") + "/" + (listingId ? "?l=" + encodeURIComponent(listingId) : searchId ? "?s=" + encodeURIComponent(searchId) : "");
const photoUrl = u => /^https?:\/\//.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u);

const bad = msg => { const e = new Error(msg); e.status = 400; return e; };
const str = (v, n = 500) => (v === undefined || v === null ? "" : String(v)).slice(0, n);
const price = v => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function checkKeys(list, what) {
  if (!Array.isArray(list) || !list.length) throw bad(`Send a non-empty ${what} array.`);
  for (const x of list) if (!x || typeof x.key !== "string" || !x.key.trim()) throw bad(`Every ${what.replace(/s$/, "")} needs a string key.`);
}

async function record(source, status, result, seenKeys) {
  const seen = [...new Set([...(source.seen || []), ...seenKeys])].slice(-SEEN_CAP);
  await pg.recordSourceRun(source.id, { status, result, seen });
}

export async function plan(sourceName, origin) {
  const searches = await pg.intakePlan(sourceName);
  return { source: sourceName, searches: searches.map(s => ({ ...s, board: boardUrl(origin, { searchId: s.searchId }) })) };
}

export async function screen(searchId, sourceName, candidates, { origin = "" } = {}) {
  checkKeys(candidates, "candidates");
  const run = await startRun(searchId);
  const source = await pg.ensureSource(searchId, sourceName);
  const seen = new Set(source.seen || []);
  const list = candidates.slice(0, 300).map(c => ({ key: str(c.key, 200), title: str(c.title, 300), price: price(c.price),
    priceText: str(c.price, 40), location: str(c.location, 200), url: str(c.url, 1000) }));
  const fresh = list.filter(c => !seen.has(c.key) && !run.ctx.knownUrls.has(c.url) && !run.ctx.knownTitles.has(pg.normTitle(c.title)));
  const screening = await screenOrFirst(run.ctx.search, fresh, KEEP, run.ctx.board);
  const keep = screening.keys, kept = new Set(keep);
  await record(source, "ok", `${list.length} sent · ${fresh.length} new · ${keep.length} worth a look` + (screening.skipped ? ` · not screened (${screening.skipped})` : ""),
    screening.screened ? fresh.filter(c => !kept.has(c.key)).map(c => c.key) : []);
  return { keep, fresh: fresh.length, board: boardUrl(origin, { searchId }), changed: { listings: [], sources: [source.id] } };
}

export async function add(searchId, sourceName, items, { deadline = Date.now() + 270_000, origin = "" } = {}) {
  checkKeys(items, "items");
  if (items.length > MAX_ITEMS) throw bad(`At most ${MAX_ITEMS} items per call.`);
  const run = await startRun(searchId);
  const source = await pg.ensureSource(searchId, sourceName);
  const counts = { added: 0, known: 0, reposts: 0, unfinished: 0 };
  const done = [], listings = [];
  await parallel(items, 3, async it => {
    if (Date.now() > deadline) { counts.unfinished++; listings.push({ key: str(it.key, 200), id: null, result: "not reached", board: "" }); return; }
    const key = str(it.key, 200);
    const d = {
      url: str(it.url, 1000), title: str(it.title, 300) || "Untitled", price: price(it.price),
      location: str(it.location, 300), description: str(it.description, 20000),
      photos: (Array.isArray(it.photos) ? it.photos : []).slice(0, 60).map((p, i) => typeof p === "string"
        ? { id: safeId(key) + "-" + i, url: str(p, /^data:/.test(p) ? 8_000_000 : 2000) }
        : { id: str(p.id, 120) || safeId(key) + "-" + i, url: str(p.url, /^data:/.test(p.url || "") ? 8_000_000 : 2000), ...(p.label ? { label: str(p.label, 40) } : {}) })
        .filter(p => photoUrl(p.url)),
      raw: it.raw && typeof it.raw === "object" ? it.raw : {},
    };
    const r = await addListing(run, source.name, key, d);
    done.push(key);
    const id = r === "added" ? "crawl-" + safeId(key) : await pg.findListingId(searchId, { id: "crawl-" + safeId(key), url: d.url });
    listings.push({ key, id, result: r, board: id ? boardUrl(origin, { listingId: id }) : "" });
    if (r === "added") counts.added++; else if (r === "repost") counts.reposts++; else counts.known++;
  });
  await record(source, "ok", `${items.length} sent · ${counts.added} added` + (counts.known ? ` · ${counts.known} already on the board` : "")
    + (counts.reposts ? ` · ${counts.reposts} repost${counts.reposts === 1 ? "" : "s"} skipped` : "")
    + (counts.unfinished ? ` · ${counts.unfinished} not reached` : ""), done);
  run.changed.sources.push(source.id);
  return { scored: scoringEnabled(), ...counts, listings, board: boardUrl(origin, { searchId }), photos: run.photos, changed: run.changed };
}
