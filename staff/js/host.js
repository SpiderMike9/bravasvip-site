import { auth, db, watchStaff, logout, FLOORBOARD_HOOK } from "./fb.js";
import {
  doc, collection, onSnapshot, setDoc, addDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LIMIT = 40;          // room capacity
const WARN_AT = 35;        // capacity warning
const GUEST_MIN = 120;     // guest table time
const EXTEND_MIN = 60;     // one extension
const WARN_MS = 15 * 60000;

const LAYOUT = [
  { name: "Tables", ids: ["A", "B", "C", "D", "H"] },
  { name: "Floor", ids: ["1", "2", "3", "4", "5"] },
  { name: "U-bar", ids: ["U-6", "U-7", "U-8", "U-9", "U-10", "U-11", "U-12", "U-13"], small: true },
  { name: "Back patio", ids: ["Patio"], wide: true }
];

const $ = (id) => document.getElementById(id);
let user = null;
let tables = {};
let count = null;
let alertStatus = null;
let unsub = [];
let openId = null;
const chimed = new Set();

// ---------- helpers ----------
function ms(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function clock(msLeft) {
  const neg = msLeft < 0; let s = Math.floor(Math.abs(msLeft) / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); const sec = s % 60;
  const t = h > 0 ? `${h}h ${m}m` : m >= 15 ? `${m} min` : `${m}:${String(sec).padStart(2, "0")}`;
  return { t, neg };
}
function timeOfDay(t) {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function agoText(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}
function toast(msg, bad) {
  const el = $("toast"); el.textContent = msg; el.className = bad ? "toast bad" : "toast";
  el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}
function errText(e) {
  if (e && e.code === "permission-denied") return "Not allowed. Firestore rules blocked this. Check the rules were published.";
  if (e && e.code === "unavailable") return "No connection. The change will save when the tablet is back online.";
  return (e && e.message) || String(e);
}
function tableState(t) {
  if (!t || !t.occupied) return { kind: "open" };
  if (t.member) return { kind: "member" };
  const end = ms(t.endsAt);
  if (end == null) return { kind: "guest", left: null };
  const left = end - Date.now();
  if (left <= 0) return { kind: "expired", left };
  if (left <= WARN_MS) return { kind: "warn", left };
  return { kind: "guest", left };
}

// ---------- sound (unlocked by the first tap) ----------
let actx = null;
document.addEventListener("pointerdown", () => {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  if (actx && actx.state === "suspended") actx.resume();
}, { passive: true });
function chime() {
  if (!actx || !$("sound").checked) return;
  const now = actx.currentTime;
  [880, 660].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = f; o.type = "sine";
    g.gain.setValueAtTime(0.0001, now + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.35, now + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.4);
    o.connect(g).connect(actx.destination); o.start(now + i * 0.22); o.stop(now + i * 0.22 + 0.45);
  });
}

// ---------- audit + alerts ----------
async function audit(action, extra) {
  try {
    await addDoc(collection(db, "audit"), Object.assign({
      action, uid: user.uid, email: user.email || "", atMs: Date.now(), at: serverTimestamp()
    }, extra || {}));
  } catch (e) { console.warn("audit failed", e); }
}
function nudge() {
  try {
    fetch(FLOORBOARD_HOOK, { method: "POST", mode: "no-cors", body: new URLSearchParams({ event: "nudge" }) });
  } catch (_) {}
}
async function raiseAlert(type, next, prev) {
  try {
    await addDoc(collection(db, "alerts"), {
      type, count: next, prev, limit: LIMIT, processed: false,
      uid: user.uid, email: user.email || "", at: serverTimestamp(), atMs: Date.now()
    });
    nudge();
  } catch (e) { toast("Alert didn't save: " + errText(e), true); }
}

// ---------- door count ----------
async function changeCount(delta) {
  const ref = doc(db, "occupancy", "current");
  let prev = 0, next = 0;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        if (delta < 0) throw new Error("The room is already at 0.");
        prev = 0; next = 1; tx.set(ref, { count: 1 }); return;
      }
      prev = snap.data().count || 0; next = prev + delta;
      if (next < 0) throw new Error("The room is already at 0.");
      if (next > LIMIT) throw new Error("Full at 40. Nobody else comes in until someone leaves.");
      tx.update(ref, { count: next });
    });
  } catch (e) { toast(errText(e), true); return; }
  audit(delta > 0 ? "count_in" : "count_out", { count: next, prev });
  if (delta > 0 && prev < WARN_AT && next >= WARN_AT && next < LIMIT) raiseAlert("capacity_warning", next, prev);
  if (next === LIMIT && prev < LIMIT) raiseAlert("capacity_full", next, prev);
  if (prev === LIMIT && next < LIMIT) raiseAlert("capacity_reopened", next, prev);
}

// ---------- table actions ----------
async function writeTable(id, data, action) {
  try {
    await setDoc(doc(db, "tables", id), data);   // full replace: clears old warning flags
    audit(action, { table: id, partyName: data.partyName || "", partySize: data.partySize || 0, member: !!data.member });
    return true;
  } catch (e) { toast(errText(e), true); return false; }
}
function seat(id, name, size, member) {
  const now = Date.now();
  return writeTable(id, {
    occupied: true, partyName: name, partySize: size, member, staff: user.email || "",
    startedAt: now, endsAt: member ? null : now + GUEST_MIN * 60000,
    limitMin: member ? 0 : GUEST_MIN, updatedAt: now
  }, member ? "seat_member" : "seat_guest");
}
function extend(id) {
  const t = tables[id]; const now = Date.now();
  const base = Math.max(ms(t.endsAt) || now, now);
  chimed.delete(id);
  return writeTable(id, {
    occupied: true, partyName: t.partyName || "", partySize: t.partySize || 1, member: false,
    staff: user.email || "", startedAt: ms(t.startedAt) || now, endsAt: base + EXTEND_MIN * 60000,
    limitMin: (t.limitMin || GUEST_MIN) + EXTEND_MIN, updatedAt: now
  }, "extend");
}
function clearTable(id) {
  chimed.delete(id);
  return writeTable(id, {
    occupied: false, partyName: "", partySize: 0, member: false, staff: user.email || "",
    startedAt: null, endsAt: null, limitMin: 0, updatedAt: Date.now()
  }, "clear");
}

// ---------- rendering ----------
function buildFloor() {
  const floor = $("floor"); floor.innerHTML = "";
  LAYOUT.forEach(sec => {
    const wrap = document.createElement("section"); wrap.className = "zone";
    const h = document.createElement("h2"); h.textContent = sec.name; wrap.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "zone-grid" + (sec.small ? " small" : "") + (sec.wide ? " wide" : "");
    sec.ids.forEach(id => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tile open"; b.dataset.id = id;
      b.innerHTML = `<span class="tile-id"></span><span class="tile-who"></span><span class="tile-time"></span>`;
      b.querySelector(".tile-id").textContent = id;
      b.addEventListener("click", () => openSheet(id));
      grid.appendChild(b);
    });
    wrap.appendChild(grid); floor.appendChild(wrap);
  });
}
function renderTiles() {
  let seatedGuests = 0, members = 0, people = 0;
  document.querySelectorAll(".tile").forEach(b => {
    const id = b.dataset.id; const t = tables[id]; const st = tableState(t);
    b.className = "tile " + st.kind;
    const who = b.querySelector(".tile-who"), time = b.querySelector(".tile-time");
    if (st.kind === "open") { who.textContent = "Open"; time.textContent = ""; b.setAttribute("aria-label", `Table ${id}, open`); return; }
    people += t.partySize || 0;
    const label = `${t.partyName || "Party"} · ${t.partySize || "?"}`;
    who.textContent = label;
    if (st.kind === "member") { members++; time.textContent = "Member"; }
    else {
      seatedGuests++;
      if (st.left == null) time.textContent = "No end time";
      else { const c = clock(st.left); time.textContent = c.neg ? `Over by ${c.t}` : `${c.t} left`; }
      if ((st.kind === "warn" || st.kind === "expired") && !chimed.has(id)) { chimed.add(id); chime(); }
    }
    b.setAttribute("aria-label", `Table ${id}, ${label}, ${time.textContent}`);
  });
  $("summary").textContent = `${seatedGuests} guest ${seatedGuests === 1 ? "table" : "tables"}, ${members} member ${members === 1 ? "table" : "tables"}, ${people} seated`;
  if (openId) fillSheet(openId);
}
function renderCount() {
  const el = $("count"); const panel = $("door");
  el.textContent = count == null ? "–" : String(count);
  panel.classList.toggle("warn", count != null && count >= WARN_AT && count < LIMIT);
  panel.classList.toggle("full", count === LIMIT);
  $("door-note").textContent = count === LIMIT ? "Full. Stop entry until someone leaves."
    : count != null && count >= WARN_AT ? `${LIMIT - count} spaces left. Watch the door.`
    : "Tap + for each person in, − for each person out.";
  $("plus").disabled = count === LIMIT;
  $("minus").disabled = !count;
}
function renderStatus() {
  const el = $("alert-status");
  const ok = ms(alertStatus && alertStatus.lastOkAtMs), bad = ms(alertStatus && alertStatus.lastErrorAtMs);
  if (bad && (!ok || bad > ok)) {
    el.className = "status bad"; el.textContent = `Telegram alerts failing (${agoText(bad)}). Check Make history.`;
  } else if (ok) {
    el.className = "status ok"; el.textContent = `Telegram alerts working. Last one sent ${agoText(ok)}.`;
  } else {
    el.className = "status"; el.textContent = "No Telegram alerts sent yet tonight.";
  }
}

// ---------- sheet ----------
function openSheet(id) { openId = id; fillSheet(id, true); $("sheet").showModal(); }
function fillSheet(id, fresh) {
  const t = tables[id]; const st = tableState(t);
  $("sheet-title").textContent = id === "Patio" ? "Back patio" : `Table ${id}`;
  const seatForm = $("seat-form"), seated = $("seated");
  if (st.kind === "open") {
    seated.hidden = true; seatForm.hidden = false;
    if (fresh) { $("party").value = ""; $("size").value = "2"; $("kind-guest").checked = true; }
    return;
  }
  seatForm.hidden = true; seated.hidden = false;
  $("seated-who").textContent = `${t.partyName || "Party"}, party of ${t.partySize || "?"}`;
  const since = ms(t.startedAt);
  let line = since ? `Seated ${timeOfDay(since)}` : "Seated";
  if (st.kind === "member") line += ". Member: no time limit.";
  else if (ms(t.endsAt)) {
    const c = clock(st.left);
    line += `. Time ends ${timeOfDay(ms(t.endsAt))} (${c.neg ? "over by " + c.t : c.t + " left"}).`;
  }
  $("seated-line").textContent = line;
  $("extend").hidden = st.kind === "member";
}
$("seat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const size = parseInt($("size").value, 10);
  if (!(size >= 1 && size <= 40)) { toast("Party size must be 1 to 40.", true); return; }
  const member = $("kind-member").checked;
  const ok = await seat(openId, $("party").value.trim().slice(0, 40), size, member);
  if (ok) { toast(`Seated at ${openId}.`); $("sheet").close(); }
});
$("size-minus").addEventListener("click", () => { $("size").value = Math.max(1, (parseInt($("size").value, 10) || 1) - 1); });
$("size-plus").addEventListener("click", () => { $("size").value = Math.min(40, (parseInt($("size").value, 10) || 0) + 1); });
$("extend").addEventListener("click", async () => {
  if (await extend(openId)) { toast(`${openId} extended by 1 hour.`); $("sheet").close(); }
});
$("clear").addEventListener("click", async () => {
  if (!confirm(`Clear ${openId}? The party is leaving the table.`)) return;
  if (await clearTable(openId)) { toast(`${openId} cleared.`); $("sheet").close(); }
});
$("sheet").addEventListener("close", () => { openId = null; });
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => $("sheet").close()));

$("plus").addEventListener("click", () => changeCount(1));
$("minus").addEventListener("click", () => changeCount(-1));
$("exception").addEventListener("click", () => {
  if (!confirm("Send a safety alert to BRAVAS Alerts that the door count doesn't match the room?")) return;
  raiseAlert("capacity_exception", count || 0, count || 0).then(() => toast("Safety alert sent."));
  audit("count_exception", { count: count || 0 });
});
document.querySelectorAll("[data-signout]").forEach(b => b.addEventListener("click", logout));

// ---------- start ----------
function start() {
  buildFloor();
  const fail = (e) => { $("live").textContent = "Not live: " + errText(e); $("live").className = "live off"; };
  unsub.push(onSnapshot(collection(db, "tables"), (snap) => {
    tables = {}; snap.forEach(d => { tables[d.id] = d.data(); });
    $("live").textContent = snap.metadata.fromCache ? "Offline. Showing last known board." : "Live";
    $("live").className = snap.metadata.fromCache ? "live off" : "live";
    renderTiles();
  }, fail));
  unsub.push(onSnapshot(doc(db, "occupancy", "current"), (s) => {
    count = s.exists() ? (s.data().count || 0) : 0; renderCount();
  }, fail));
  unsub.push(onSnapshot(doc(db, "system", "alertStatus"), (s) => {
    alertStatus = s.exists() ? s.data() : null; renderStatus();
  }, () => {}));
  setInterval(() => { renderTiles(); renderStatus(); }, 1000);
}

watchStaff({
  onSignedOut() { location.replace("/staff/?next=host"); },
  onDenied() { location.replace("/staff/"); },
  onStaff(u) {
    if (user) return;
    user = u; $("who").textContent = u.email || "";
    $("gate").hidden = true; $("board").hidden = false;
    start();
  },
  onError(e) { $("gate").textContent = "Couldn't check your access: " + errText(e); }
});
