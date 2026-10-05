// Static app for Vercel: the engine's app/ copied to public/, with this
// layer's name, manifest and icon laid over it. No bundling.
import { rmSync, cpSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public");
const NAME = "Finds";

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, "vendor", "shortlist", "app"), OUT, { recursive: true });
for (const f of readdirSync(join(ROOT, "overrides"))) cpSync(join(ROOT, "overrides", f), join(OUT, f), { recursive: true });

const index = join(OUT, "index.html");
let html = readFileSync(index, "utf8");
const swap = (from, to) => { if (!html.includes(from)) throw new Error(`build: engine index.html no longer has ${from}`); html = html.replace(from, to); };
swap("<title>Shortlist</title>", `<title>${NAME}</title>\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon-180.png">`);
swap('<span class="brand">Shortlist</span>', `<span class="brand">${NAME}</span>`);
writeFileSync(index, html);

// Installed copies keep their own cache, apart from any other Shortlist on the device.
const sw = join(OUT, "sw.js");
writeFileSync(sw, readFileSync(sw, "utf8").replace(/shortlist-shell-/g, "finds-shell-").replace(/shortlist-photos-/g, "finds-photos-"));
console.log(`Built ${NAME} into public/`);
