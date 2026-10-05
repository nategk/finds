// Pins the engine: copies app/, api/, lib/ and scripts/remote.mjs from a
// Shortlist ref into vendor/shortlist (never edited by hand), records the
// commit in vendor/ENGINE.json and regenerates the api/ wrappers.
//   npm run engine -- main            # or a tag / branch / commit
//   npm run engine -- main ../shortlist   # from a local checkout instead of GitHub
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = "https://github.com/nategk/shortlist";
const [ref = "main", local] = process.argv.slice(2);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let src = local, tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), "shortlist-"));
  git(tmp, "clone", "--quiet", "--depth", "1", "--branch", ref, REPO, "engine");
  src = join(tmp, "engine");
}
const commit = git(src, "rev-parse", "HEAD");
const dest = join(ROOT, "vendor", "shortlist");
rmSync(dest, { recursive: true, force: true });
for (const dir of ["app", "api", "lib"]) cpSync(join(src, dir), join(dest, dir), { recursive: true });
mkdirSync(join(dest, "scripts"), { recursive: true });
cpSync(join(src, "scripts", "remote.mjs"), join(dest, "scripts", "remote.mjs"));
cpSync(join(src, "package.json"), join(dest, "package.json"));
writeFileSync(join(ROOT, "vendor", "ENGINE.json"), JSON.stringify({ repo: REPO, ref, commit }, null, 1) + "\n");
if (tmp) rmSync(tmp, { recursive: true, force: true });
execFileSync(process.execPath, [join(ROOT, "scripts", "wrap-api.mjs")], { stdio: "inherit" });
console.log(`Engine pinned to ${ref} @ ${commit.slice(0, 12)}. Check vendor/shortlist/package.json for new dependencies.`);
if (!existsSync(join(dest, "lib", "layer.js"))) console.warn("Warning: this engine has no lib/layer.js; the layer's crawlers and enrichers won't load.");
