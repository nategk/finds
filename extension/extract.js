// Reads Facebook Marketplace pages that are open in your own browser.
// Injected into the tab by background.js; also loaded by
// test/fb-extract.test.mjs against saved fixtures.
//
//   ShortlistFB.extractResults(document, href) -> [{ key, url, title, price, location, mileage, image }]
//     the listing cards a results or search page has loaded so far.
//   ShortlistFB.extractItem(document, href)    -> { key, url, title, price, location, description, photos, raw }
//     one listing page, in the shape POST /api/intake {step: "add"} takes.
//
// Facebook's markup is generated and changes often, so nothing here relies
// on class names. Item pages carry the listing as JSON inside <script> tags
// (title, description, price, location, photos, vehicle details); those are
// read first, and the visible text is the fallback.
(function (root) {
  const ITEM_RE = /\/marketplace\/item\/(\d+)/;
  const PRICE_RE = /^(?:Free|(?:[A-Z]{1,3})?[$£€]\s?\d[\d,.]*[kK]?)$/;
  const MILES_RE = /^\d[\d,.]*\s*[kK]?\s*(?:mi|miles|km)$/i;
  const clean = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const itemUrl = id => `https://www.facebook.com/marketplace/item/${id}/`;

  // Text of every leaf element under el, in order: one entry per visible
  // span or div with no element children. Same result in a browser and in a
  // DOM without layout (tests), unlike innerText.
  function leafLines(el) {
    const out = [];
    for (const n of el.querySelectorAll("span, div, h1, h2, h3, p, abbr")) {
      if (n.children.length) continue;
      const t = clean(n.textContent);
      if (t && t !== out[out.length - 1]) out.push(t);
    }
    return out;
  }

  function extractResults(doc) {
    const out = [], seen = new Set();
    for (const a of doc.querySelectorAll('a[href*="/marketplace/item/"]')) {
      const m = (a.getAttribute("href") || "").match(ITEM_RE);
      if (!m || seen.has(m[1])) continue;
      const lines = leafLines(a);
      if (!lines.length) continue;
      seen.add(m[1]);
      const price = lines.find(l => PRICE_RE.test(l)) || "";
      const mileage = lines.find(l => MILES_RE.test(l)) || "";
      const rest = lines.filter(l => !PRICE_RE.test(l) && l !== mileage);
      const img = a.querySelector("img");
      out.push({
        key: "fb-" + m[1], url: itemUrl(m[1]),
        title: rest[0] ? rest[0] + (mileage ? " · " + mileage : "") : "",
        price, location: rest[1] || "", mileage,
        image: img ? img.getAttribute("src") || "" : "",
      });
    }
    return out;
  }

  // ---- item pages: embedded JSON ---------------------------------------
  const unjson = s => { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } };
  const STR = '"((?:[^"\\\\]|\\\\.)*)"';
  function jsonString(src, key) {
    const m = src.match(new RegExp('"' + key + '":' + STR));
    return m ? clean(unjson(m[1])) : "";
  }
  function jsonText(src, key) {
    const m = src.match(new RegExp('"' + key + '":\\{"text":' + STR));
    return m ? unjson(m[1]).trim() : "";
  }
  function fromScripts(doc) {
    const src = [...doc.querySelectorAll("script")].map(s => s.textContent || "").filter(t => t.includes("marketplace")).join("\n");
    if (!src) return {};
    const out = {
      title: jsonString(src, "marketplace_listing_title"),
      description: jsonText(src, "redacted_description"),
      price: jsonText(src, "formatted_price"),
      location: jsonText(src, "location_text"),
    };
    const loc = src.match(/"location":\{"latitude":(-?\d+(?:\.\d+)?),"longitude":(-?\d+(?:\.\d+)?)/);
    if (loc) { out.lat = Number(loc[1]); out.lon = Number(loc[2]); }
    const odo = src.match(/"vehicle_odometer_data":\{"unit":"(\w+)","value":(\d+)/);
    if (odo) out.odometer = `${Number(odo[2]).toLocaleString("en-US")} ${odo[1].toLowerCase()}`;
    const vehicle = {};
    for (const m of src.matchAll(/"vehicle_([a-z_]+)":"([^"\\]{1,60})"/g)) vehicle[m[1]] = clean(m[2]).toLowerCase();
    if (Object.keys(vehicle).length) out.vehicle = vehicle;
    const at = src.indexOf('"listing_photos"');
    if (at >= 0) {
      const chunk = src.slice(at, at + 40000);
      out.photos = [...new Set([...chunk.matchAll(/"uri":"(https:[^"]+)"/g)].map(m => unjson(m[1])))];
    }
    return out;
  }

  // ---- item pages: visible text ----------------------------------------
  const DETAIL_RE = /^(Driven [\d,]+ (?:miles|km)|(?:Automatic|Manual) transmission|(?:Exterior|Interior) colou?r: .+|Fuel type: .+|.*\bsafety rating\b.*|Clean title|.*\btitle\b.*|\d+ owners?|Paid off|No significant damage|.*\bmpg\b.*)$/i;
  const STOP_RE = /^(Seller information|Seller details|Location is approximate|Today's picks|Sponsored|Send seller a message|Message|Similar items|Related listings)$/i;
  function fromText(doc) {
    const main = doc.querySelector('[role="main"]') || doc.body;
    const lines = leafLines(main).filter(l => !/^See (more|less)$/i.test(l));
    const h1 = main.querySelector("h1");
    const og = doc.querySelector('meta[property="og:title"]');
    let title = h1 ? clean(h1.textContent) : og ? clean(og.getAttribute("content")) : "";
    if (!title) title = clean(doc.title).replace(/^Marketplace\s*[-–]\s*/i, "").replace(/\s*\|\s*Facebook$/i, "");
    const ti = lines.indexOf(title);
    const price = lines.slice(ti >= 0 ? ti + 1 : 0).find(l => PRICE_RE.test(l)) || "";
    const listed = lines.map(l => l.match(/^Listed .*?\bin (.+)$/i)).find(Boolean);
    const about = lines.findIndex(l => /^About this vehicle$/i.test(l));
    const descAt = lines.findIndex(l => /^(Seller's description|Description)$/i.test(l));
    const details = lines.slice(about >= 0 ? about + 1 : 0, descAt >= 0 ? descAt : undefined).filter(l => DETAIL_RE.test(l));
    let description = "";
    if (descAt >= 0) {
      const body = [];
      for (const l of lines.slice(descAt + 1)) { if (STOP_RE.test(l)) break; body.push(l); }
      description = body.join("\n");
    }
    if (!description) {
      const ogd = doc.querySelector('meta[property="og:description"]');
      description = ogd ? clean(ogd.getAttribute("content")) : "";
    }
    const photos = [];
    for (const img of main.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      const alt = img.getAttribute("alt") || "";
      if (!/scontent|fbcdn/.test(src)) continue;
      if (/profile|avatar/i.test(alt)) continue;
      if (/^Product photo/i.test(alt) || Number(img.getAttribute("width") || img.naturalWidth || 0) >= 300) photos.push(src);
    }
    return { title, price, location: listed ? clean(listed[1]) : "", description, details, photos: [...new Set(photos)] };
  }

  function extractItem(doc, href) {
    const m = String(href || "").match(ITEM_RE) ||
      String((doc.querySelector('link[rel="canonical"]') || { getAttribute: () => "" }).getAttribute("href")).match(ITEM_RE);
    if (!m) return null;
    const j = fromScripts(doc), t = fromText(doc);
    const details = [...t.details];
    const v = j.vehicle || {};
    if (j.odometer && !details.some(d => /^Driven/i.test(d))) details.unshift("Driven " + j.odometer);
    if (v.exterior_color && !details.some(d => /^Exterior/i.test(d))) details.push("Exterior color: " + v.exterior_color);
    if (v.interior_color && !details.some(d => /^Interior/i.test(d))) details.push("Interior color: " + v.interior_color);
    if (v.transmission_type && !details.some(d => /transmission/i.test(d))) details.push(v.transmission_type + " transmission");
    const description = [j.description || t.description, details.length ? "Details: " + details.join(" · ") : ""].filter(Boolean).join("\n\n");
    const photos = (j.photos && j.photos.length ? j.photos : t.photos).slice(0, 40)
      .map((url, i) => ({ id: `fb-${m[1]}-${i}`, url }));
    const raw = { attributes: details };
    if (Number.isFinite(j.lat) && Number.isFinite(j.lon)) Object.assign(raw, { lat: j.lat, lon: j.lon, mapAccuracy: 50 });
    return {
      key: "fb-" + m[1], url: itemUrl(m[1]),
      title: j.title || t.title, price: j.price || t.price,
      location: j.location || t.location, description, photos, raw,
    };
  }

  const kind = href => !/^https:\/\/(www\.|web\.)?facebook\.com\/marketplace/.test(String(href || "")) ? ""
    : ITEM_RE.test(String(href)) ? "item" : "results";

  root.ShortlistFB = { extractResults, extractItem, kind, leafLines };
})(typeof globalThis !== "undefined" ? globalThis : this);
