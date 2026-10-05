// Finds's additions to the Shortlist engine. Every api/ wrapper
// imports this first, so these are registered before a handler runs.
import { registerEnricher } from "./vendor/shortlist/lib/layer.js";
import { manufacturer } from "./enrich/manufacturer.js";

// Official product page, image, model and new price for every new listing.
registerEnricher("manufacturer", manufacturer);
