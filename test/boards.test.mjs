// The Finds menu's API (api/admin/boards): create, rename, archive,
// delete finds and the items on them.
//   TEST_DATABASE_URL=postgres://shortlist:dev@localhost/shortlist_test npm test
import { skip, ADMIN } from "./env.mjs";
import { test, before } from "node:test";
import assert from "node:assert/strict";

const req = (path, init = {}) => new Request("http://localhost" + path, init);
let api, db;
const post = (body, token = ADMIN) => api.boards.POST(req("/api/admin/boards", { method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body: JSON.stringify(body) }));
const snap = async () => (await api.snapshot.GET(req("/api/snapshot"))).json();

before(async () => {
  if (skip) return;
  ({ db } = await import("../lib/db.js"));
  await db().query("drop table if exists listings, sources, searches, sync_state, geo_cache cascade");
  api = { boards: await import("../api/admin/boards.js"), importer: await import("../api/admin/import.js"), snapshot: await import("../api/snapshot.js") };
  const seed = {
    searches: [
      { id: "bed", name: "Bed frame", collection: "New York", home: "200 W 67th St", statuses: [{ label: "New", group: "review" }, { label: "Sold", group: "archived" }], metrics: [{ field: "Model", label: "Model", unit: "" }] },
      { id: "car", name: "NY Car" },
    ],
    listings: [{ id: "l1", searchIds: ["car"], title: "Volvo", status: "New" }],
    sources: [{ id: "car-cl", searchIds: ["car"], name: "Craigslist" }],
  };
  await api.importer.POST(req("/api/admin/import?photos=0", { method: "POST", headers: { authorization: "Bearer " + ADMIN }, body: JSON.stringify(seed) }));
});

test("admin only", { skip }, async () => {
  assert.equal((await post({ action: "create", name: "X" }, "")).status, 401);
  assert.equal((await post({ action: "nope" })).status, 400);
});

test("create a find with its first item; names must be unique", { skip }, async () => {
  const r = await post({ action: "create", name: " Bikes ", item: "Gravel bike" });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.equal(body.board, "c:Bikes");
  const s = (await snap()).searches.find(x => x.id === body.searchId);
  assert.equal(s.name, "Gravel bike");
  assert.equal(s.collection, "Bikes");
  assert.equal(s.state, "Active");
  assert.ok(s.statuses.length, "default statuses");
  assert.equal((await post({ action: "create", name: "Bikes" })).status, 409);
});

test("add an item: it copies the board's home, statuses and metrics; a lone search becomes a named board", { skip }, async () => {
  let body = await (await post({ action: "add-item", board: "c:New York", name: "Rug" })).json();
  const s = await snap();
  const rug = s.searches.find(x => x.id === body.searchId);
  assert.equal(rug.collection, "New York");
  assert.equal(rug.home, "200 W 67th St");
  assert.deepEqual(rug.statuses.map(x => x.label), ["New", "Sold"]);
  assert.equal(rug.metrics[0].field, "Model");

  body = await (await post({ action: "add-item", board: "s:car", name: "Bike rack" })).json();
  assert.equal(body.board, "c:NY Car");
  const after = await snap();
  assert.equal(after.searches.find(x => x.id === "car").collection, "NY Car");
});

test("rename, archive and unarchive a find and an item", { skip }, async () => {
  assert.equal((await post({ action: "rename", board: "c:NY Car", name: "Car" })).status, 200);
  assert.equal((await post({ action: "rename", board: "c:Car", name: "New York" })).status, 409, "no clash with another board");
  assert.equal((await post({ action: "archive", board: "c:Car" })).status, 200);
  let s = await snap();
  assert.ok(s.searches.filter(x => x.collection === "Car").every(x => x.state === "Archived"));
  await post({ action: "unarchive", board: "c:Car" });
  await post({ action: "rename-item", searchId: "bed", name: "King bed" });
  await post({ action: "archive-item", searchId: "bed" });
  s = await snap();
  const bed = s.searches.find(x => x.id === "bed");
  assert.equal(bed.name, "King bed");
  assert.equal(bed.state, "Archived");
  assert.ok(s.searches.filter(x => x.collection === "Car").every(x => x.state === "Active"));
});

test("delete needs the name typed; it takes items, listings and sources with it", { skip }, async () => {
  const no = await post({ action: "delete", board: "c:Car", confirm: "car" });
  assert.equal(no.status, 400);
  assert.match((await no.json()).error, /Type the find's name, "Car"/);
  assert.equal((await post({ action: "delete", board: "c:Car", confirm: "Car" })).status, 200);
  const s = await snap();
  assert.ok(!s.searches.some(x => x.collection === "Car"));
  assert.ok(!s.listings.some(l => l.id === "l1"));
  assert.ok(!s.sources.some(x => x.id === "car-cl"));
  assert.equal((await post({ action: "delete-item", searchId: "bed", confirm: "Bed frame" })).status, 400);
  assert.equal((await post({ action: "delete-item", searchId: "bed", confirm: "King bed" })).status, 200);
  assert.equal((await post({ action: "delete-item", searchId: "bed", confirm: "King bed" })).status, 404);
});
