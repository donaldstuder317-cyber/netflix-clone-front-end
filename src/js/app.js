// Shared front-end logic: session, Supabase-backed catalog / My List / progress caches, rendering helpers.
import { supabase } from "./supabase.js";
const SB_URL = import.meta.env.VITE_SUPABASE_URL, SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DEMO_EMAIL = "me@test.com"; // no auth yet: every session maps to the seeded demo user

// In-memory caches, filled once per page load by init(). Reads are sync; writes are optimistic + persisted.
export const TITLES = [];
export const GENRES = [];
let userId = null, listIds = [], progressMap = {};
export const featured = () => TITLES.find(t => t.featured) || TITLES[0];

const mapTitle = r => ({ id: r.id, title: r.title, year: r.release_year, rating: r.rating, runtime: r.runtime_minutes,
  genre: r.genres?.name ?? "", cast: (r.title_cast || []).map(c => c.people?.name).filter(Boolean), synopsis: r.synopsis, featured: r.is_featured });

let ready = null;
async function load() {
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const [titles, genres, user] = await Promise.all([
    supabase.from("titles")
      .select("id, title, release_year, rating, runtime_minutes, synopsis, is_featured, genres(name), title_cast(billing_order, people(name))")
      .order("id").order("billing_order", { referencedTable: "title_cast" }).then(must),
    supabase.from("genres").select("id, name").order("id").then(must),
    supabase.from("users").select("id").eq("email", DEMO_EMAIL).single().then(must)
  ]);
  userId = user.id;
  const [list, prog] = await Promise.all([
    supabase.from("my_list").select("title_id").eq("user_id", userId).order("added_at").then(must),
    supabase.from("watch_progress").select("title_id, position_seconds").eq("user_id", userId).then(must)
  ]);
  TITLES.splice(0, TITLES.length, ...titles.map(mapTitle));
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
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
export const byId = id => TITLES.find(t => t.id === Number(id));
export const fmtRuntime = m => `${Math.floor(m / 60)}h ${m % 60}m`;
export const fmtTime = s => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

export const session = {
  user: () => store.get("session", null),
  login: email => store.set("session", { email }),
  logout: () => { try { localStorage.removeItem("session"); } catch {} location.href = "../../index.html"; },
  require() { if (!session.user()) location.href = "../../index.html"; }
};
export const myList = {
  ids: () => listIds.slice(),
  has: id => listIds.includes(Number(id)),
  // Optimistic: updates the cache immediately, persists to Supabase; on error reverts and calls onRevert (to resync UI).
  toggle(id, onRevert) { id = Number(id); const adding = !listIds.includes(id);
    listIds = adding ? [...listIds, id] : listIds.filter(x => x !== id);
    const req = adding
      ? supabase.from("my_list").upsert({ user_id: userId, title_id: id }, { onConflict: "user_id,title_id", ignoreDuplicates: true })
      : supabase.from("my_list").delete().eq("user_id", userId).eq("title_id", id);
    req.then(({ error }) => { if (!error) return;
      console.error("My List update failed", error);
      listIds = adding ? listIds.filter(x => x !== id) : (listIds.includes(id) ? listIds : [...listIds, id]);
      onRevert?.(); });
    return adding; }
};
const progressRow = (id, sec) => ({ user_id: userId, title_id: Number(id), position_seconds: Math.round(sec || 0), updated_at: new Date().toISOString() });
export const progress = {
  all: () => ({ ...progressMap }),
  get: id => progressMap[id] || 0,
  set(id, sec) { const prev = progressMap[id]; const val = Math.round(sec || 0); progressMap[id] = val;
    supabase.from("watch_progress").upsert(progressRow(id, val), { onConflict: "user_id,title_id" })
      .then(({ error }) => { if (!error) return; console.error("Progress save failed", error);
        if (progressMap[id] === val) prev === undefined ? delete progressMap[id] : progressMap[id] = prev; }); },
  // For pagehide/unload: keepalive fetch survives navigation where supabase-js requests may be dropped.
  setOnLeave(id, sec) { progressMap[id] = Math.round(sec || 0); if (userId == null) return;
    try { fetch(`${SB_URL}/rest/v1/watch_progress?on_conflict=user_id,title_id`, { method: "POST", keepalive: true,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(progressRow(id, sec)) }).catch(e => console.error("Progress save failed", e)); } catch (e) { console.error("Progress save failed", e); } },
  started: () => Object.keys(progressMap).filter(id => progressMap[id] > 0).map(Number)
};

export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function posterStyle(t) { const h = (t.id * 47) % 360; return `background:linear-gradient(135deg,hsl(${h},60%,30%),hsl(${(h + 50) % 360},70%,12%))`; }
export function posterCard(t, withProgress) {
  const pct = withProgress ? Math.min(100, progress.get(t.id) / (t.runtime * 60) * 100) : 0;
  return `<a class="poster" href="title-detail.html?id=${t.id}" style="${posterStyle(t)}" aria-label="${esc(t.title)}">
    <span class="poster-title">${esc(t.title)}</span>
    ${withProgress ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ""}</a>`;
}
export function renderNav(active) {
  const links = [["browse.html", "Home"], ["search.html", "Search"], ["my-list.html", "My List"]];
  document.getElementById("nav").innerHTML = `<a class="logo" href="browse.html">NETFLIX CLONE</a>
    <nav aria-label="Main">${links.map(([h, l]) => `<a href="${h}" ${l === active ? 'aria-current="page"' : ""}>${l}</a>`).join("")}
    <button class="link" id="signout">Sign out</button></nav>`;
  document.getElementById("signout").onclick = session.logout;
}
