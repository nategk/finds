// The starting board: one search per item, each with its own rubric, plus
// its sources. Budgets, sizes and the home base are placeholders marked
// [confirm]; edit them in the app (Criteria) after seeding.
// `npm run seed` imports what isn't there yet; listings are never touched.
//
// Where you are lives in PLACE, so the same items work in another city:
// change it (or add a city) and re-seed.
export const PLACE = {
  city: "New York",
  home: "200 W 67th St, New York, NY 10023",               // Aire (Lincoln Square); change it in the app (Criteria)
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
// Same search, any seller in the US who ships (Marketplace's "Shipping" delivery filter).
const fbShip = (q, max) => ({ label: `${q} (ships, US)`, url: `https://www.facebook.com/marketplace/${PLACE.facebook}/search?query=${encodeURIComponent(q)}&maxPrice=${max}&deliveryMethod=shipping&sortBy=creation_time_descend&exact=false` });
const cl = (q, max, cat = "fua") => ({ label: q, url: `https://${PLACE.craigslist}.craigslist.org/search/${cat}?query=${encodeURIComponent(q)}&max_price=${max}` });

// For an item's `wide` queries (a specific piece worth shipping or a long
// drive), Craigslist is searched around these metros, 250 mi each.
const HUBS = ["10023", "02108", "19103", "20001", "05401", "30303", "60601", "75201", "80202", "90012", "94103", "98101"];

// In priority order: the board's tabs follow it.
const ITEMS = [
  {
    id: "bed-frame", name: "King bed frame", budget: "$400–$2,000 [confirm]", max: 2500,
    lookingFor: "The Roseland Bed in king (solid cherry or black walnut), used; otherwise a king in solid hardwood with a headboard and the same quiet Shaker lines.",
    criteria: `${QUALITY}

The one I want: the Roseland Bed (roselandusa.com/products/the-bed), king. Shaker-dormitory design from a small Hudson Valley maker: solid American cherry or black walnut, single-stave square posts and rails, a 3/4" headboard of three wide boards set in slotted posts, Häfele steel corner brackets, linseed-oil finish, optional machined steel casters. New, king: $1,950 cherry, $2,950 walnut (+$100 casters), ships free in the lower 48. Their Pediment Bed is the sibling: a near miss.
Scoring:
- 10: a Roseland Bed, king (or Cal King), any finish, under ~75% of new. Worth shipping or a long drive from anywhere in the US.
- 9: a Roseland Bed in queen, or a Roseland Pediment Bed in king.
- 8: a king Shaker-style bed in solid cherry or walnut from a serious maker (Thos. Moser, Copeland, Shaker Workshops, Chilton, a named local woodworker): square posts, plain board headboard, no carving.
- 6-7: any other king in solid hardwood with a headboard and clean lines.
- Lower: no headboard, veneer, steel, sleigh / carved / tufted.
Must have (except a Roseland, where size is negotiable): King. Platform or slats (mattress only, no box spring); disassembles for a walk-up.
Check: solid wood, not veneer over particleboard (ask or look at the edges); all rails, slats and brackets included; joints tight, no cracks.`,
    queries: ["king bed frame", "cherry king bed", "walnut king bed"],
    wide: ["roseland bed", "shaker bed"],
    features: [{ label: "Roseland", points: 5 }, { label: "Headboard", points: 3 }, { label: "Solid hardwood", points: 3 }, { label: "Walnut", points: 1 }, { label: "All hardware included", points: 1 }],
  },
  {
    id: "standing-desk", name: "Standing desk", state: "Archived",   // retired: no tab, no crawl budget: "$400–$1,200 [confirm]", max: 1500,
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
    id: "desk-chair", name: "Desk chair", state: "Archived",   // retired: no tab, no crawl budget: "$300–$1,500 [confirm]", max: 1800,
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
    id: "sleeper-sofa", name: "Sleeper sofa", budget: "$800–$3,000 [confirm]", max: 3500,
    lookingFor: "A deep, sink-in queen sleeper from a designer or quality maker that opens to one continuous real mattress, ideally a no-bar platform; the dream is tobacco / camel / cognac soft leather.",
    criteria: `${QUALITY}

Looking for: a deep, sink-in queen sleeper from a designer or quality maker that opens to ONE continuous real mattress, ideally a no-bar platform mechanism (American Leather Comfort Sleeper / Tiffany 24/7: RH Maxwell or Lancaster, American Leather Rogue, Room & Board Berin Day & Night). The dream is soft leather in tobacco, camel or cognac; references: Article Timber in Charme Tan, Poly & Bark Girona in cognac.
Hard rules (score 0 if broken):
- Queen.
- One continuous mattress: no Luonto-style sections, sectioned or fold-down surfaces, no click-clack futons.
- Size: width about 78–100"; closed depth no more than ~44"; open depth no more than ~96". L-sectionals are too big.
- No heavy wear.
Colors: no stark white, black, dark chocolate or saturated colors. Plain light grey is only "mid": he wants tasteful with a little character. No nailhead trim.
Known good: West Elm Shelter (he owns one; it's the comfort benchmark).
Must fit up the stairs; delivery or moving help counts for a lot (a van pickup, not a bike one).
Check: mechanism opens and closes smoothly, mattress included and clean, frame doesn't rack, cushions not flattened, no stains, rips or odor.`,
    queries: ["queen sleeper sofa", "comfort sleeper", "american leather sleeper", "room and board sleeper", "mid century sleeper sofa", "sofa bed queen", "pull out couch queen"],
    features: [{ label: "Queen mattress", points: 3 }, { label: "No bar in back", points: 3 }, { label: "Tobacco/camel leather", points: 3 }, { label: "Deep sink-in seat", points: 2 }],
    fbQueries: ["american leather comfort sleeper", "rh maxwell sleeper", "leather sleeper sofa", "cognac leather sleeper", "crate and barrel sleeper", "interior define sleeper", "west elm shelter sleeper"],
  },
  {
    // Provisional: the Mac's marketplace search sends its own criteria for
    // this search (searches/<rug>/criteria.md); replace this with that text.
    id: "apartment-rug", name: "Rugs", budget: "$200–$1,500 [confirm]", max: 2000, category: "hsa",
    lookingFor: "A beautiful, well-made rug for the apartment: natural fibers, character, the right size for the room.",
    criteria: `${QUALITY}

Must have: wool, silk or another natural fiber; hand-knotted or hand-woven beats machine-made; size [confirm: 8x10 / 9x12 / runner] for [confirm: room].
Prefer: vintage or antique Persian, Turkish (Oushak), Moroccan (Beni Ourain, Boucherouite), Tibetan, kilims and flatweaves; good modern makers (Armadillo, Nordic Knots, Beni, Lawrence of La Brea, Meharaj, Woven Concepts).
Colors: warm, muted, tasteful with a little character (to sit with tobacco / camel leather); no stark white, black or saturated synthetic colors.
Hard no: synthetic (polyester, polypropylene, viscose / "art silk"), printed or tufted-and-glued, pet stains or odor, moth damage, heavy wear or holes.
Check: back of the rug (knots visible = hand-knotted), fringe and edges, flatness, any odor; ask for exact dimensions.`,
    queries: ["wool rug", "vintage rug", "persian rug", "oushak rug", "moroccan rug", "kilim"],
    features: [{ label: "Hand-knotted", points: 3 }, { label: "Vintage / antique", points: 2 }, { label: "Right size", points: 3 }],
  },
];

export const snapshot = {
  searches: ITEMS.map(it => ({
    id: it.id, name: it.name, lookingFor: it.lookingFor, budget: it.budget, area: `${PLACE.city}; pickup from ${HOME}`, timing: "Next 1–2 months [confirm]",
    state: it.state || "Active", criteria: it.criteria, contactTemplate: CONTACT, statuses: STATUSES, metrics: METRICS, features: FEATURES(it.features),
    collection: PLACE.city, home: PLACE.home,
  })),
  sources: ITEMS.flatMap(it => [
    { id: `${it.id}-craigslist`, searchIds: [it.id], name: "Craigslist", access: "Automatic (daily)", crawler: "craigslist",
      method: "Craigslist search API", links: it.queries.slice(0, 3).map(q => cl(q, it.max, it.category)),
      config: { area: PLACE.craigslist, category: it.category || "fua", maxPrice: it.max, searches: [
        ...it.queries.map(query => ({ query })),
        ...(it.wide || []).flatMap(query => HUBS.map(postal => ({ query, postal, radius: 250 }))),
      ] } },
    { id: `${it.id}-facebook`, searchIds: [it.id], name: "Facebook Marketplace", access: "Manual (Chrome routine / share)",
      method: "Claude in Chrome reads these saved searches and sends results to /api/intake", links: [...(it.wide || []).map(q => fbShip(q, it.max)), ...(it.fbQueries || it.queries.slice(0, 4)).map(q => fb(q, it.max))],
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
