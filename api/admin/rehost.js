// POST /api/admin/rehost  (Authorization: Bearer $ADMIN_TOKEN)   { after?: "<id>" }
// Copies photos stored in some other Blob store (the project this one
// replaced) into this deployment's own store, so the old one can be
// deleted. Ten listings per call; while the reply says `more`, call again
// with its `after`. Each photo keeps its old URL as `original`.
import * as pg from "../../lib/postgres.js";
import { copyPhotosToBlob, ownBlobHost } from "../../lib/photos.js";
import { pushAfterWrite } from "../../lib/sync.js";
import { databaseUrl } from "../../lib/db.js";
import { json, fail, requireAdmin } from "../../lib/http.js";

export async function POST(request) {
  try {
    requireAdmin(request);
    if (!databaseUrl()) return json({ error: "Needs the Postgres backend (set DATABASE_URL)." }, 501);
    const host = ownBlobHost();
    if (!host) return json({ error: "No Blob store connected to this deployment." }, 400);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const after = typeof body.after === "string" ? body.after : "";
    const deadline = Date.now() + 240_000;
    const batch = await pg.listingsWithForeignPhotos(host, { after, limit: 10 });
    let copied = 0, failed = 0, last = after;
    const changed = [];
    for (const l of batch) {
      if (Date.now() > deadline) break;
      const r = await copyPhotosToBlob([{ id: l.id, photos: l.photos }], { deadline, foreign: true });
      copied += r.copied; failed += r.failed;
      if (r.copied) { await pg.setListingPhotos(l.id, l.photos); changed.push(l.id); }
      last = l.id;
    }
    const more = batch.length === 10 || last !== (batch[batch.length - 1]?.id ?? last);
    const airtable = await pushAfterWrite({ listings: changed });
    return json({ ok: true, listings: batch.length, copied, failed, more, after: more ? last : null, airtable });
  } catch (e) {
    return fail(e);
  }
}
