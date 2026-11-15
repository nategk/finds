// DELETE /api/listings/:id (Authorization: Bearer $ADMIN_TOKEN) -> permanently removes the listing.
//   (Kept in this file: the Hobby plan caps a deployment at 12 functions.)
// PATCH /api/listings/:id  { status?, notes?, features?, rank? } -> triage write.
// rank: 1..999 or null (unranked); the app renumbers the others itself.
// Open to anyone with the link (by choice: nothing here is private), so it
// only accepts these fields, bounded in size.
import * as postgres from "../../lib/postgres.js";
import { pushAfterWrite } from "../../lib/sync.js";
import { json, fail, requireAdmin } from "../../lib/http.js";

export async function PATCH(request) {
  try {
    const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop());
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "Body must be JSON." }, 400); }
    const patch = {};
    if (typeof body.status === "string") patch.status = body.status.slice(0, 100);
    if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 10000);
    if (Array.isArray(body.features)) patch.features = body.features.filter(f => typeof f === "string").slice(0, 50).map(f => f.slice(0, 60));
    if (body.rank === null || (Number.isInteger(body.rank) && body.rank >= 1 && body.rank <= 999)) patch.rank = body.rank;
    if (!Object.keys(patch).length) return json({ error: "Nothing to update: send status, notes, features and/or rank." }, 400);
    const found = await postgres.updateListing(id, patch);
    if (!found) return json({ error: "No listing with id " + id }, 404);
    await pushAfterWrite({ listings: [id] });
    return json({ ok: true, id, ...patch });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request) {
  try {
    requireAdmin(request);
    const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop());
    const deleted = await postgres.deleteListings([id]);
    if (!deleted) return json({ error: "No listing with id " + id }, 404);
    return json({ ok: true, id });
  } catch (e) {
    return fail(e);
  }
}
