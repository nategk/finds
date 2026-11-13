// Managing finds (boards) and the items (searches) on them, from the
// app's Finds menu. Admin-only (api/admin/boards). A board is the
// searches sharing a collection (app/js/model.js boards()).
//   create      { name, item }             a new board with its first item
//   rename      { board, name }            renames the board (its collection)
//   archive / unarchive { board }          every item on it
//   delete      { board, confirm }         the board, its items, listings and sources;
//                                          confirm must repeat the board's name
//   add-item    { board, name }            a new item on a board
//   rename-item { searchId, name }
//   archive-item / unarchive-item { searchId }
//   delete-item { searchId, confirm }      confirm repeats the item's name
import * as pg from "./postgres.js";
import { DEFAULT_STATUSES } from "../app/js/model.js";

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const clean = (v, what) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!s) throw bad(`Give the ${what} a name.`);
  return s;
};
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

// A new search on a board, copying the board's home, statuses and card
// metrics from `like` (another item on it) when there is one.
async function newItem(collection, name, like) {
  const base = slug(collection) + "-" + slug(name);
  for (let n = 1; n <= 50; n++) {
    const id = n === 1 ? base : base + "-" + n;
    const made = await pg.createSearch({ id, name, collection,
      home: like?.home || "", homeGeo: like?.home_geo || null,
      statuses: like?.statuses?.length ? like.statuses : DEFAULT_STATUSES, metrics: like?.metrics || [] });
    if (made) return id;
  }
  throw bad("Couldn't name the new item.", 500);
}

async function board(key) {
  const searches = await pg.boardSearches(key);
  if (!searches.length) throw bad("No such find.", 404);
  return { searches, name: searches[0].collection || searches[0].name };
}

export async function manage(body) {
  const a = body.action;
  if (a === "create") {
    const name = clean(body.name, "find"), item = clean(body.item || body.name, "first item");
    if ((await pg.boardSearches("c:" + name)).length) throw bad(`There's already a find called "${name}".`, 409);
    const id = await newItem(name, item);
    return { board: "c:" + name, searchId: id, changed: [id] };
  }
  if (a === "rename") {
    const b = await board(body.board), name = clean(body.name, "find");
    if (name !== b.name && (await pg.boardSearches("c:" + name)).length) throw bad(`There's already a find called "${name}".`, 409);
    return { board: "c:" + name, changed: await pg.renameBoard(body.board, name) };
  }
  if (a === "archive" || a === "unarchive") {
    await board(body.board);
    return { board: body.board, changed: await pg.setBoardState(body.board, a === "archive" ? "Archived" : "Active") };
  }
  if (a === "delete") {
    const b = await board(body.board);
    if (String(body.confirm || "").trim() !== b.name) throw bad(`Type the find's name, "${b.name}", to delete it.`);
    return { deleted: await pg.deleteBoard(body.board), changed: [] };
  }
  if (a === "add-item") {
    const b = await board(body.board), name = clean(body.name, "item");
    // A lone search (no collection) becomes a named board first.
    if (!b.searches[0].collection) await pg.renameBoard(body.board, b.name);
    const id = await newItem(b.name, name, b.searches[0]);
    return { board: "c:" + b.name, searchId: id, changed: [id, ...b.searches.map(s => s.id)] };
  }
  if (a === "rename-item" || a === "archive-item" || a === "unarchive-item") {
    const id = String(body.searchId || "");
    const patch = a === "rename-item" ? { name: clean(body.name, "item") } : { state: a === "archive-item" ? "Archived" : "Active" };
    if (!(await pg.updateSearchMeta(id, patch))) throw bad("No such item.", 404);
    return { searchId: id, changed: [id] };
  }
  if (a === "delete-item") {
    const id = String(body.searchId || "");
    const row = await pg.searchById(id);
    if (!row) throw bad("No such item.", 404);
    if (String(body.confirm || "").trim() !== row.name) throw bad(`Type the item's name, "${row.name}", to delete it.`);
    await pg.deleteSearch(id);
    return { deleted: [id], changed: [] };
  }
  throw bad("Unknown action.");
}
