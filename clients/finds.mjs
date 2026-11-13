// Finds client for outside integrations (the Mac's Facebook Marketplace
// browser search, or anything else that finds listings). No dependencies;
// Node 18+ or a browser. The board is the one place listings live: send
// what you find, keep only the board links it returns.
//
//   import { finds } from "./finds.mjs";
//   const board = finds({ url: process.env.FINDS_URL || process.env.SHORTLIST_URL, token: process.env.ADMIN_TOKEN });
//   const { searches } = await board.plan();            // what to search, per item
//   for (const s of searches) {
//     for (const link of s.links) {                      // the board's saved Facebook searches
//       const cards = await readResultsPage(link.url);   // your browser code: [{ key, title, price, location, url }]
//       const { keep } = await board.screen(s.searchId, cards);
//       const items = await Promise.all(keep.map(k => openListing(k)));   // [{ key, url, title, price, location, description, photos, raw }]
//       const { listings } = await board.add(s.searchId, items);
//       for (const l of listings) console.log(l.result, l.board);       // e.g. added https://…/?l=crawl-fb-123
//     }
//   }
//
// Keys: "fb-<item id>" (the board stores "crawl-fb-<item id>"). Photos:
// https URLs or data:image URLs; the first is the cover; all are copied to
// the board's storage on arrival, so send them right after opening a post.
export function finds({ url, token, source = "Facebook Marketplace", fetch: f = globalThis.fetch } = {}) {
  if (!url) throw new Error("finds(): url is required (FINDS_URL)");
  const base = url.replace(/\/$/, "");
  const call = async (method, path, body) => {
    const res = await f(base + path, {
      method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(out.error || `Finds ${method} ${path}: HTTP ${res.status}`), { status: res.status });
    return out;
  };
  const need = () => { if (!token) throw new Error("finds(): token is required to send (ADMIN_TOKEN)"); };
  return {
    // Each active item with the board's saved links for this source and its board link.
    plan: () => call("GET", "/api/intake?source=" + encodeURIComponent(source)),
    // Which result cards are worth opening: { keep: [key…], board }.
    screen: (searchId, candidates) => { need(); return call("POST", "/api/intake", { searchId, source, step: "screen", candidates }); },
    // Full posts, 25 per request: { added, known, reposts, listings: [{ key, id, result, board }], board }.
    async add(searchId, items) {
      need();
      const out = { added: 0, known: 0, reposts: 0, listings: [], board: "" };
      for (let i = 0; i < items.length; i += 25) {
        const r = await call("POST", "/api/intake", { searchId, source, step: "add", items: items.slice(i, i + 25) });
        out.added += r.added || 0; out.known += r.known || 0; out.reposts += r.reposts || 0;
        out.listings.push(...(r.listings || [])); out.board = r.board || out.board;
      }
      return out;
    },
    // The board link for a listing id or an fb key, without a request.
    link: idOrKey => base + "/?l=" + encodeURIComponent(/^crawl-|^manual-/.test(idOrKey) ? idOrKey : "crawl-" + idOrKey),
  };
}

// The earlier name, for integrations written against clients/finds.mjs.
export const shortlist = finds; // earlier name
