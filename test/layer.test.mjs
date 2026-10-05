// The layer's own pieces, without a database or network: the manufacturer
// step's page reading and domain guard, the API wrappers, the build, and
// the seed's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readProductPage, onDomain, manufacturer, FIELDS } from "../enrich/manufacturer.js";
import { snapshot } from "../seed/searches.mjs";

delete process.env.ANTHROPIC_API_KEY;

test("product page: structured data first, then og:image; http upgraded", () => {
  const ld = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"Product","image":["/img/aeron.jpg"],"offers":{"price":"1895.00"}}]}</script>
    <meta property="og:image" content="https://cdn.example/og.jpg">`;
  assert.deepEqual(readProductPage(ld, "https://www.hermanmiller.com/aeron/"), { image: "https://www.hermanmiller.com/img/aeron.jpg", price: 1895 });
  assert.deepEqual(readProductPage(`<meta property="og:image" content="http://floydhome.com/a.png?v=1&amp;w=2">`, "https://floydhome.com/p"),
    { image: "https://floydhome.com/a.png?v=1&w=2", price: null });
  assert.deepEqual(readProductPage(`<script type="application/ld+json">not json</script>`, "https://x.com/"), { image: "", price: null });
});

test("only the maker's own domain counts", () => {
  assert.ok(onDomain("https://www.hermanmiller.com/products/aeron", "hermanmiller.com"));
  assert.ok(onDomain("https://store.steelcase.com/leap", "www.steelcase.com"));
  assert.ok(!onDomain("https://evil-hermanmiller.com/x", "hermanmiller.com"));
  assert.ok(!onDomain("https://www.chairish.com/product/1", "chairish.com"), "resellers are never the maker");
  assert.ok(!onDomain("https://www.amazon.com/dp/1", "amazon.com"));
  assert.ok(!onDomain("not a url", "hermanmiller.com"));
});

test("without an API key the step only clears fields scoring may have guessed", async () => {
  const listing = { price: 400, photos: [{ id: "a", url: "https://x/a.jpg" }], fields: { [FIELDS.page]: "https://made-up.example", [FIELDS.model]: "Guess", Other: 1 } };
  await manufacturer({ listing, details: { title: "Aeron" } });
  assert.deepEqual(listing.fields, { Other: 1 });
  assert.equal(listing.photos.length, 1);
});

test("every engine endpoint has a wrapper that loads the layer", async () => {
  const engine = [];
  (function walk(dir, pre = "") {
    for (const f of readdirSync(dir, { withFileTypes: true })) f.isDirectory() ? walk(dir + "/" + f.name, pre + f.name + "/") : engine.push(pre + f.name);
  })(new URL("../vendor/shortlist/api", import.meta.url).pathname);
  for (const f of engine) {
    const src = readFileSync(new URL("../api/" + f, import.meta.url), "utf8");
    assert.match(src, /layer\.js"/, f);
    assert.match(src, new RegExp(`vendor/shortlist/api/${f.replace(/[[\]]/g, "\\$&")}"`), f);
  }
  const crawl = await import("../api/crawl.js");
  assert.equal(typeof crawl.POST, "function");
  assert.equal(typeof crawl.GET, "function");
  const { getEnrichers } = await import("../vendor/shortlist/lib/layer.js");
  assert.deepEqual(getEnrichers().map(e => e.name), ["manufacturer"]);
});

test("build brands the engine's app", () => {
  execFileSync(process.execPath, [new URL("../scripts/build.mjs", import.meta.url).pathname]);
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Finds<\/title>/);
  assert.match(html, /<span class="brand">Finds<\/span>/);
  assert.match(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), /"finds-shell-v\d+"/);
  assert.equal(JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")).name, "Finds");
});

test("seed: every search has a Sold status, the shared metrics and its three sources", () => {
  assert.deepEqual(snapshot.searches.map(s => s.id), ["bed-frame", "standing-desk", "desk-chair", "sleeper-sofa"], "priority order");
  for (const s of snapshot.searches) {
    assert.ok(s.statuses.some(x => x.label === "Sold" && x.group === "archived"), s.id);
    assert.deepEqual(s.metrics.map(m => m.field), ["Model", "Condition", "% of retail", "Product page"]);
    assert.equal(s.collection, "New York");
    assert.ok(s.home && !/\[/.test(s.home), "a home the geocoder can read");
    const src = snapshot.sources.filter(x => x.searchIds[0] === s.id);
    assert.deepEqual(src.map(x => x.name), ["Craigslist", "Facebook Marketplace", "Curated resale"]);
    assert.equal(src[0].crawler, "craigslist");
    assert.equal(src[0].config.category, "fua");
  }
  assert.equal(new Set(snapshot.sources.map(s => s.id)).size, snapshot.sources.length);
});
