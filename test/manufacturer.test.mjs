// The product-page lookup (lib/enrich/manufacturer.js) and the furniture
// seed, without a database or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readProductPage, onDomain, manufacturer, FIELDS } from "../lib/enrich/manufacturer.js";
import { getEnrichers } from "../lib/layer.js";
import "../lib/enrich/index.js";
import { snapshot } from "../seed/furniture.mjs";

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
  assert.ok(!onDomain("not a url", "hermanmiller.com"));
});

test("runs only for shortlists with a Product page metric; without a key it only clears guesses", async () => {
  assert.deepEqual(getEnrichers().map(e => e.name), ["manufacturer"]);
  const guessed = () => ({ price: 400, photos: [{ id: "a", url: "https://x/a.jpg" }], fields: { [FIELDS.page]: "https://made-up.example", Other: 1 } });

  const car = guessed();
  await manufacturer({ search: { metrics: [{ field: "Mileage" }] }, listing: car, details: {} });
  assert.equal(car.fields[FIELDS.page], "https://made-up.example", "not a things-you-buy shortlist: untouched");

  const sofa = guessed();
  await manufacturer({ search: { metrics: [{ field: FIELDS.page }] }, listing: sofa, details: { title: "Aeron" } });
  assert.deepEqual(sofa.fields, { Other: 1 });
  assert.equal(sofa.photos.length, 1);
});

test("furniture seed: Sold status, shared metrics, three sources each, retired items archived", () => {
  for (const s of snapshot.searches) {
    assert.ok(s.statuses.some(x => x.label === "Sold" && x.group === "archived"), s.id);
    assert.ok(s.metrics.some(m => m.field === FIELDS.page), s.id);
    assert.deepEqual(snapshot.sources.filter(x => x.searchIds[0] === s.id).map(x => x.name), ["Craigslist", "Facebook Marketplace", "Curated resale"]);
  }
  assert.deepEqual(snapshot.searches.filter(s => s.state === "Archived").map(s => s.id), ["standing-desk", "desk-chair"]);
  assert.equal(new Set(snapshot.sources.map(s => s.id)).size, snapshot.sources.length);
});
