// Shared front-end logic: Supabase Auth session, Supabase-backed catalog / My List / progress caches, rendering helpers.
import { supabase } from "./supabase.js";
const SB_URL = import.meta.env.VITE_SUPABASE_URL, SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SIGN_IN = "../../index.html"; // relative to src/pages/

// In-memory caches, filled once per page load by init(). Reads are sync; writes are optimistic + persisted.
// RLS scopes my_list / watch_progress to the signed-in user, and user_id defaults to auth.uid(), so no user id is sent.
export const TITLES = [];
export const GENRES = [];
let listIds = [], progressMap = {};
export const featured = () => TITLES.find(t => t.featured) || TITLES[0];

const mapTitle = r => ({ id: r.id, tmdbId: r.tmdb_id, title: r.title, year: r.release_year, rating: r.rating, runtime: r.runtime_minutes,
  genre: r.genres?.name ?? "", cast: (r.title_cast || []).map(c => c.people?.name).filter(Boolean), synopsis: r.synopsis, featured: r.is_featured,
  score: null, poster: null, backdrop: null });

// TMDB (via the `tmdb` edge function, which holds the API key): live title, details, rating and images
// replace the stored values. Optional: if it fails the catalog still renders from Supabase with gradient posters.
async function loadTmdb(titles) {
  const ids = titles.map(t => t.tmdbId).filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabase.functions.invoke(`tmdb?action=batch&ids=${ids.join(",")}`, { method: "GET" });
  if (error) throw error;
  const img = (size, path) => path ? `${data.image_base_url}${size}${path}` : null;
  const byTmdb = new Map(data.movies.map(m => [m.tmdb_id, m]));
  for (const t of titles) { const m = byTmdb.get(t.tmdbId); if (!m) continue;
    Object.assign(t, { title: m.title || t.title, year: m.release_year ?? t.year, runtime: m.runtime_minutes ?? t.runtime,
      synopsis: m.synopsis ?? t.synopsis, rating: m.certification || t.rating, cast: m.cast.length ? m.cast : t.cast,
      score: m.vote_count ? m.vote_average : null, poster: img("w342", m.poster_path), backdrop: img("w1280", m.backdrop_path) }); }
}

let ready = null;
async function load() {
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const [titles, genres, list, prog] = await Promise.all([
    supabase.from("titles")
      .select("id, tmdb_id, title, release_year, rating, runtime_minutes, synopsis, is_featured, genres(name), title_cast(billing_order, people(name))")
      .order("id").order("billing_order", { referencedTable: "title_cast" }).then(must),
    supabase.from("genres").select("id, name").order("id").then(must),
    supabase.from("my_list").select("title_id").order("added_at").then(must),
    supabase.from("watch_progress").select("title_id, position_seconds").then(must)
  ]);
  const mapped = titles.map(mapTitle);
  await loadTmdb(mapped).catch(e => console.warn("TMDB details unavailable; using stored catalog", e));
  TITLES.splice(0, TITLES.length, ...mapped);
  GENRES.splice(0, GENRES.length, "All", ...genres.map(g => g.name));
  listIds = list.map(r => r.title_id);
  progressMap = Object.fromEntries(prog.map(r => [r.title_id, r.position_seconds]));
}
// Await before rendering. On failure, shows an error in `errorEl` (if given) and resolves false.
export async function init(errorEl) {
  try { await (ready ||= load()); return true; }
  catch (e) {
    ready = null; console.error("Failed to load data from Supabase", e);
    if (errorEl) errorEl.innerHTML = `<div class="empty" style="margin-top:40px">Couldn't load titles. Please check your connection and refresh.</div>`;
    return false;
  }
}
export const byId = id => TITLES.find(t => t.id === Number(id));
export const fmtRuntime = m => `${Math.floor(m / 60)}h ${m % 60}m`;
export const fmtTime = s => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

// Same rules on Sign In and Sign Up. Returns the messages to show ([] when valid).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/; // 8+ chars, an uppercase letter, a digit, a symbol
export const EMAIL_MSG = "Enter a valid email address.";
export const PASSWORD_MSG = "Password must be at least 8 characters and include an uppercase letter, a number and a symbol.";
export const credentialErrors = (email, pw) => [!EMAIL_RE.test(email) && EMAIL_MSG, !PASSWORD_RE.test(pw) && PASSWORD_MSG].filter(Boolean);

// Auth: supabase-js keeps the session (access + refresh token) in localStorage and refreshes it,
// so a reload restores the same user. The access token is cached for the keepalive progress save.
let user = null, accessToken = null;
supabase.auth.onAuthStateChange((event, s) => {
  accessToken = s?.access_token ?? null;
  if (event === "SIGNED_OUT" && user) location.replace(SIGN_IN); // signed out in another tab
});
export const session = {
  user: () => user, // the confirmed user ({ id, email, ... }) once require() resolves
  // Protected pages: confirm the stored session with the Auth server. No valid session -> sign-in page
  // (the returned promise never resolves, so the page stops). Offline -> fall back to the stored session
  // and let init() show the connection error.
  async require() {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) return user = data.user;
    if (error?.name === "AuthRetryableFetchError") {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) return user = s.user;
    }
    await supabase.auth.signOut({ scope: "local" }); // drop a stale or revoked token
    location.replace(SIGN_IN); return new Promise(() => {});
  },
  // Sign-in / sign-up pages: is there a stored session to skip ahead with?
  active: async () => !!(await supabase.auth.getSession()).data.session,
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email, password) => supabase.auth.signUp({ email, password }),
  // Ends the session on the server and removes the tokens (and cached data) from this browser.
  async logout() {
    user = null;
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
    try { localStorage.removeItem("session"); } catch {} // pre-auth demo key
    listIds = []; progressMap = {}; location.replace(SIGN_IN);
  }
};
export const myList = {
  ids: () => listIds.slice(),
  has: id => listIds.includes(Number(id)),
  // Optimistic: updates the cache immediately, persists to Supabase; on error reverts and calls onRevert (to resync UI).
  toggle(id, onRevert) { id = Number(id); const adding = !listIds.includes(id);
    listIds = adding ? [...listIds, id] : listIds.filter(x => x !== id);
    const req = adding
      ? supabase.from("my_list").upsert({ title_id: id }, { onConflict: "user_id,title_id", ignoreDuplicates: true })
      : supabase.from("my_list").delete().eq("title_id", id);
    req.then(({ error }) => { if (!error) return;
      console.error("My List update failed", error);
      listIds = adding ? listIds.filter(x => x !== id) : (listIds.includes(id) ? listIds : [...listIds, id]);
      onRevert?.(); });
    return adding; }
};
const progressRow = (id, sec) => ({ title_id: Number(id), position_seconds: Math.round(sec || 0), updated_at: new Date().toISOString() });
export const progress = {
  all: () => ({ ...progressMap }),
  get: id => progressMap[id] || 0,
  set(id, sec) { const prev = progressMap[id]; const val = Math.round(sec || 0); progressMap[id] = val;
    supabase.from("watch_progress").upsert(progressRow(id, val), { onConflict: "user_id,title_id" })
      .then(({ error }) => { if (!error) return; console.error("Progress save failed", error);
        if (progressMap[id] === val) prev === undefined ? delete progressMap[id] : progressMap[id] = prev; }); },
  // For pagehide/unload: keepalive fetch survives navigation where supabase-js requests may be dropped.
  // Sends the user's access token (RLS rejects the bare publishable key).
  setOnLeave(id, sec) { progressMap[id] = Math.round(sec || 0); if (!accessToken) return;
    try { fetch(`${SB_URL}/rest/v1/watch_progress?on_conflict=user_id,title_id`, { method: "POST", keepalive: true,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(progressRow(id, sec)) }).catch(e => console.error("Progress save failed", e)); } catch (e) { console.error("Progress save failed", e); } },
  started: () => Object.keys(progressMap).filter(id => progressMap[id] > 0).map(Number)
};

export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// kind "poster" (2:3 cards, thumbs) or "backdrop" (hero, detail header: faded into the page so the text stays readable).
// Falls back to the generated gradient when TMDB has no image. Image URLs come from TMDB paths, so no escaping beyond quotes is needed.
export function posterStyle(t, kind = "poster") {
  const url = kind === "backdrop" ? t.backdrop || t.poster : t.poster;
  if (url) return kind === "backdrop"
    ? `background:linear-gradient(to top,var(--bg) 4%,#14141499 40%,#0000 70%),url('${url}') center/cover no-repeat`
    : `background:#222 url('${url}') center/cover no-repeat`;
  const h = (t.id * 47) % 360; return `background:linear-gradient(135deg,hsl(${h},60%,30%),hsl(${(h + 50) % 360},70%,12%))`;
}
export const fmtScore = t => t.score == null ? "" : `★ ${t.score.toFixed(1)}`;
export function posterCard(t, withProgress) {
  const pct = withProgress ? Math.min(100, progress.get(t.id) / (t.runtime * 60) * 100) : 0;
  return `<a class="poster${t.poster ? " has-img" : ""}" href="title-detail.html?id=${t.id}" style="${posterStyle(t)}" aria-label="${esc(t.title)}">
    ${t.score != null ? `<span class="score" aria-label="TMDB rating ${t.score.toFixed(1)} out of 10">${fmtScore(t)}</span>` : ""}
    <span class="poster-title">${esc(t.title)}</span>
    ${withProgress ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ""}</a>`;
}
export function renderNav(active) {
  const links = [["browse.html", "Home"], ["search.html", "Search"], ["my-list.html", "My List"]];
  document.getElementById("nav").innerHTML = `<a class="logo" href="browse.html">NETFLIX CLONE</a>
    <nav aria-label="Main">${links.map(([h, l]) => `<a href="${h}" ${l === active ? 'aria-current="page"' : ""}>${l}</a>`).join("")}
    <span class="who" id="who" title="Signed in as ${esc(user?.email ?? "")}">${esc(user?.email ?? "")}</span>
    <button class="link" id="signout">Sign out</button></nav>`;
  document.getElementById("signout").onclick = session.logout;
  if (!document.getElementById("donate-fab")) { // pinned donate logo, lower-right (not used on the player page)
    const a = document.createElement("a");
    a.id = "donate-fab"; a.className = "donate-fab"; a.href = "/donate"; a.setAttribute("aria-label", "Donate");
    a.innerHTML = `<img src="/netflix_logo.png" alt="" width="32" height="32">`;
    document.body.append(a);
  }
}
