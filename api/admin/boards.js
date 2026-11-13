// POST /api/admin/boards  (Authorization: Bearer $ADMIN_TOKEN)
// The Finds menu: add, rename, archive and delete finds and the
// items on them (lib/boards.js lists the actions).
import { manage } from "../../lib/boards.js";
import { pushAfterWrite } from "../../lib/sync.js";
import { json, fail, requireAdmin } from "../../lib/http.js";

export async function POST(request) {
  try {
    requireAdmin(request);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const { changed, ...out } = await manage(body);
    const airtable = changed.length ? await pushAfterWrite({ searches: changed }) : { skipped: "nothing to sync" };
    return json({ ok: true, ...out, airtable });
  } catch (e) {
    return fail(e);
  }
}
