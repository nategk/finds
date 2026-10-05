// The starting board: one search per item, each with its own rubric, plus
// its sources. Budgets, sizes and the home base are placeholders marked
// [confirm]; edit them in the app (Criteria) after seeding.
// `npm run seed` imports what isn't there yet; listings are never touched.
//
// Where you are lives in PLACE, so the same items work in another city:
// change it (or add a city) and re-seed.
export const PLACE = {
  city: "New York",
  home: "Manhattan, New York, NY",                         // set your cross streets in the app (Criteria)
  nearby: "Brooklyn / Queens / Upper Manhattan",          // fine for the right piece
  far: "NJ, Westchester, Long Island",                     // only for a 9+
  craigslist: "newyork",                                   // <area>.craigslist.org
  facebook: "nyc",                                         // facebook.com/marketplace/<city>
  zip: "10001",                                            // eBay local pickup
};
const HOME = PLACE.home;

const STATUSES = [
  { label: "New", group: "review" },
  { label: "Shortlist", group: "shortlist" },
  { label: "Messaged", group: "active" },
  { label: "Replied", group: "active" },
  { label: "Pickup set", group: "active" },
  { label: "Bought", group: "done" },
  { label: "Passed", group: "archived" },
  { label: "Sold", group: "archived" },   // set by the daily "still listed?" check
];

// The same card for every item. Model, maker's page and new price come from
// the manufacturer step; condition from scoring. Distance from home and
// directions are computed by the engine from the home location.
const METRICS = [
  { field: "Model", label: "Model", unit: "", good: null, ok: null },
  { field: "Condition", label: "Condition", unit: "", good: null, ok: null },
  { field: "% of retail", label: "Of new", unit: "%", good: 40, ok: 60 },
  { field: "Product page", label: "Product page", unit: "", good: null, ok: null },
];

const QUALITY = `Only high-quality pieces. Score 0-10:
- 9-10: a top-tier maker on the list below, the exact model I want, excellent condition, priced well under new.
- 7-8: top-tier maker, good condition, fair price; or a near-miss model from a top-tier maker.
- 4-6: decent maker or unknown maker with clearly solid construction (solid wood, steel, real joinery); worth a look only if cheap.
- 0-3: anything else.
Hard no (score 0): IKEA, particleboard / MDF with laminate, Amazon / Wayfair house brands, "style" knock-offs and replicas (e.g. "Aeron style", "Eames style"), visible damage that isn't easily fixed, smoke or pet odor mentioned, bedbug-risk items (used mattresses, upholstered beds from unknown homes).
Unknowns: if the maker or model can't be confirmed from the text or photos, cap at 6 and say what to ask.
Pickup: I'm at ${HOME} (the card shows the distance); I bike for small things and rent a van for big ones. Under 2 mi is easy; ${PLACE.nearby} is fine for the right piece; ${PLACE.far} only for a 9+.`;

const CONTACT = `Hi! Is the [item] still available? I can pick up [day/time] with cash or Venmo. Could you send a photo of [the label / the underside / any wear]? Thanks, [name]`;

const FEATURES = item => [
  { label: "Top-tier maker", points: 2 },
  { label: "Like new", points: 2 },
  { label: "Delivery available", points: 2 },
  { label: "Smoke & pet free", points: 1 },
  ...item,
];

// Saved Facebook Marketplace searches (your city, newest first, under budget). The
// Chrome routine (routines/fb-refresh.md) walks these and sends results to
// /api/intake; they're also one-tap links in the Sources panel.
const fb = (q, max) => ({ label: q, url: `https://www.facebook.com/marketplace/${PLACE.facebook}/search?query=${encodeURIComponent(q)}&maxPrice=${max}&sortBy=creation_time_descend&exact=false` });
const cl = (q, max) => ({ label: q, url: `https://${PLACE.craigslist}.craigslist.org/search/fua?query=${encodeURIComponent(q)}&max_price=${max}` });

// In priority order: the board's tabs follow it.
const ITEMS = [
  {
    id: "bed-frame", name: "Bed frame", budget: "$400–$1,500 [confirm]", max: 1800,
    lookingFor: "A minimal king bed frame in walnut or another hardwood, built to survive a few moves.",
    criteria: `${QUALITY}

Must have: King. Walnut first, or another solid hardwood (white oak, cherry, ash). Minimal: clean lines, low profile, no tufting, no sleigh or ornate headboards. Platform or slats (mattress only, no box spring). Disassembles for a walk-up.
Top tier (e.g.): Herman Miller Nelson Thin Edge, Floyd (walnut), Thuma (walnut), Room & Board (Hudson, Linear), Design Within Reach, Blu Dot Woodrow, Sun at Six, Copeland, Avocado, a good local woodworker.
Check: solid wood, not veneer over particleboard (ask or look at the edges); all rails, slats and hardware included; joints tight, no cracks; no upholstered parts from unknown homes.`,
    queries: ["king bed frame walnut", "walnut bed king", "floyd bed king", "thuma bed king", "nelson bed", "hardwood platform bed king", "room and board bed king"],
    features: [{ label: "Walnut", points: 3 }, { label: "Solid hardwood", points: 2 }, { label: "All hardware included", points: 1 }],
  },
  {
    id: "standing-desk", name: "Standing desk", budget: "$400–$1,200 [confirm]", max: 1500,
    lookingFor: "An electric sit-stand desk with a solid hardwood or marble top, steady at standing height.",
    criteria: `${QUALITY}

Must have: electric sit-stand, dual motor (needed for a heavy top), height range covering roughly 25"–50" [confirm for your height], memory presets. Top in solid hardwood (walnut, white oak, maple butcher block) or marble / stone, at least 60" x 30" [confirm]. Laminate or bamboo only as a frame-only deal.
Top tier (e.g.): Uplift V2 / V2 Commercial (solid wood tops), Fully Jarvis (hardwood), Ergonofis Sway / Shift, Herman Miller (Renew, Motia, Ratio), Steelcase (Migration SE, Ology), Humanscale Float, Vitra Tyde, Knoll, Branch, Vari Electric.
Marble or stone tops are heavy: the frame must be rated for it (ask the load rating; 250+ lb). A great frame plus a separate slab or hardwood top counts.
Check: no wobble at full height, motors quiet and even, control box and presets work, top not warped, cracked or water-stained.`,
    queries: ["standing desk walnut", "standing desk marble", "sit stand desk hardwood", "uplift desk solid wood", "jarvis desk hardwood", "ergonofis desk", "herman miller standing desk"],
    features: [{ label: "Hardwood top", points: 3 }, { label: "Marble top", points: 3 }, { label: "Dual motor", points: 2 }],
  },
  {
    id: "desk-chair", name: "Desk chair", budget: "$300–$1,500 [confirm]", max: 1800,
    lookingFor: "A design-led chair that works all day at the desk and looks right in the living room for reading or lounging.",
    criteria: `${QUALITY}

Must have: comfortable for hours at a desk (swivel, height adjustment, good support) and good-looking enough to live in the living room as a reading / lounge chair. Sculptural, design-history pieces over office-gray mesh.
Top tier (e.g.): Herman Miller Eames Soft Pad and Aluminum Group (management or executive), Herman Miller Cosm, Knoll Pollock Executive, Vitra Pacific Chair, Vitra ID Soft, Fritz Hansen Oxford, Herman Miller Sayl, Humanscale Liberty. Ergonomic workhorses (Aeron, Embody, Leap) only if unusually good-looking or cheap.
Leather or quality fabric in good shape; aluminum bases polished, not pitted. Authentic only: no replicas.
[Paste notes from your earlier chair search here to sharpen this.]
Check: gas cylinder holds height, tilt works, cushions not cracked or flattened, label on the underside.`,
    queries: ["eames soft pad", "eames aluminum group", "herman miller cosm", "knoll pollock chair", "vitra office chair", "fritz hansen oxford", "herman miller sayl"],
    features: [{ label: "Living-room worthy", points: 3 }, { label: "Leather", points: 1 }, { label: "Fully adjustable", points: 1 }],
  },
  {
    id: "sleeper-sofa", name: "Pull-out couch", budget: "$800–$3,000 [confirm]", max: 3500,
    lookingFor: "A comfortable sofa that matches the desk chair's design vibe and pulls out to a real queen bed.",
    criteria: `${QUALITY}

Must have: pulls out to a queen, a real mattress (memory foam or innerspring, not a thin pad), no bar across the sleeper's back, comfortable as an everyday sofa. Same design language as the chair: mid-century or modern, clean lines, good fabric or leather, no puffy overstuffed shapes.
Top tier (e.g.): American Leather Comfort Sleeper (the benchmark), Room & Board sleepers, Design Within Reach, Interior Define, Joybird, Blu Dot, EQ3, Burrow, Article (only if like new).
Must fit up my stairs and through a [confirm]" door. Delivery or moving help counts for a lot: this is a van pickup, not a bike one.
Check: mechanism opens and closes smoothly, mattress included and clean, frame doesn't rack, cushions not flattened, no stains, rips or odor.`,
    queries: ["queen sleeper sofa", "comfort sleeper", "american leather sleeper", "room and board sleeper", "mid century sleeper sofa", "sofa bed queen", "pull out couch queen"],
    features: [{ label: "Queen mattress", points: 3 }, { label: "No bar in back", points: 3 }],
  },
];

export const snapshot = {
  searches: ITEMS.map(it => ({
    id: it.id, name: it.name, lookingFor: it.lookingFor, budget: it.budget, area: `${PLACE.city}; pickup from ${HOME}`, timing: "Next 1–2 months [confirm]",
    state: "Active", criteria: it.criteria, contactTemplate: CONTACT, statuses: STATUSES, metrics: METRICS, features: FEATURES(it.features),
    collection: PLACE.city, home: PLACE.home,
  })),
  sources: ITEMS.flatMap(it => [
    { id: `${it.id}-craigslist`, searchIds: [it.id], name: "Craigslist", access: "Automatic (daily)", crawler: "craigslist",
      method: "Craigslist search API, furniture category", links: it.queries.slice(0, 3).map(q => cl(q, it.max)),
      config: { area: PLACE.craigslist, category: "fua", maxPrice: it.max, searches: it.queries.map(query => ({ query })) } },
    { id: `${it.id}-facebook`, searchIds: [it.id], name: "Facebook Marketplace", access: "Manual (Chrome routine / share)",
      method: "Claude in Chrome reads these saved searches and sends results to /api/intake", links: it.queries.slice(0, 4).map(q => fb(q, it.max)),
      notes: "Signed-in only; never crawled from the server. See routines/fb-refresh.md." },
    { id: `${it.id}-shops`, searchIds: [it.id], name: "Curated resale", access: "Manual (links)",
      method: "Saved searches; crawlers to come", links: [
        { label: "Chairish", url: `https://www.chairish.com/search?q=${encodeURIComponent(it.queries[0])}` },
        { label: "AptDeco", url: `https://www.aptdeco.com/search?q=${encodeURIComponent(it.queries[0])}` },
        { label: "Kaiyo", url: `https://www.kaiyo.com/search?q=${encodeURIComponent(it.queries[0])}` },
        { label: "eBay local", url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(it.queries[0])}&LH_PrefLoc=99&_stpos=${PLACE.zip}&_sadis=25&LH_LPickup=1` },
      ] },
  ]),
};
