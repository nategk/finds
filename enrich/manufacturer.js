// Manufacturer step (an engine enricher, lib/layer.js). For each new listing:
//   1. Claude identifies the maker and exact model from the post and its
//      photos, searching the web for the maker's own product page.
//   2. That page is fetched here; its product image (structured data first,
//      then og:image) and new price are read.
//   3. The official image is added as the listing's LAST photo, labeled
//      "Official"; the card gets Product page, Model, Retail (new) and
//      % of retail.
// Only an exact match on the maker's own domain gets a link and image.
// Anything less shows as "Likely: Steelcase Leap V2?" with no link, so a
// wrong product is never presented as confirmed.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";

const MODEL = "claude-opus-5-5";
const UA = { "user-agent": "Mozilla/5.0 (compatible; Finds product lookup)" };

// Fields this step owns. Scoring may have guessed values for them; they're
// cleared first so only a verified match fills them.
export const FIELDS = { page: "Product page", model: "Model", retail: "Retail (new)", ratio: "% of retail" };

// Never the maker: marketplaces, resellers and big-box retailers.
const NOT_MAKERS = /(^|\.)(amazon|ebay|etsy|wayfair|overstock|chairish|1stdibs|aptdeco|kaiyo|craigslist|facebook|offerup|pamono|viyet|lovesac|target|walmart|homedepot|lowes|costco|bedbathandbeyond|google|pinterest|instagram|reddit|youtube|houzz|mercari|poshmark)\.[a-z.]+$/i;

const Match = z.object({
  brand: z.string(),
  model: z.string(),
  confidence: z.enum(["exact", "likely", "unknown"]),
  makerDomain: z.string(),
  productUrl: z.string(),
  imageUrl: z.string(),
  retailPrice: z.number().nullable(),
  reason: z.string(),
});

let client = null;
const claude = () => (client ||= new Anthropic());

const SYSTEM = `You identify second-hand goods (furniture, bikes, gear, tools…): the maker and the exact model, and the maker's own product page for it.
Rules:
- Use the post's text, its attributes (make, model, size, dimensions) and the photos (labels, badges, serial plates, hardware, mechanisms, stitching).
- Search the web to find the product on the maker's own website. Never return a marketplace, reseller, retailer or review site as the product page.
- confidence "exact" only when you are sure of the maker AND the model (and the variant where it changes the product, e.g. Aeron vs Aeron Remastered) AND you found its page on the maker's own site. "likely" when you have a good guess. "unknown" otherwise.
- productUrl: the maker's page for that model (empty unless exact). makerDomain: the maker's registrable domain, e.g. hermanmiller.com.
- imageUrl: the main product image on that page, if you saw one (else empty).
- retailPrice: the maker's current new price in USD for the base configuration, if shown; else null.
- reason: one line on how you know.`;

function photoBlocks(listing) {
  return (listing.photos || []).filter(p => /^https:\/\//.test(p.url || "")).slice(0, 3)
    .map(p => ({ type: "image", source: { type: "url", url: p.url } }));
}

async function identify(listing, details, images) {
  const text = `Listing:\nTitle: ${details.title || listing.title}\nPrice: ${listing.price ?? "unknown"}\nAttributes: ${JSON.stringify(details.raw?.attributes || [])}\n\nDescription:\n${String(details.description || "").slice(0, 6000)}`;
  const messages = [{ role: "user", content: [...images, { type: "text", text }] }];
  for (let turn = 0; turn < 4; turn++) {
    const response = await claude().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 5 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ],
      messages,
      output_config: { format: zodOutputFormat(Match) },
    }, { timeout: 120_000, maxRetries: 1 });
    if (response.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: response.content }); continue; }
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output || null;
  }
  return null;
}

const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ""; } };
export const onDomain = (url, domain) => {
  const h = host(url), d = String(domain || "").toLowerCase().replace(/^www\./, "");
  return !!h && !!d && !NOT_MAKERS.test(h) && (h === d || h.endsWith("." + d));
};

// The product image and price from a product page: schema.org Product data
// first, then Open Graph.
export function readProductPage(html, pageUrl) {
  const abs = u => { try { return new URL(String(u).replace(/&amp;/g, "&"), pageUrl).href.replace(/^http:\/\//, "https://"); } catch (e) { return ""; } };
  let image = "", price = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const nodes = [data].flat().flatMap(n => (n && n["@graph"] ? n["@graph"] : [n]));
    for (const n of nodes) {
      const type = [n?.["@type"]].flat().map(String);
      if (!type.includes("Product") && !type.includes("ProductGroup")) continue;
      const img = [n.image].flat()[0];
      if (!image && img) image = abs(typeof img === "object" ? img.url || img.contentUrl : img);
      const offer = [n.offers].flat()[0];
      const p = Number(offer?.price ?? offer?.lowPrice);
      if (price === null && Number.isFinite(p) && p > 0) price = p;
    }
  }
  if (!image) {
    const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (og) image = abs(og[1]);
  }
  return { image, price };
}

async function imageWorks(url) {
  if (!/^https:\/\//.test(url || "")) return false;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
    return res.ok && /^image\//.test(res.headers.get("content-type") || "");
  } catch (e) {
    return false;
  }
}

export async function manufacturer({ listing, details }) {
  for (const f of Object.values(FIELDS)) delete listing.fields[f];
  if (!process.env.ANTHROPIC_API_KEY) return;
  const m = await identify(listing, details, photoBlocks(listing));
  if (!m || m.confidence === "unknown" || !m.brand) return;
  const name = [m.brand, m.model].filter(Boolean).join(" ");
  if (m.confidence !== "exact" || !onDomain(m.productUrl, m.makerDomain)) {
    listing.fields[FIELDS.model] = `Likely: ${name}?`;
    return;
  }

  let page = { image: "", price: null };
  try {
    const res = await fetch(m.productUrl, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (res.ok && onDomain(res.url, m.makerDomain)) page = readProductPage(await res.text(), res.url);
  } catch (e) {}

  listing.fields[FIELDS.model] = name;
  listing.fields[FIELDS.page] = m.productUrl;
  const retail = page.price ?? m.retailPrice;
  if (retail) {
    listing.fields[FIELDS.retail] = retail;
    if (listing.price > 0) listing.fields[FIELDS.ratio] = Math.round((listing.price / retail) * 100);
  }
  const image = (await imageWorks(page.image)) ? page.image : (await imageWorks(m.imageUrl)) ? m.imageUrl : "";
  if (image) {
    const id = "official-" + createHash("sha1").update(image).digest("hex").slice(0, 12);
    listing.photos = [...(listing.photos || []).filter(p => p.label !== "Official"), { id, url: image, label: "Official" }];
  }
}
