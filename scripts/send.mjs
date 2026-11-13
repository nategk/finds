// Sends listings from anywhere (the Mac's Marketplace integration, an old
// export) into Finds, which stays the one place they live.
//
//   FINDS_URL=https://finds-nate-3636s-projects.vercel.app ADMIN_TOKEN=… \
//     node scripts/send.mjs <file.json> [more.json…]
//
// Each file is an import snapshot: { searches?, sources?, listings }.
//   - listings: [{ id, searchIds: [searchId], title, price, status, notes, url,
//                  location, description, source, photos: [{ id, url }], fields }]
//     Use ids like "crawl-fb-<facebook item id>" so the Chrome routine and
//     later runs recognize them. The first photo is the cover.
//   - Your triage (status, notes, rank) on the board is kept for listings it
//     already has; new listings arrive with the status in the file.
//   - Photos are copied into the board's Blob storage on arrival, so
//     expiring Facebook links and data: URLs both survive.
// Listings that share an id with one already sent (in this run or another
// file) are sent once. One POST per search keeps each request small.
import { readFileSync } from "node:fs";

const base = (process.env.FINDS_URL || process.env.SHORTLIST_URL || "").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN || process.env.FINDS_ADMIN_TOKEN || "";
const files = process.argv.slice(2);
if (!base || !token || !files.length) {
  console.error("Usage: FINDS_URL=… ADMIN_TOKEN=… node scripts/send.mjs <file.json>…");
  process.exit(1);
}

const searches = new Map(), sources = new Map(), listings = new Map();
for (const f of files) {
  const snap = JSON.parse(readFileSync(f, "utf8"));
  for (const s of snap.searches || []) searches.set(s.id, s);
  for (const s of snap.sources || []) sources.set(s.id, s);
  for (const l of snap.listings || []) if (!listings.has(l.id)) listings.set(l.id, l);
}

const bySearch = new Map();
for (const l of listings.values()) {
  const id = (l.searchIds || [])[0] || "";
  if (!bySearch.has(id)) bySearch.set(id, []);
  bySearch.get(id).push(l);
}
const live = await (await fetch(base + "/api/snapshot")).json();
const known = new Set((live.searches || []).map(s => s.id));
for (const id of bySearch.keys()) {
  if (!id || (!known.has(id) && !searches.has(id))) {
    console.error(`Listings for "${id || "(no search)"}" skipped: no such search on the board. Add searchIds or include the search.`);
    bySearch.delete(id);
  }
}

for (const [id, ls] of bySearch) {
  const body = {
    searches: searches.has(id) ? [searches.get(id)] : [],
    sources: [...sources.values()].filter(s => (s.searchIds || [])[0] === id),
    listings: ls,
  };
  const res = await fetch(base + "/api/admin/import?keepTriage=1", {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(id, res.status, out.error || ""); process.exitCode = 1; continue; }
  const p = out.photos || {};
  console.log(`${id}: ${ls.length} listings · photos ${p.copied ?? 0} saved${p.failed ? `, ${p.failed} failed` : ""}`);
}
