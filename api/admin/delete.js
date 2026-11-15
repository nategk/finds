// POST /api/admin/delete  (Authorization: Bearer $ADMIN_TOKEN)
//   { ids: ["<listing id>", ...] }   (up to 500)
// Permanently deletes listings (e.g. junk a crawl let in). Triage writes stay
// non-destructive; this is the only way to remove a listing, and it is
// admin-only. Photos already copied to storage are left in place.
import * as postgres from "../../lib/postgres.js";
import { json, fail, requireAdmin } from "../../lib/http.js";

export async function POST(request) {
  try {
    requireAdmin(request);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const ids = Array.isArray(body.ids) ? body.ids.filter(i => typeof i === "string" && i) : [];
    if (!ids.length || ids.length > 500) return json({ error: "Send { ids: [1 to 500 listing ids] }." }, 400);
    const deleted = await postgres.deleteListings(ids);
    return json({ ok: true, deleted, missing: ids.length - deleted });
  } catch (e) {
    return fail(e);
  }
}
