// The enrichers that ship with Shortlist (lib/layer.js has the contract).
import { registerEnricher } from "../layer.js";
import { manufacturer } from "./manufacturer.js";

// Official product page, image, model and new price, for shortlists whose
// cards show a "Product page".
registerEnricher("manufacturer", manufacturer);
