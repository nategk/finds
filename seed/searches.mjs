// The starting board: one search per item, each with its own rubric, plus
// its sources. Budgets, sizes and the home base are placeholders marked
// [confirm]; edit them in the app (Criteria) after seeding.
// `npm run seed` imports what isn't there yet; listings are never touched.
//
// Where you are lives in PLACE, so the same items work in another city:
// change it (or add a city) and re-seed.
export const PLACE = {
  city: "New York",
  home: "Manhattan [confirm your cross streets]",
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

// Model, maker's page and new price come from the manufacturer step; pickup
// distance is estimated by Claude from the post's location.
const METRICS = [
  { field: "Model", label: "Model", unit: "", good: null, ok: null },
  { field: "% of retail", label: "Of new", unit: "%", good: 40, ok: 60 },
  { field: "Pickup (mi)", label: "Pickup", unit: "mi", good: 2, ok: 5 },
  { field: "Product page", label: "Product page", unit: "", good: null, ok: null },
];

const QUALITY = `Only high-quality pieces. Score 0-10:
- 9-10: a top-tier maker on the list below, the exact model I want, excellent condition, priced well under new.
- 7-8: top-tier maker, good condition, fair price; or a near-miss model from a top-tier maker.
- 4-6: decent maker or unknown maker with clearly solid construction (solid wood, steel, real joinery); worth a look only if cheap.
- 0-3: anything else.
Hard no (score 0): IKEA, particleboard / MDF with laminate, Amazon / Wayfair house brands, "style" knock-offs and replicas (e.g. "Aeron style", "Eames style"), visible damage that isn't easily fixed, smoke or pet odor mentioned, bedbug-risk items (used mattresses, upholstered beds from unknown homes).
Unknowns: if the maker or model can't be confirmed from the text or photos, cap at 6 and say what to ask.
Pickup: I'm at ${HOME}; I bike for small things and rent a van for big ones. Under 2 mi is easy; ${PLACE.nearby} is fine for the right piece; ${PLACE.far} only for a 9+.`;

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

const ITEMS = [
  {
    id: "desk-chair", name: "Desk chair", budget: "$200–$650 [confirm]", max: 800,
    lookingFor: "An ergonomic task chair I can sit in all day: fully adjustable, breathable, built to last 12+ years.",
    criteria: `${QUALITY}

Must have: adjustable seat height, adjustable arms, real lumbar support, tilt with tension and lock. Size must fit me [confirm: Aeron size A / B / C].
Top tier (in rough order): Herman Miller Embody, Aeron (Remastered preferred), Cosm, Mirra 2; Steelcase Leap V2, Gesture, Amia; Humanscale Freedom; Haworth Fern; Knoll Generation.
Check: mesh with no tears or sag, gas cylinder holds height, arm pads not cracked, all levers work. A chair from a corporate liquidation is fine.`,
    queries: ["aeron", "herman miller chair", "embody chair", "steelcase leap", "steelcase gesture", "humanscale freedom", "haworth fern"],
    features: [{ label: "Fully loaded", points: 2 }, { label: "Posture fit / lumbar", points: 1 }],
  },
  {
    id: "standing-desk", name: "Standing desk", budget: "$250–$700 [confirm]", max: 900,
    lookingFor: "A rock-solid electric sit-stand desk that doesn't wobble at standing height.",
    criteria: `${QUALITY}

Must have: electric, dual motor preferred, height range covering roughly 25"–50" [confirm for your height], top at least 60" x 30" [confirm], memory presets.
Top tier: Uplift V2 / V2 Commercial, Fully Jarvis, Herman Miller (Renew, Motia, Ratio), Steelcase (Migration SE, Ology), Humanscale Float, Vari Electric, Hem.
Solid wood or bamboo top beats laminate. Check: no wobble at full height, motors quiet and even, control box works, top not warped or water-damaged. Frame-only is fine if the price leaves room for a good top.`,
    queries: ["standing desk", "uplift desk", "jarvis desk", "sit stand desk", "herman miller desk", "steelcase desk"],
    features: [{ label: "Dual motor", points: 2 }, { label: "Solid wood top", points: 2 }],
  },
  {
    id: "bed-frame", name: "Bed frame", budget: "$300–$1,200 [confirm]", max: 1500,
    lookingFor: "A beautifully made bed frame that will survive a few moves: solid wood or steel, no squeak.",
    criteria: `${QUALITY}

Must have: size [confirm: Queen / Full / King], works with a mattress only (platform or slats, no box spring needed), disassembles for a walk-up.
Top tier: Floyd, Thuma, Room & Board, Design Within Reach, Medley, Hay, Muuto, Vitra, Blu Dot, Herman Miller (Nelson), Sundays, Avocado (solid wood), Copeland, Gus* Modern.
Solid hardwood or powder-coated steel. No upholstered frames from unknown homes (bedbug risk). Check: all hardware and slats included, no cracked rails, joints tight.`,
    queries: ["bed frame queen", "floyd bed", "thuma bed", "room and board bed", "walnut bed frame", "platform bed solid wood"],
    features: [{ label: "Solid hardwood", points: 2 }, { label: "All hardware included", points: 1 }],
  },
  {
    id: "sleeper-sofa", name: "Pull-out couch", budget: "$600–$2,500 [confirm]", max: 3000,
    lookingFor: "A sleeper sofa that's a good sofa first and a real bed second: no bar in the back, a proper mattress.",
    criteria: `${QUALITY}

Must have: pulls out to at least a full [confirm: Full / Queen], a real mattress (memory foam or innerspring, not a thin pad), no bar across the sleeper's back, fits up my stairs and through a [confirm]" door.
Top tier: American Leather Comfort Sleeper (the benchmark), Room & Board sleepers, Design Within Reach, Interior Define, Medley, Joybird, Blu Dot, Burrow, Article (only if like new).
Check: mechanism opens and closes smoothly, mattress included and clean, frame doesn't rack, cushions not flattened, fabric free of stains, rips and odor. Delivery or a moving help line counts for a lot: this is a van pickup, not a bike one.`,
    queries: ["sleeper sofa", "sofa bed", "pull out couch", "comfort sleeper", "american leather sleeper", "room and board sleeper"],
    features: [{ label: "No bar in back", points: 3 }, { label: "Queen mattress", points: 2 }],
  },
];

export const snapshot = {
  searches: ITEMS.map(it => ({
    id: it.id, name: it.name, lookingFor: it.lookingFor, budget: it.budget, area: `${PLACE.city}; pickup from ${HOME}`, timing: "Next 1–2 months [confirm]",
    state: "Active", criteria: it.criteria, contactTemplate: CONTACT, statuses: STATUSES, metrics: METRICS, features: FEATURES(it.features),
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
