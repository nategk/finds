// Popup: settings, and the buttons for whatever Marketplace page you're on.
// The work itself runs in background.js so it keeps going when this closes.
const $ = id => document.getElementById(id);
let tab = null;

async function loadSearches(baseUrl, selected) {
  const sel = $("searchId");
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + "/api/snapshot");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const { searches = [] } = await res.json();
    sel.replaceChildren(...searches.map(s => new Option(s.name, s.id, false, s.id === selected)));
    if (!searches.length) sel.replaceChildren(new Option("No searches on this board", ""));
  } catch (e) {
    sel.replaceChildren(new Option("Couldn't load searches (" + e.message + ")", ""));
  }
}

async function openSettings(show) {
  $("settings").hidden = !show;
  $("main").hidden = show;
  $("toggle-settings").textContent = show ? "Done" : "Settings";
  if (!show) return;
  const s = await chrome.storage.local.get(["baseUrl", "token", "searchId", "source"]);
  $("baseUrl").value = s.baseUrl || "";
  $("token").value = s.token || "";
  $("source").value = s.source || "";
  if (s.baseUrl) await loadSearches(s.baseUrl, s.searchId);
}

$("toggle-settings").addEventListener("click", () => openSettings($("settings").hidden));

$("settings").addEventListener("submit", async e => {
  e.preventDefault();
  const baseUrl = $("baseUrl").value.trim().replace(/\/$/, "");
  let origin;
  try { origin = new URL(baseUrl).origin; } catch (_) { alertInForm("That URL isn't valid."); return; }
  // The extension may only call your deployment once you allow its origin.
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] }).catch(() => false);
  if (!granted) { alertInForm("Allow access to your Shortlist URL so the extension can send listings."); return; }
  await chrome.storage.local.set({ baseUrl, token: $("token").value.trim(), searchId: $("searchId").value, source: $("source").value.trim() });
  if (!$("searchId").value) { await loadSearches(baseUrl, ""); alertInForm("Saved. Now pick a search and save again."); return; }
  await openSettings(false);
  render(await currentJob());
});

function alertInForm(text) {
  let p = $("form-msg");
  if (!p) { p = document.createElement("p"); p.id = "form-msg"; p.className = "hint"; $("settings").append(p); }
  p.textContent = text;
}

const currentJob = async () => (await chrome.storage.session.get("job")).job || null;

function render(job) {
  const k = ShortlistFB.kind(tab && tab.url);
  const busy = !!(job && job.running);
  $("where").textContent = k === "item" ? "On a Marketplace listing."
    : k === "results" ? "On Marketplace results. Scroll to load more before sending."
    : "Open a Facebook Marketplace search or listing.";
  $("screen").hidden = k !== "results" || busy;
  $("addThis").hidden = k !== "item" || busy;
  const picks = (job && job.phase === "picked" && job.picks) || [];
  $("addPicks").hidden = busy || !picks.length;
  $("addPicks").textContent = `Open and add ${picks.length} pick${picks.length === 1 ? "" : "s"}`;
  $("cancel").hidden = !(busy && job.phase === "adding");
  $("status").textContent = (job && job.message) || "";
  $("picks").replaceChildren(...picks.map(p => {
    const li = document.createElement("li");
    li.textContent = [p.price, p.title, p.location].filter(Boolean).join(" · ");
    return li;
  }));
  $("errors").replaceChildren(...((job && job.errors) || []).map(t => { const li = document.createElement("li"); li.textContent = t; return li; }));
}

const send = msg => chrome.runtime.sendMessage(msg);
$("screen").addEventListener("click", () => send({ type: "screen", tabId: tab.id }));
$("addPicks").addEventListener("click", () => send({ type: "addPicks" }));
$("addThis").addEventListener("click", () => send({ type: "addThis", tabId: tab.id }));
$("cancel").addEventListener("click", () => send({ type: "cancel" }));

chrome.storage.onChanged.addListener((changes, area) => { if (area === "session" && changes.job) render(changes.job.newValue); });

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const s = await chrome.storage.local.get(["baseUrl", "token", "searchId"]);
  if (!s.baseUrl || !s.token || !s.searchId) return openSettings(true);
  render(await currentJob());
})();
