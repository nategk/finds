// The Facebook Marketplace extension's page reader (extension/extract.js),
// run against saved pages in test/fixtures. No database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const code = await readFile(new URL("../extension/extract.js", import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
// Results come back from the vm context as that context's arrays and
// objects; copy them into this realm so deepEqual compares contents only.
const plain = v => v == null ? v : JSON.parse(JSON.stringify(v));
const FB = {
  extractResults: (...a) => plain(ctx.ShortlistFB.extractResults(...a)),
  extractItem: (...a) => plain(ctx.ShortlistFB.extractItem(...a)),
  kind: href => ctx.ShortlistFB.kind(href),
};
const page = async name => parseHTML(await readFile(new URL("./fixtures/" + name, import.meta.url), "utf8")).document;

test("results page: one card per listing, with price, title, place and miles", async () => {
  const cards = FB.extractResults(await page("fb-results.html"));
  assert.deepEqual(cards.map(c => c.key), ["fb-1234567890123456", "fb-9876543210987654", "fb-5555555555555555"]);
  const [mini, free, element] = cards;
  assert.equal(mini.url, "https://www.facebook.com/marketplace/item/1234567890123456/");
  assert.equal(mini.price, "$4,995", "the current price, not the struck-out one");
  assert.equal(mini.title, "2009 MINI cooper S hatchback 2D · 112K miles");
  assert.equal(mini.location, "Nyack, NY");
  assert.equal(mini.mileage, "112K miles");
  assert.match(mini.image, /scontent/);
  assert.equal(free.price, "Free");
  assert.equal(free.title, "Ford Ranger parts");
  assert.equal(element.location, "Brooklyn, NY");
});

test("listing page with embedded JSON: text, details, location pin and photos", async () => {
  const href = "https://www.facebook.com/marketplace/item/1111222233334444/?ref=browse_tab";
  const item = FB.extractItem(await page("fb-item-json.html"), href);
  assert.equal(item.key, "fb-1111222233334444");
  assert.equal(item.url, "https://www.facebook.com/marketplace/item/1111222233334444/");
  assert.equal(item.title, "2005 Volvo V50 T5 · blue wagon");
  assert.equal(item.price, "$3,300");
  assert.equal(item.location, "New City, NY");
  assert.match(item.description, /^California car, no rust\.\nNew front brakes\./);
  assert.match(item.description, /Details: Driven 136,000 miles · Exterior color: blue · Interior color: tan · automatic transmission/);
  assert.deepEqual(item.photos.map(p => p.url), [
    "https://scontent-lga3-1.xx.fbcdn.net/v/t45/v50-1.jpg?stp=1&_nc_ht=x",
    "https://scontent-lga3-1.xx.fbcdn.net/v/t45/v50-2.jpg",
  ]);
  assert.equal(item.photos[0].id, "fb-1111222233334444-0");
  assert.equal(item.raw.lat, 41.1476);
  assert.equal(item.raw.lon, -73.9893);
});

test("listing page without JSON falls back to what the page shows", async () => {
  const item = FB.extractItem(await page("fb-item-text.html"), "https://www.facebook.com/marketplace/item/7777888899990000/");
  assert.equal(item.title, "2010 Honda Element EX AWD");
  assert.equal(item.price, "$8,300");
  assert.equal(item.location, "Chicago, IL");
  assert.equal(item.description,
    "Drives great. No dash lights. Trailer hitch.\n\nDetails: Driven 89,000 miles · Automatic transmission · Exterior color: Orange · Interior color: Gray · Clean title");
  assert.deepEqual(item.photos.map(p => p.url), ["https://scontent.xx.fbcdn.net/e1.jpg", "https://scontent.xx.fbcdn.net/e2.jpg"],
    "product photos only: not the viewer's or the seller's profile picture");
  assert.equal(item.raw.lat, undefined);
});

test("only Marketplace pages count", () => {
  assert.equal(FB.kind("https://www.facebook.com/marketplace/item/123/"), "item");
  assert.equal(FB.kind("https://www.facebook.com/marketplace/nyc/search?query=volvo"), "results");
  assert.equal(FB.kind("https://www.facebook.com/groups/123"), "");
  assert.equal(FB.kind("https://example.com/marketplace/item/123/"), "");
  assert.equal(FB.extractItem(parseHTML("<html><body></body></html>").document, "https://www.facebook.com/"), null);
});
