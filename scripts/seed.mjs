// Imports seed/searches.mjs into a live deployment. Searches and sources
// already there are left alone (your edits in the app win)
// unless you pass --force, which overwrites them with the seed's version.
// Listings are never touched.
//   SHORTLIST_URL=https://finds.vercel.app ADMIN_TOKEN=… npm run seed
//   … npm run seed -- --dry      print what would be sent
//   … npm run seed -- --force    overwrite existing searches and sources
import { snapshot } from "../seed/searches.mjs";

const base = (process.env.SHORTLIST_URL || "").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN || "";
const dry = process.argv.includes("--dry"), force = process.argv.includes("--force");
if (!base || (!token && !dry)) { console.error("Set SHORTLIST_URL and ADMIN_TOKEN."); process.exit(1); }

const live = await (await fetch(base + "/api/snapshot")).json();
const have = new Set([...(live.searches || []), ...(live.sources || [])].map(x => x.id));
const send = force ? snapshot : {
  searches: snapshot.searches.filter(s => !have.has(s.id)),
  sources: snapshot.sources.filter(s => !have.has(s.id)),
};
const skipped = snapshot.searches.length + snapshot.sources.length - send.searches.length - send.sources.length;
console.log(`${send.searches.length} searches and ${send.sources.length} sources to import${skipped ? `, ${skipped} already there (--force to overwrite)` : ""}.`);
if (dry) { console.log(JSON.stringify(send, null, 2)); process.exit(0); }
if (!send.searches.length && !send.sources.length) process.exit(0);

// One search per request, in order, so the board's tabs keep the seed's
// priority order (searches are listed by when they were created).
const post = async body => {
  const res = await fetch(base + "/api/admin/import?keepTriage=1", {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { console.error(res.status, text); process.exit(1); }
};
for (const s of send.searches) { await post({ searches: [s] }); console.log("search", s.id); }
if (send.sources.length) { await post({ sources: send.sources }); console.log(send.sources.length, "sources"); }
