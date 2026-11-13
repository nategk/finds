// Moves every photo still in Vercel Blob to the deployment's current photo
// storage (R2), re-fetching from each photo's original source when the Blob
// store can't be read. Safe to re-run; stops if the monthly write cap is hit.
//
//   FINDS_URL=https://… ADMIN_TOKEN=… node scripts/rehost.mjs
//
const base = (process.env.FINDS_URL || process.env.SHORTLIST_URL || "").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN || "";
if (!base || !token) { console.error("Usage: FINDS_URL=… ADMIN_TOKEN=… node scripts/rehost.mjs"); process.exit(1); }

let after = "", calls = 0;
const tot = { listings: 0, copied: 0, failed: 0 };
for (;;) {
  const res = await fetch(base + "/api/admin/rehost", {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ after }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`HTTP ${res.status}: ${out.error || "failed"}`); process.exit(1); }
  calls++; tot.listings += out.listings; tot.copied += out.copied; tot.failed += out.failed;
  console.log(`call ${calls}: ${tot.listings} listings, ${tot.copied} photos copied, ${tot.failed} failed`);
  if (out.capped) { console.log("Monthly write cap reached; run again next month (or raise R2_MONTHLY_PUTS)."); break; }
  if (!out.more) break;
  after = out.after;
}
console.log("Done.");
