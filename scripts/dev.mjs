// Local stand-in for `vercel dev`: serves public/ (run the build first) and
// routes /api/* to this layer's wrappers.
//   DATABASE_URL=postgres://user:pass@localhost/finds npm run dev
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "public");
const PORT = Number(process.env.PORT || 8000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

async function resolveApi(pathname) {
  const parts = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  for (const f of [join(ROOT, "api", ...parts) + ".js", join(ROOT, "api", ...parts.slice(0, -1), "[id].js")]) {
    try { await stat(f); return f; } catch (e) {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:" + PORT);
  try {
    if (url.pathname.startsWith("/api/")) {
      const file = await resolveApi(url.pathname);
      const mod = file && await import(pathToFileURL(file).href);
      const handler = mod && mod[req.method];
      if (!handler) { res.writeHead(file ? 405 : 404).end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let path = normalize(join(APP, decodeURIComponent(url.pathname)));
    if (!path.startsWith(APP)) { res.writeHead(403).end(); return; }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(await readFile(path));
  } catch (e) {
    if (e.code === "ENOENT") { res.writeHead(404).end("Not found"); return; }
    console.error(e);
    res.writeHead(500).end("Server error");
  }
}).listen(PORT, () => console.log(`Finds dev server on http://localhost:${PORT}`));
