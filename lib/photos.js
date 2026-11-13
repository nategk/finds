// Copies listing photos into our own storage so they outlive the source site
// (Craigslist deletes photos when a post comes down). Two backends:
//   - Cloudflare R2 (preferred): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//     R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL. Free tier is 10 GB and
//     1M writes a month; writes here are capped well below that (see below).
//   - Vercel Blob: BLOB_READ_WRITE_TOKEN (Hobby allows only 2k writes a month).
// Without either, photos keep their original URLs.
import { createHash, createHmac } from "node:crypto";
import { put } from "@vercel/blob";
import { blobToken, db } from "./db.js";

const BLOB_HOST = /\.blob\.vercel-storage\.com\//;

// R2 writes are capped so a bug or a big import can never run into paid
// overage: at most MONTHLY_PUTS writes and MONTHLY_BYTES a month (UTC), and
// MAX_BYTES per photo. Defaults are a tenth of the free tier or less. Once
// the cap is hit, photos keep their source URLs and are retried next month
// (or raise R2_MONTHLY_PUTS / R2_MONTHLY_MB).
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const MONTHLY_PUTS = () => num(process.env.R2_MONTHLY_PUTS, 50_000);
const MONTHLY_BYTES = () => num(process.env.R2_MONTHLY_MB, 2000) * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024;

export function r2Config() {
  const e = process.env;
  const c = { account: e.R2_ACCOUNT_ID, key: e.R2_ACCESS_KEY_ID, secret: e.R2_SECRET_ACCESS_KEY, bucket: e.R2_BUCKET, base: (e.R2_PUBLIC_URL || "").replace(/\/+$/, "") };
  return c.account && c.key && c.secret && c.bucket && c.base ? c : null;
}

export const storageBackend = () => (r2Config() ? "r2" : blobToken() ? "blob" : "");
export const storageEnabled = () => !!storageBackend();

// A URL we host ourselves (either backend, any store).
export const isHosted = url => BLOB_HOST.test(url) || (!!r2Config() && String(url).startsWith(r2Config().base + "/"));
export const isBlob = isHosted;
export const isVercelBlob = url => BLOB_HOST.test(url);

// This deployment's own Blob store, from its token (vercel_blob_rw_<store id>_…):
// photos in another store (a project that was folded into this one) can
// be copied here with copyPhotosToBlob(…, { foreign: true }).
export function ownBlobHost() {
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(blobToken() || "");
  return m ? `${m[1].toLowerCase()}.public.blob.vercel-storage.com` : "";
}
export const isOwnBlob = url => { const h = ownBlobHost(); return !!h && String(url).startsWith("https://" + h + "/"); };

// Claim one write against this month's cap; false = cap reached (or no database).
export async function reserveWrite(bytes) {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const r = await db().query(
      `insert into storage_usage (month, puts, bytes) values ($1, 1, $2)
       on conflict (month) do update set puts = storage_usage.puts + 1, bytes = storage_usage.bytes + $2
         where storage_usage.puts < $3 and storage_usage.bytes + $2 <= $4
       returning puts`, [month, bytes, MONTHLY_PUTS(), MONTHLY_BYTES()]);
    return r.rowCount > 0;
  } catch (e) { return false; }
}

const sha256 = d => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

// PutObject on R2's S3 API, signed with SigV4 (no SDK needed).
export async function r2Put(cfg, key, body, contentType, now = new Date()) {
  const host = `${cfg.account}.r2.cloudflarestorage.com`;
  const path = "/" + cfg.bucket + "/" + key.split("/").map(encodeURIComponent).join("/");
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amz.slice(0, 8);
  const payload = sha256(body);
  const hdrs = { "content-type": contentType, host, "x-amz-content-sha256": payload, "x-amz-date": amz };
  const names = Object.keys(hdrs).sort();
  const canonical = ["PUT", path, "", ...names.map(n => `${n}:${hdrs[n]}`), "", names.join(";"), payload].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + cfg.secret, day), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const res = await fetch("https://" + host + path, {
    method: "PUT", body,
    headers: { ...hdrs, authorization: `AWS4-HMAC-SHA256 Credential=${cfg.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
  });
  if (!res.ok) throw new Error("R2 " + res.status);
  return cfg.base + "/" + key.split("/").map(encodeURIComponent).join("/");
}

// Photos not copied by `deadline` are left for the next run. `foreign`:
// also move photos hosted in a Vercel Blob store that isn't this
// deployment's current storage; those are re-fetched from their `original`
// source when they have one (a suspended store can't be read).
export async function copyPhotosToBlob(listings, { concurrency = 6, deadline = Infinity, foreign = false } = {}) {
  const backend = storageBackend();
  if (!backend) return { copied: 0, skipped: 0, failed: 0, enabled: false };
  const cfg = r2Config();
  const token = blobToken();
  const needsMove = url => backend === "r2" ? isVercelBlob(url) : !isOwnBlob(url);
  const jobs = [];
  for (const l of listings) {
    for (const p of l.photos || []) {
      if (!p.url) continue;
      if (isHosted(p.url) && !(foreign && isVercelBlob(p.url) && needsMove(p.url))) continue;
      jobs.push({ l, p });
    }
  }
  let copied = 0, failed = 0, i = 0, capped = false;
  const worker = async () => {
    while (i < jobs.length && Date.now() < deadline && !capped) {
      const { l, p } = jobs[i++];
      try {
        const src = isVercelBlob(p.url) && p.original && !isHosted(p.original) ? p.original : p.url;
        const res = await fetch(src, { headers: { "user-agent": "Mozilla/5.0 (Finds photo import)" } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const type = res.headers.get("content-type") || "image/jpeg";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const safe = s => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
        const key = `photos/${safe(l.id)}/${safe(p.id)}.${ext}`;
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length > MAX_BYTES) throw new Error("too large");
        let url;
        if (backend === "r2") {
          if (!(await reserveWrite(body.length))) { capped = true; i--; break; }
          url = await r2Put(cfg, key, body, type);
        } else {
          url = (await put(key, body, { access: "public", contentType: type, addRandomSuffix: false, allowOverwrite: true, token })).url;
        }
        p.original = p.original || p.url;
        p.url = url;
        copied++;
      } catch (e) {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { copied, skipped: jobs.length - i, failed, enabled: true, capped };
}
