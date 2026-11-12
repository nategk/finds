// POST /api/intake  (Authorization: Bearer $ADMIN_TOKEN)
// Listings sent in from a signed-in browser or a phone instead of crawled
// (lib/intake.js). Two steps:
//   { searchId, source, step: "screen", candidates: [{ key, title, price, location, url }] }
//     -> { keep: [key…] }   the ones worth opening
//   { searchId, source, step: "add", items: [{ key, url, title, price, location, description, photos, raw }] }
//     -> { added, known, reposts, photos, listings: [{ key, id, result, board }] }
//   Every reply carries `board` links into the app (?s=<search>, ?l=<listing>).
//
// GET /api/intake?source=Facebook%20Marketplace   (public, like the snapshot)
//   -> { searches: [{ searchId, name, collection, links, listings, board }] }
//   what an integration should search: each active search's saved links for
//   that source.
import * as intake from "../lib/intake.js";
import { pushAfterWrite } from "../lib/sync.js";
import { databaseUrl } from "../lib/db.js";
import { json, fail, requireAdmin } from "../lib/http.js";

export async function POST(request) {
  try {
    requireAdmin(request);
    if (!databaseUrl()) return json({ error: "Intake needs the Postgres backend (set DATABASE_URL)." }, 501);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    if (!body.searchId || typeof body.searchId !== "string") return json({ error: "Send { searchId }." }, 400);
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 80) : "";
    if (!source) return json({ error: "Send { source }: the site these came from, e.g. \"Facebook Marketplace\"." }, 400);
    let out;
    const origin = new URL(request.url).origin;
    if (body.step === "screen") out = await intake.screen(body.searchId, source, body.candidates, { origin });
    else if (body.step === "add") out = await intake.add(body.searchId, source, body.items, { origin });
    else return json({ error: "Send step: \"screen\" or \"add\"." }, 400);
    const { changed, ...rest } = out;
    const airtable = await pushAfterWrite(changed);
    return json({ ok: true, ...rest, airtable });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(request) {
  try {
    if (!databaseUrl()) return json({ error: "Intake needs the Postgres backend (set DATABASE_URL)." }, 501);
    const url = new URL(request.url);
    const source = (url.searchParams.get("source") || "").trim().slice(0, 80);
    if (!source) return json({ error: "Add ?source=, e.g. ?source=Facebook%20Marketplace" }, 400);
    return json({ ok: true, ...(await intake.plan(source, url.origin)) });
  } catch (e) {
    return fail(e);
  }
}
