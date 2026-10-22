// Service worker: talks to your Shortlist deployment's intake endpoint and
// reads Marketplace tabs with extract.js. Everything starts from a click in
// the popup; nothing runs on its own.
//
//   screen   read the results tab you're on, send the cards to
//            POST /api/intake {step: "screen"}; keep the ones it picks
//   addPicks open each pick in a background tab, one at a time with a pause
//            between, read it, send it with {step: "add"}, close the tab
//   addThis  read the listing tab you're on and send it
//
// Progress lives in chrome.storage.session under "job" so the popup can
// show it after being closed and reopened.

const PAUSE_MS = [3000, 7000];      // between listings: human pace, not a crawl
const SETTLE_MS = 2500;             // after a listing tab finishes loading
const LOAD_TIMEOUT_MS = 30000;
const MAX_PICKS = 12;               // the intake screen keeps at most 12

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pause = () => sleep(PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]));

async function settings() {
  const s = await chrome.storage.local.get(["baseUrl", "token", "searchId", "source"]);
  if (!s.baseUrl || !s.token || !s.searchId) throw new Error("Open Settings and fill in your Shortlist URL, admin token and search.");
  return { ...s, baseUrl: s.baseUrl.replace(/\/$/, ""), source: s.source || "Facebook Marketplace" };
}

async function intake(body) {
  const s = await settings();
  const res = await fetch(s.baseUrl + "/api/intake", {
    method: "POST",
    headers: { authorization: "Bearer " + s.token, "content-type": "application/json" },
    body: JSON.stringify({ searchId: s.searchId, source: s.source, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Shortlist answered HTTP " + res.status);
  return data;
}

const getJob = async () => (await chrome.storage.session.get("job")).job || null;
const setJob = async patch => {
  const job = { ...(await getJob()), ...patch, updatedAt: Date.now() };
  await chrome.storage.session.set({ job });
  await chrome.action.setBadgeText({ text: job.running ? (job.phase === "adding" ? String(job.done || 0) : "…") : "" });
  return job;
};

async function extract(tabId, fn) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    func: name => globalThis.ShortlistFB[name](document, location.href),
    args: [fn],
  });
  return r && r.result;
}

// A new tab reports "complete" for its blank start page too, so wait until
// it has finished loading the listing itself.
// A Facebook login or security check page instead means you're signed out
// in this browser; say so rather than waiting for a listing that won't come.
function waitForLoad(tabId) {
  const ready = tab => tab.status === "complete" && /\/marketplace\/item\//.test(tab.url || "");
  const walled = tab => /facebook\.com\/(login|checkpoint)\b/.test(tab.url || "");
  return new Promise((resolve, reject) => {
    const done = (ok, msg) => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(on); ok ? resolve() : reject(new Error(msg)); };
    const timer = setTimeout(() => done(false, "The listing took too long to load."), LOAD_TIMEOUT_MS);
    function on(id, _info, tab) {
      if (id !== tabId) return;
      if (walled(tab)) done(false, "Facebook asked you to log in. Sign in to facebook.com in this browser, then try again.");
      else if (ready(tab)) done(true);
    }
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then(tab => { if (ready(tab)) done(true); }, () => {});
  });
}

async function readListing(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForLoad(tab.id);
    await sleep(SETTLE_MS);
    return await extract(tab.id, "extractItem");
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function screen(tabId) {
  await setJob({ running: true, cancel: false, phase: "screen", message: "Reading this page…", picks: [], done: 0, added: 0, errors: [] });
  const cards = await extract(tabId, "extractResults");
  if (!cards || !cards.length) {
    return setJob({ running: false, phase: "idle", message: "No listings found on this page. Scroll so the results load, then try again." });
  }
  await setJob({ message: `Sending ${cards.length} listings to Shortlist…` });
  const r = await intake({ step: "screen", candidates: cards.map(({ key, title, price, location, url }) => ({ key, title, price, location, url })) });
  const keep = new Set(r.keep || []);
  const picks = cards.filter(c => keep.has(c.key)).slice(0, MAX_PICKS);
  return setJob({
    running: false, phase: picks.length ? "picked" : "idle", picks,
    message: picks.length
      ? `${cards.length} read · ${r.fresh} new · ${picks.length} worth opening.`
      : `${cards.length} read · ${r.fresh} new · none worth opening.`,
  });
}

async function addPicks() {
  const job = await getJob();
  const picks = (job && job.picks) || [];
  if (!picks.length) return setJob({ message: "Nothing to add. Send a results page first." });
  await setJob({ running: true, cancel: false, phase: "adding", done: 0, added: 0, errors: [], message: `Opening 1 of ${picks.length}…` });
  for (let i = 0; i < picks.length; i++) {
    if ((await getJob()).cancel) return setJob({ running: false, cancel: false, phase: "idle", message: `Stopped after ${i} of ${picks.length}.` });
    await setJob({ message: `Opening ${i + 1} of ${picks.length}: ${picks[i].title || picks[i].url}` });
    try {
      const item = await readListing(picks[i].url);
      if (!item) throw new Error("Couldn't read that listing.");
      const r = await intake({ step: "add", items: [item] });
      const j = await getJob();
      await setJob({ done: i + 1, added: j.added + (r.added || 0) });
    } catch (e) {
      const j = await getJob();
      await setJob({ done: i + 1, errors: [...j.errors, `${picks[i].title || picks[i].url}: ${e.message}`] });
    }
    if (i < picks.length - 1) await pause();
  }
  const j = await getJob();
  return setJob({ running: false, phase: "idle", picks: [],
    message: `Done: ${j.added} added to Shortlist` + (j.errors.length ? ` · ${j.errors.length} failed` : "") + "." });
}

async function addThis(tabId) {
  await setJob({ running: true, cancel: false, phase: "adding", done: 0, added: 0, errors: [], message: "Reading this listing…" });
  const item = await extract(tabId, "extractItem");
  if (!item) return setJob({ running: false, phase: "idle", message: "This doesn't look like a Marketplace listing." });
  const r = await intake({ step: "add", items: [item] });
  return setJob({ running: false, phase: "idle", added: r.added || 0,
    message: r.added ? "Added to Shortlist." : r.reposts ? "Already on the board (same post text)." : "Already on the board." });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    if (msg.type === "screen") return screen(msg.tabId);
    if (msg.type === "addPicks") return addPicks();
    if (msg.type === "addThis") return addThis(msg.tabId);
    if (msg.type === "cancel") return setJob({ cancel: true, message: "Stopping after this listing…" });
    if (msg.type === "clear") { await chrome.storage.session.remove("job"); await chrome.action.setBadgeText({ text: "" }); return null; }
  };
  run().then(job => reply({ ok: true, job }), async e => {
    await setJob({ running: false, phase: "idle", message: e.message });
    reply({ ok: false, error: e.message });
  });
  return true;
});
