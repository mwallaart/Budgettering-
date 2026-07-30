// ============================================================
//  Huishoudboekje — budget-PWA
//  Logica volgt het Claude Design-ontwerp (design-import/)
// ============================================================

const STORAGE_KEY = "budget-glass-v1";
const THEME_KEY = "budget-theme";

const MN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

const CATS = {
  huis:        { icon: "🏠", label: "Huis" },
  vervoer:     { icon: "🚗", label: "Vervoer" },
  verzekering: { icon: "🛡️", label: "Verzekering" },
  abo:         { icon: "📺", label: "Abonnement" },
  bood:        { icon: "🛒", label: "Boodschappen" },
  overig:      { icon: "🏷️", label: "Overig" },
};
const CAT_KEYS = Object.keys(CATS);
const ALLOC_COLORS = ["var(--brand)", "var(--posSoft)", "var(--gold)", "var(--gold2)", "var(--ink4)"];
const POT_ICONS = ["🪙","🐖","🏖️","👤","🏠","🚗","🍼","🎁","🛟","📈","🎓","🐾"];

/* ---------- Maand-helpers ---------- */
const key = (y, m) => y + "-" + String(m + 1).padStart(2, "0");
const parseK = (k) => ({ y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 });
const addM = (k, n) => { const p = parseK(k); const d = new Date(p.y, p.m + n, 1); return key(d.getFullYear(), d.getMonth()); };
const dim = (k) => { const p = parseK(k); return new Date(p.y, p.m + 1, 0).getDate(); };
const monthsBetween = (a, b) => { const x = parseK(a), y = parseK(b); return (y.y - x.y) * 12 + (y.m - x.m); };
const todayKey = () => { const d = new Date(); return key(d.getFullYear(), d.getMonth()); };
const TODAY = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

function parseAmount(raw) {
  if (typeof raw !== "string") return NaN;
  let s = raw.trim().replace(/[€\s]/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length >= 1 && /\.\d{3}(\D|$)/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch { /* n.v.t. */ } }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s) => document.querySelector(s);

/* ============================================================
   State
   ============================================================ */
function defaultPots() {
  return [
    { id: "alg", label: "Algemeen", icon: "🪙", startBalance: 0, goal: 0, goalDate: null },
    { id: "spaar", label: "Sparen", icon: "🐖", startBalance: 0, goal: 0, goalDate: null },
    { id: "vak", label: "Vakantie", icon: "🏖️", startBalance: 0, goal: 0, goalDate: null },
  ];
}
function defaultState() {
  return {
    version: 5,
    startMonth: todayKey(),
    pots: defaultPots(),
    recurring: [],
    months: {},
    investments: [],
    recentLabels: [],
    backupDismissed: false,
    lastBackup: null,
  };
}

function migrate(raw) {
  const d = { ...defaultState(), ...raw };
  if (!Array.isArray(d.pots) || d.pots.length === 0) d.pots = defaultPots();
  // v4 en eerder: potjes zonder icoon/doeldatum
  d.pots = d.pots.map((p, i) => ({
    goal: 0, goalDate: null, icon: POT_ICONS[i % POT_ICONS.length], startBalance: 0, ...p,
  }));
  d.recurring = (d.recurring || []).map((r) => ({ ...r, day: r.day || 1 }));
  Object.keys(d.months || {}).forEach((k) => {
    const m = d.months[k] || {};
    d.months[k] = { entries: (m.entries || []).map((e) => ({ ...e, day: e.day || 1 })), skip: m.skip || [] };
  });
  d.investments = (d.investments || []).map((i) => ({ monthly: 0, ...i }));
  if (!Array.isArray(d.recentLabels)) d.recentLabels = [];
  d.version = 5;
  return d;
}

let D = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch { return defaultState(); }
})();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(D)); } catch { /* vol/geblokkeerd */ }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = () => JSON.parse(JSON.stringify(D));

/* UI-state (niet opgeslagen, behalve thema en privacy) */
const S = {
  tab: "overzicht",
  month: null,
  pot: null,
  privacy: false,
  focus: null,
  collapsed: { fixed: true },
  swipe: null,
  draft: null,
  editId: null,
  hintDone: false,
  pickerFor: null,
  pickerYear: null,
  undo: null,
};
S.month = clampMonth(todayKey());

function months() { return Array.from({ length: 12 }, (_, i) => addM(D.startMonth, i)); }
function clampMonth(k) {
  const list = months();
  if (k < list[0]) return list[0];
  if (k > list[11]) return list[11];
  return k;
}

/* ============================================================
   Rekenkern (1:1 uit het ontwerp)
   ============================================================ */
function fmt(n, dec) {
  if (S.privacy) return "€ ••••";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0,
  }).format(n).replace(/ /g, " ");
}
function delta(p, potId) {
  if (p.kind === "in") return p.amount;
  if (p.kind === "out") return -p.amount;
  if (!potId) return 0;                       // interne overboeking: netto nul
  if (p.potId === potId) return -p.amount;
  if (p.toPot === potId) return p.amount;
  return 0;
}
function posts(mk, potId) {
  const mo = D.months[mk] || { entries: [], skip: [] };
  const rec = D.recurring
    .filter((r) => (r.fromMonth || D.startMonth) <= mk && !(mo.skip || []).includes(r.id))
    .map((r) => ({ ...r, rec: true }));
  let all = rec.concat(mo.entries || []);
  if (S.editId) all = all.filter((p) => p.id !== S.editId);
  if (S.draft && S.draft.month === mk) all = all.concat([S.draft]);
  if (potId) all = all.filter((p) => p.potId === potId || p.toPot === potId);
  return all;
}
function net(mk, potId) {
  let inc = 0, out = 0;
  posts(mk, potId).forEach((p) => { const v = delta(p, potId); if (v > 0) inc += v; else out += -v; });
  return { inc, out, net: inc - out };
}
function startSum(potId) {
  return D.pots.filter((p) => !potId || p.id === potId).reduce((s, p) => s + (p.startBalance || 0), 0);
}
function begin(mk, potId) {
  let b = startSum(potId);
  for (const k of months()) { if (k >= mk) break; b += net(k, potId).net; }
  return b;
}
function end(mk, potId) { return begin(mk, potId) + net(mk, potId).net; }

function series(potId) {
  const pts = [];
  let bal = startSum(potId);
  for (const mk of months()) {
    const p = parseK(mk), n = dim(mk), ps = posts(mk, potId);
    for (let day = 1; day <= n; day++) {
      ps.forEach((po) => { if (Math.min(po.day || 1, n) === day) bal += delta(po, potId); });
      pts.push({ d: new Date(p.y, p.m, day), v: bal, mk });
    }
  }
  return pts;
}
function pace(p, atKey) {
  if (!p.goal || !p.goalDate) return null;
  const bal = end(atKey, p.id);
  const per = D.recurring.reduce((s, r) => s + delta(r, p.id), 0);
  const a = parseK(atKey), b = parseK(p.goalDate);
  const left = Math.max(0, (b.y - a.y) * 12 + (b.m - a.m));
  return { left, diff: Math.round(bal + per * left - p.goal), per, date: MS[b.m] + " " + b.y };
}
function investTotal() { return D.investments.reduce((s, i) => s + (Number(i.value) || 0), 0); }
function investMonthly() { return D.investments.reduce((s, i) => s + (Number(i.monthly) || 0), 0); }

function isEmptyState() {
  const noStart = D.pots.every((p) => !p.startBalance);
  const noRec = D.recurring.length === 0;
  const noEntries = Object.values(D.months).every((m) => !(m.entries && m.entries.length));
  return noStart && noRec && noEntries && D.investments.length === 0;
}

/* ============================================================
   Thema
   ============================================================ */
const sysDark = window.matchMedia("(prefers-color-scheme: dark)");
function themePref() {
  try { const v = localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" ? v : "auto"; }
  catch { return "auto"; }
}
function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "auto" && sysDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = $("#meta-theme-color");
  if (meta) meta.setAttribute("content", dark ? "#0B1310" : "#F6F1E3");
  document.querySelectorAll("#theme-seg button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.themeOpt === pref));
  });
}
document.querySelectorAll("#theme-seg button").forEach((b) => {
  b.addEventListener("click", () => { haptic(8); try { localStorage.setItem(THEME_KEY, b.dataset.themeOpt); } catch {} applyTheme(b.dataset.themeOpt); });
});
sysDark.addEventListener("change", () => { if (themePref() === "auto") applyTheme("auto"); });
applyTheme(themePref());

/* ============================================================
   Count-up voor de grote bedragen
   ============================================================ */
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shownVals = new WeakMap();
function setBig(el, value) {
  if (S.privacy) { el.textContent = fmt(0); shownVals.set(el, value); return; }
  const prev = shownVals.get(el);
  shownVals.set(el, value);
  if (REDUCED || prev === undefined || prev === value) { el.textContent = fmt(value); return; }
  const from = prev, t0 = performance.now(), dur = 520;
  const step = (now) => {
    const q = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - q, 3);
    el.textContent = fmt(from + (value - from) * e);
    if (q < 1) requestAnimationFrame(step); else el.textContent = fmt(value);
  };
  requestAnimationFrame(step);
}

/* ============================================================
   Render
   ============================================================ */
const els = {
  pageTitle: $("#page-title"),
  views: { overzicht: $("#v-overzicht"), maand: $("#v-maand"), vermogen: $("#v-vermogen") },
};

function render() {
  els.pageTitle.textContent = S.tab === "overzicht" ? "Overzicht"
    : S.tab === "maand" ? MN[parseK(S.month).m] + " " + parseK(S.month).y : "Vermogen";
  for (const k of Object.keys(els.views)) els.views[k].hidden = k !== S.tab;
  document.querySelectorAll(".tab").forEach((b) => {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const hint = S.privacy ? "tik om te tonen" : "tik om te verbergen";
  $("#privacy-hint").textContent = hint;
  $("#privacy-hint2").textContent = hint;

  renderOverview();
  renderMonth();
  renderWealth();
}

/* ---------- Overzicht ---------- */
function safePoint() {
  const spendPot = D.pots.length ? D.pots[0].id : null;
  const ss = spendPot ? series(spendPot) : series(null);
  const t = TODAY(), horizon = new Date(t.getTime() + 45 * 86400000);
  const win = ss.filter((p) => p.d >= t && p.d <= horizon);
  const pt = win.length ? win.reduce((a, p) => (p.v < a.v ? p : a), win[0]) : { v: 0, d: t };
  return { pt, label: spendPot ? D.pots[0].label : "" };
}
function firstWarning() {
  const t = TODAY();
  let warn = null;
  for (const p of D.pots) {
    const s = series(p.id).find((x) => x.v < 0 && x.d >= t);
    if (s && (!warn || s.d < warn.d)) warn = { pot: p, d: s.d, v: s.v };
  }
  return warn;
}

function renderOverview() {
  const nowK = clampMonth(todayKey());
  const savings = end(nowK);
  setBig($("#ov-amount"), savings);
  const n = net(nowK).net;
  $("#ov-delta").textContent = (n >= 0 ? "+ " : "− ") + fmt(Math.abs(n)) + " deze maand";
  const sp = safePoint();
  $("#ov-safe").textContent = "Veilig " + fmt(Math.max(0, sp.pt.v));
  $("#ov-pots").textContent = D.pots.length + (D.pots.length === 1 ? " potje" : " potjes");

  $("#empty-card").hidden = !isEmptyState();

  const warn = firstWarning();
  const wc = $("#warn-card");
  wc.hidden = !warn;
  if (warn) {
    $("#warn-title").textContent = warn.pot.label + " komt onder nul";
    $("#warn-body").textContent = "Op " + warn.d.getDate() + " " + MN[warn.d.getMonth()] +
      " staat dit potje op " + fmt(warn.v) + ".";
  }

  $("#backup-banner").hidden = D.backupDismissed || !!D.lastBackup || isEmptyState();

  renderChart();
  renderMonthList();
}

function renderChart() {
  const ss = series(null);
  if (!ss.length) return;
  const t = TODAY();
  let nowIdx = ss.findIndex((p) => p.d >= t);
  if (nowIdx < 0) nowIdx = ss.length - 1;
  const fi = Math.min(ss.length - 1, Math.max(0, S.focus == null ? nowIdx : S.focus));

  const vals = ss.map((p) => p.v);
  let lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  if (hi === lo) hi = lo + 1;
  const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;

  const X = (i) => (ss.length < 2 ? 0 : (i / (ss.length - 1)) * 320);
  const Y = (v) => 128 - ((v - lo) / (hi - lo)) * 124;
  let line = "";
  for (let i = 0; i < ss.length; i++) line += (i ? "L" : "M") + X(i).toFixed(2) + " " + Y(ss[i].v).toFixed(2) + " ";
  line = line.trim();
  const area = line + " L320 132 L0 132 Z";
  const zeroY = Y(0).toFixed(2);
  const fp = ss[fi];

  $("#chart-hit").innerHTML = `
    <svg viewBox="0 0 320 132" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cfArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--posSoft)" stop-opacity=".30"/>
          <stop offset="100%" stop-color="var(--posSoft)" stop-opacity="0"/>
        </linearGradient>
        <clipPath id="cfClip"><path d="${area}"/></clipPath>
      </defs>
      <line x1="0" y1="1" x2="320" y2="1" stroke="var(--fill1)" stroke-width="1"/>
      <line x1="0" y1="44" x2="320" y2="44" stroke="var(--fill1)" stroke-width="1"/>
      <line x1="0" y1="88" x2="320" y2="88" stroke="var(--fill1)" stroke-width="1"/>
      <path d="${area}" fill="url(#cfArea)"/>
      <rect x="0" y="${zeroY}" width="320" height="132" fill="rgba(180,85,58,.30)" clip-path="url(#cfClip)"/>
      <line x1="0" y1="${zeroY}" x2="320" y2="${zeroY}" stroke="var(--negSoft)" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <line x1="${X(nowIdx).toFixed(2)}" y1="0" x2="${X(nowIdx).toFixed(2)}" y2="132" stroke="var(--ink4)" stroke-width="1" stroke-dasharray="2 4"/>
      <line x1="${X(fi).toFixed(2)}" y1="0" x2="${X(fi).toFixed(2)}" y2="132" stroke="var(--gold2)" stroke-width="1"/>
      <circle cx="${X(fi).toFixed(2)}" cy="${Y(fp.v).toFixed(2)}" r="5" fill="var(--card)" stroke="var(--accent)" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    </svg>`;

  $("#focus-date").textContent = fp.d.getDate() + " " + MS[fp.d.getMonth()] + " " + fp.d.getFullYear();
  const fv = $("#focus-val");
  fv.textContent = fmt(fp.v);
  fv.classList.toggle("neg", fp.v < 0);

  const list = months();
  $("#chart-labels").innerHTML = [0, 2, 4, 6, 8, 10]
    .map((i) => `<span>${MS[parseK(list[i]).m]}</span>`).join("");
}

// Scrubben over de grafiek
(() => {
  const hit = $("#chart-hit");
  let active = false;
  const toIdx = (ev) => {
    const svg = hit.querySelector("svg");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    return Math.round(t * (series(null).length - 1));
  };
  hit.addEventListener("pointerdown", (ev) => {
    active = true; hit.setPointerCapture?.(ev.pointerId);
    const i = toIdx(ev); if (i != null) { S.focus = i; renderChart(); }
  });
  hit.addEventListener("pointermove", (ev) => {
    if (!active) return;
    const i = toIdx(ev); if (i != null) { S.focus = i; renderChart(); }
  });
  const up = () => { active = false; };
  hit.addEventListener("pointerup", up);
  hit.addEventListener("pointercancel", up);
})();

function renderMonthList() {
  const nowK = todayKey();
  const html = months().map((k) => {
    const nn = net(k), e = end(k), tot = Math.max(1, nn.inc + nn.out), p = parseK(k);
    const isNow = k === nowK;
    return `<button type="button" class="mrow" data-month="${k}">
      <span class="mrow-main">
        <span class="mrow-top">
          <span class="mrow-name">${MN[p.m]} ${p.y}</span>
          ${isNow ? '<span class="badge-now">NU</span>' : ""}
        </span>
        <span class="mrow-bar">
          <span class="in" style="width:${((nn.inc / tot) * 100).toFixed(1)}%"></span>
          <span class="out" style="width:${((nn.out / tot) * 100).toFixed(1)}%"></span>
        </span>
        <span class="mrow-flow">${fmt(nn.inc)} in · ${fmt(nn.out)} uit</span>
      </span>
      <span class="mrow-right">
        <span class="mrow-end tnum${e < 0 ? " neg" : ""}">${fmt(e)}</span>
        <span class="mrow-net">${nn.net >= 0 ? "+ " : "− "}${fmt(Math.abs(nn.net))}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>
    </button>`;
  }).join("");
  const box = $("#month-list");
  box.innerHTML = html;
  box.querySelectorAll("[data-month]").forEach((b) => {
    b.addEventListener("click", () => { S.month = b.dataset.month; S.pot = null; haptic(6); switchTab("maand"); });
  });
}

/* ---------- Maand ---------- */
function renderMonth() {
  const mk = S.month;
  if (S.pot && !D.pots.some((p) => p.id === S.pot)) S.pot = null;
  const p = parseK(mk);
  $("#month-title").textContent = MN[p.m] + " " + p.y;
  $("#prev-month").disabled = mk <= months()[0];
  $("#next-month").disabled = mk >= months()[11];

  const scope = S.pot ? (D.pots.find((x) => x.id === S.pot)?.label || "") : "alle potjes";
  $("#month-scope").textContent = "Saldo einde maand · " + scope;
  setBig($("#month-end"), end(mk, S.pot));
  $("#month-begin").textContent = "Begin van de maand " + fmt(begin(mk, S.pot));

  renderPots();
  renderHousehold();
  renderGroups();
}

function renderPots() {
  const mk = S.month;
  const chips = [{ id: null, label: "Alle potjes", icon: "◎", balance: end(mk), goal: 0, pace: null }]
    .concat(D.pots.map((p) => ({
      id: p.id, label: p.label, icon: p.icon, balance: end(mk, p.id),
      goal: p.goal, pace: pace(p, mk),
    })));
  const box = $("#pots");
  box.innerHTML = chips.map((c) => {
    const on = S.pot === c.id;
    const pct = c.goal ? Math.max(0, Math.min(100, (c.balance / c.goal) * 100)) : 0;
    const hasGoal = !!c.goal;
    return `<button type="button" class="pot${on ? " on" : ""}" role="tab" aria-selected="${on}" data-pot="${c.id == null ? "" : c.id}">
      <span class="pot-top">
        <span class="pot-ico" aria-hidden="true">${c.icon}</span>
        <span class="pot-pct">${hasGoal ? Math.round(pct) + "%" : ""}</span>
      </span>
      <span class="pot-label">${esc(c.label)}</span>
      <span class="pot-amt tnum${c.balance < 0 ? " neg" : ""}">${fmt(c.balance)}</span>
      ${hasGoal ? `<span class="pot-track"><span class="pot-fill" style="width:${pct.toFixed(0)}%"></span></span>
        <span class="pot-goal">van ${fmt(c.goal)}</span>
        ${c.pace ? `<span class="pot-pace${c.pace.diff < 0 ? " behind" : ""}">${c.pace.diff >= 0 ? "op schema" : "achter"} · ${fmt(Math.abs(c.pace.diff))} · ${c.pace.date}</span>` : ""}` : ""}
    </button>`;
  }).join("");
  box.querySelectorAll("[data-pot]").forEach((b) => {
    b.addEventListener("click", () => { S.pot = b.dataset.pot || null; haptic(8); renderMonth(); });
  });
}

function monthBuckets(mk) {
  const ps = posts(mk, S.pot);
  const totIn = ps.filter((p) => p.kind === "in").reduce((s, p) => s + p.amount, 0);
  const fixedPosts = ps.filter((p) => p.kind !== "in" && p.group !== "over");
  const overPosts = ps.filter((p) => p.group === "over");
  const totFixed = fixedPosts.reduce((s, p) => s + p.amount, 0);
  const totOver = overPosts.reduce((s, p) => s + p.amount, 0);
  return { ps, totIn, fixedPosts, overPosts, totFixed, totOver, left: totIn - totFixed, rest: totIn - totFixed - totOver };
}

function renderHousehold() {
  const mk = S.month;
  const b = monthBuckets(mk);
  const sp = safePoint();
  $("#hh-safe").innerHTML = sp.label
    ? `Veilig uit ${esc(sp.label)} tot ${sp.pt.getDate ? "" : ""}${sp.pt.d.getDate()} ${MS[sp.pt.d.getMonth()]} · <b class="${sp.pt.v < 0 ? "neg" : ""}">${fmt(Math.max(0, sp.pt.v))}</b>`
    : "";
  $("#hh-in").textContent = fmt(b.totIn);
  $("#hh-fixed").textContent = "− " + fmt(b.totFixed);
  $("#hh-left").textContent = fmt(b.left);

  const rows = b.overPosts.map((p, i) => ({ label: p.label, amount: p.amount, color: ALLOC_COLORS[i % ALLOC_COLORS.length] }));
  const bar = rows.map((r, i) => ({ pct: b.left > 0 ? (b.overPosts[i].amount / b.left) * 100 : 0, color: r.color }));
  if (b.rest > 0 && b.left > 0) bar.push({ pct: (b.rest / b.left) * 100, color: "var(--fill2)" });
  $("#hh-bar").innerHTML = bar.map((s) => `<span style="width:${s.pct.toFixed(1)}%;background:${s.color}"></span>`).join("");
  $("#hh-alloc").innerHTML = rows.map((r) => `<div class="alloc-row">
      <span class="alloc-dot" style="background:${r.color}"></span>
      <span class="alloc-label">${esc(r.label)}</span>
      <span class="alloc-amt tnum">${fmt(r.amount)}</span>
    </div>`).join("");
  const rest = $("#hh-rest");
  rest.textContent = fmt(b.rest);
  rest.classList.toggle("neg", b.rest < 0);

  const nn = net(mk, S.pot);
  $("#m-in").textContent = fmt(nn.inc);
  $("#m-out").textContent = fmt(nn.out);

  // Categoriechips (eenmalige uitgaven deze maand)
  const agg = {};
  b.ps.filter((p) => p.kind === "out" && p.category && !p.rec).forEach((p) => { agg[p.category] = (agg[p.category] || 0) + p.amount; });
  const chipbox = $("#cat-chips");
  chipbox.querySelectorAll(".catchip").forEach((n) => n.remove());
  CAT_KEYS.filter((k) => agg[k]).forEach((k) => {
    const el = document.createElement("div");
    el.className = "catchip";
    el.innerHTML = `<span aria-hidden="true">${CATS[k].icon}</span><span class="lb">${CATS[k].label}</span><span class="am tnum">${fmt(agg[k])}</span>`;
    chipbox.appendChild(el);
  });
}

/* ---------- Groepen met swipe ---------- */
function rowMeta(r) {
  const pot = D.pots.find((p) => p.id === r.potId);
  const toPot = r.toPot ? D.pots.find((p) => p.id === r.toPot) : null;
  const bits = [(r.day || 1) + "e", toPot ? `${pot ? pot.label : "—"} → ${toPot.label}` : (pot ? pot.label : "—")];
  bits.push(r.rec ? "↻ maandelijks" : "eenmalig");
  if (r.category && CATS[r.category]) bits.push(CATS[r.category].label);
  return bits.join(" · ");
}

function renderGroups() {
  const mk = S.month;
  const b = monthBuckets(mk);
  const once = b.ps.filter((p) => !p.rec);
  const defs = [
    { key: "in", title: "Inkomsten", rows: b.ps.filter((p) => p.kind === "in" && p.rec), total: fmt(b.totIn), cls: "pos", empty: "Geen inkomsten in dit potje." },
    { key: "fixed", title: "Vaste lasten", rows: b.fixedPosts.filter((p) => p.rec), total: "− " + fmt(b.fixedPosts.filter((p) => p.rec).reduce((s, p) => s + p.amount, 0)), cls: "neg", empty: "Geen vaste lasten." },
    { key: "over", title: "Verdeling van wat overblijft", rows: b.overPosts, total: fmt(b.totOver), cls: "", empty: "Nog niets verdeeld." },
    { key: "once", title: "Eenmalig deze maand", rows: once, total: fmt(once.reduce((s, p) => s + (p.kind === "in" ? p.amount : -p.amount), 0)), cls: "", empty: "Nog geen eenmalige posten deze maand." },
  ];

  const wrap = $("#groups");
  wrap.innerHTML = defs.map((g) => {
    const open = !S.collapsed[g.key];
    const rows = open ? g.rows.map((r, i) => {
      const dx = S.swipe && S.swipe.id === r.id ? S.swipe.dx : 0;
      const amt = r.kind === "in" ? "+ " + fmt(r.amount) : (r.kind === "move" ? fmt(r.amount) : "− " + fmt(r.amount));
      const cls = r.kind === "in" ? "pos" : (r.kind === "move" ? "" : "neg");
      const ico = r.kind === "move" ? "⇄" : (D.pots.find((p) => p.id === r.potId)?.icon || "💶");
      const hint = (!S.hintDone && g.key === "in" && i === 0) ? "animation:swipeHint 2.8s cubic-bezier(.22,1,.36,1) 1.4s 2" : "";
      return `<div class="swipe">
        <div class="swipe-actions">
          <button type="button" class="swipe-move" data-move="${r.id}">Verzet →</button>
          <button type="button" class="swipe-del" data-del="${r.id}">Wissen</button>
        </div>
        <button type="button" class="row" data-row="${r.id}" style="transform:translateX(${dx}px);${hint}">
          <span class="row-tile" aria-hidden="true">${ico}</span>
          <span class="row-main">
            <span class="row-top">
              <span class="row-label">${esc(r.label)}</span>
              ${r.review ? '<span class="dot-review" title="Te herzien"></span>' : ""}
            </span>
            <span class="row-meta">${esc(rowMeta(r))}</span>
          </span>
          <span class="row-amt tnum ${cls}">${amt}</span>
        </button>
      </div>`;
    }).join("") : "";
    return `<div class="group" style="margin-bottom:14px">
      <button type="button" class="group-btn" aria-expanded="${open}" data-group="${g.key}">
        <span class="gt">
          <span class="group-title">${g.title}</span>
          <span class="group-count">${g.rows.length === 1 ? "1 post" : g.rows.length + " posten"}</span>
        </span>
        <span class="group-total ${g.cls}">${g.total}</span>
        <span class="group-caret"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></span>
      </button>
      ${open ? (g.rows.length ? `<div style="display:flex;flex-direction:column;gap:8px">${rows}</div>` : `<div class="group-empty">${g.empty}</div>`) : ""}
    </div>`;
  }).join("");

  wrap.querySelectorAll("[data-group]").forEach((b2) => {
    b2.addEventListener("click", () => {
      const k = b2.dataset.group;
      S.collapsed = { ...S.collapsed, [k]: !S.collapsed[k] };
      S.swipe = null;
      renderGroups();
    });
  });

  const allRows = [].concat(...defs.map((g) => g.rows));
  const findRow = (id) => allRows.find((r) => r.id === id);

  wrap.querySelectorAll("[data-move]").forEach((b2) => b2.addEventListener("click", () => moveNext(findRow(b2.dataset.move))));
  wrap.querySelectorAll("[data-del]").forEach((b2) => b2.addEventListener("click", () => delRow(findRow(b2.dataset.del))));

  // Swipe + tap
  wrap.querySelectorAll("[data-row]").forEach((el) => {
    const id = el.dataset.row;
    let x0 = null, moved = false, base = 0;
    el.addEventListener("pointerdown", (ev) => {
      x0 = ev.clientX; moved = false;
      base = S.swipe && S.swipe.id === id ? S.swipe.dx : 0;
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (ev) => {
      if (x0 === null) return;
      const dx = Math.max(-150, Math.min(0, base + (ev.clientX - x0)));
      if (Math.abs(ev.clientX - x0) > 6) moved = true;
      if (moved) el.style.transform = `translateX(${dx}px)`;
    });
    const finish = (ev) => {
      if (x0 === null) return;
      el.classList.remove("dragging");
      const raw = base + ((ev.clientX ?? x0) - x0);
      x0 = null;
      if (!moved) {
        if (S.swipe) { S.swipe = null; renderGroups(); return; }
        const r = findRow(id);
        if (r) openEntry(r, S.month);
        return;
      }
      S.hintDone = true;
      const openIt = raw < -70;
      S.swipe = openIt ? { id, dx: -150 } : null;
      el.style.transform = `translateX(${openIt ? -150 : 0}px)`;
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", () => { x0 = null; el.classList.remove("dragging"); el.style.transform = `translateX(${S.swipe && S.swipe.id === id ? -150 : 0}px)`; });
  });
}

function moveNext(r) {
  if (!r) return;
  if (r.rec) { askChoice(r, "move"); return; }
  const nd = clone();
  const mk = S.month, nk = addM(mk, 1);
  nd.months[mk].entries = (nd.months[mk].entries || []).filter((e) => e.id !== r.id);
  nd.months[nk] = nd.months[nk] || { entries: [], skip: [] };
  const moved = { ...r }; delete moved.rec;
  nd.months[nk].entries.push(moved);
  commit(nd, `${r.label} → ${MN[parseK(nk).m]}`, () => {
    const b = clone();
    b.months[nk].entries = (b.months[nk].entries || []).filter((e) => e.id !== r.id);
    b.months[mk].entries.push(moved);
    return b;
  });
}
function delRow(r) {
  if (!r) return;
  if (r.rec) { askChoice(r, "del"); return; }
  const nd = clone(), mk = S.month;
  nd.months[mk].entries = (nd.months[mk].entries || []).filter((e) => e.id !== r.id);
  commit(nd, `${r.label} verwijderd`, () => {
    const b = clone();
    b.months[mk] = b.months[mk] || { entries: [], skip: [] };
    b.months[mk].entries.push({ ...r, rec: undefined });
    return b;
  });
}

function commit(next, msg, undoFactory) {
  const undoData = undoFactory ? undoFactory() : null;
  D = next;
  S.swipe = null;
  haptic(16);
  save();
  render();
  if (msg) toast(msg, undoData ? () => { D = undoData; save(); render(); } : null);
}

/* ---------- Vermogen ---------- */
function renderWealth() {
  const nowK = clampMonth(todayKey());
  const cash = end(nowK), inv = investTotal(), total = cash + inv;
  setBig($("#w-amount"), total);
  $("#w-sub").textContent = "Spaargeld + beleggingen · " + fmt(investMonthly()) + " per maand erbij";

  const segs = D.pots.map((p, i) => ({ label: p.label, value: Math.max(0, end(nowK, p.id)), color: ALLOC_COLORS[i % ALLOC_COLORS.length] }))
    .concat(D.investments.map((iv, i) => ({ label: iv.label, value: Math.max(0, Number(iv.value) || 0), color: i % 2 ? "var(--gold2)" : "var(--gold)" })))
    .filter((s) => s.value > 0);
  const sum = segs.reduce((s, x) => s + x.value, 0);
  $("#w-bar").innerHTML = sum > 0
    ? segs.map((s) => `<span style="width:${((s.value / sum) * 100).toFixed(1)}%;background:${s.color}"></span>`).join("")
    : `<span style="width:100%;background:var(--fill2)"></span>`;
  $("#w-alloc").innerHTML = sum > 0 ? segs.map((s) => `<div class="alloc-row">
      <span class="alloc-dot" style="background:${s.color}"></span>
      <span class="alloc-label">${esc(s.label)}</span>
      <span class="alloc-pct tnum">${Math.round((s.value / sum) * 100)}%</span>
      <span class="alloc-amt tnum">${fmt(s.value)}</span>
    </div>`).join("") : `<div class="group-empty">Nog niets om te verdelen.</div>`;

  // Beleggingen
  const il = $("#invest-list");
  il.innerHTML = D.investments.length ? D.investments.map((iv) => {
    const pct = inv > 0 ? Math.round((iv.value / inv) * 100) : 0;
    const meta = (iv.monthly ? fmt(iv.monthly) + " per maand" : "geen inleg") + (iv.updated ? " · bijgewerkt " + iv.updated : "");
    return `<button type="button" class="irow" data-inv="${iv.id}">
      <span class="row-tile" aria-hidden="true">📈</span>
      <span class="irow-main"><span class="irow-lbl">${esc(iv.label)}</span><span class="irow-meta">${esc(meta)}</span></span>
      <span class="irow-right"><span class="irow-amt tnum">${fmt(iv.value)}</span><span class="irow-pct">${pct}%</span></span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>
    </button>`;
  }).join("") : `<div class="group-empty">Nog geen beleggingen.</div>`;
  il.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", () => openInvest(D.investments.find((x) => x.id === b.dataset.inv))));

  // Spaargeld per potje
  $("#potsum-list").innerHTML = D.pots.map((p) => {
    const bal = end(nowK, p.id), pc = pace(p, nowK);
    const goal = p.goal ? `doel ${fmt(p.goal)}${pc ? " · " + (pc.diff >= 0 ? "op schema" : "achter") : ""}` : "geen doel";
    return `<div class="irow">
      <span class="row-tile" aria-hidden="true">${p.icon}</span>
      <span class="irow-main"><span class="irow-lbl">${esc(p.label)}</span><span class="irow-meta">${esc(goal)}</span></span>
      <span class="irow-amt tnum${bal < 0 ? " neg" : ""}">${fmt(bal)}</span>
    </div>`;
  }).join("");

  // Jaar per categorie
  const agg = {};
  for (const mk of months()) posts(mk, null).forEach((p) => {
    if (p.kind !== "out" || !p.category) return;
    agg[p.category] = (agg[p.category] || 0) + p.amount;
  });
  const keys = CAT_KEYS.filter((k) => agg[k]).sort((a, b) => agg[b] - agg[a]);
  const max = Math.max(1, ...keys.map((k) => agg[k]));
  const tot = keys.reduce((s, k) => s + agg[k], 0);
  $("#year-cats").innerHTML = keys.length ? keys.map((k, i) => `<div class="ycat">
      <div class="ycat-top">
        <span class="ycat-ico" aria-hidden="true">${CATS[k].icon}</span>
        <span class="ycat-lbl">${CATS[k].label}</span>
        <span class="ycat-pct tnum">${tot ? Math.round((agg[k] / tot) * 100) : 0}%</span>
        <span class="ycat-amt tnum">${fmt(agg[k])}</span>
      </div>
      <div class="ycat-track"><div class="ycat-fill" style="width:${((agg[k] / max) * 100).toFixed(0)}%;background:${ALLOC_COLORS[i % ALLOC_COLORS.length]}"></div></div>
    </div>`).join("") : `<div class="group-empty">Nog geen uitgaven met een categorie.</div>`;
}

/* ============================================================
   Tabs & navigatie
   ============================================================ */
function switchTab(name) {
  S.tab = name;
  S.swipe = null;
  render();
  $("#scroll").scrollTop = 0;
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { haptic(6); switchTab(b.dataset.tab); }));
$("#back-ov").addEventListener("click", () => { haptic(6); switchTab("overzicht"); });
$("#prev-month").addEventListener("click", () => { S.month = clampMonth(addM(S.month, -1)); render(); });
$("#next-month").addEventListener("click", () => { S.month = clampMonth(addM(S.month, 1)); render(); });

/* Privacy */
function togglePrivacy() {
  S.privacy = !S.privacy;
  haptic(8);
  document.querySelectorAll(".hero-amount").forEach((el) => shownVals.delete(el));
  render();
}
$("#hero-savings").addEventListener("click", togglePrivacy);
$("#hero-wealth").addEventListener("click", togglePrivacy);

/* ============================================================
   Sheets
   ============================================================ */
const scrim = $("#scrim");
const SHEETS = ["sh-entry", "sh-transfer", "sh-invest", "sh-settings", "sh-picker", "sh-choice"];
let lastFocus = null;

function openSheet(id) {
  lastFocus = document.activeElement;
  SHEETS.forEach((s) => { $("#" + s).hidden = s !== id; });
  scrim.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheets() {
  SHEETS.forEach((s) => { $("#" + s).hidden = true; });
  scrim.hidden = true;
  document.body.style.overflow = "";
  S.editId = null; S.draft = null; S.pickerFor = null;
  if (lastFocus?.focus) lastFocus.focus();
  render();
}
scrim.addEventListener("click", closeSheets);
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#quick").hidden) { closeQuick(); return; }
  if (SHEETS.some((s) => !$("#" + s).hidden)) closeSheets();
});

/* ---------- Post-sheet ---------- */
const F = { kind: "out", amount: "", label: "", potId: null, category: "overig", month: null, day: 1, repeat: false, editRec: false, group: undefined, review: false, toPot: null };

function quickAmountsFor(kind) {
  return kind === "in" ? [50, 100, 250, 500, 1000] : [10, 25, 50, 100, 250];
}

function openEntry(entry, mk) {
  S.editId = null; S.draft = null;
  F.month = clampMonth(mk || S.month);
  if (entry) {
    S.editId = entry.id;
    F.kind = entry.kind === "in" ? "in" : "out";
    F.amount = String(entry.amount);
    F.label = entry.label;
    F.potId = entry.potId;
    F.category = entry.category || "overig";
    F.day = entry.day || 1;
    F.repeat = !!entry.rec;
    F.editRec = !!entry.rec;
    F.group = entry.group;
    F.review = !!entry.review;
    F.toPot = entry.toPot || null;
    $("#entry-title").textContent = "Post bewerken";
    $("#entry-save").textContent = "Opslaan";
    $("#entry-del").hidden = false;
  } else {
    F.kind = "out"; F.amount = ""; F.label = "";
    F.potId = S.pot || (D.pots[0] && D.pots[0].id) || null;
    F.category = "overig"; F.day = Math.min(new Date().getDate(), dim(F.month));
    F.repeat = false; F.editRec = false; F.group = undefined; F.review = false; F.toPot = null;
    $("#entry-title").textContent = "Toevoegen";
    $("#entry-save").textContent = "Toevoegen";
    $("#entry-del").hidden = true;
  }
  $("#entry-error").hidden = true;
  syncEntry();
  openSheet("sh-entry");
}

function syncEntry() {
  $("#f-amount").value = F.amount;
  $("#f-label").value = F.label;
  $("#f-day").value = String(F.day);
  $("#f-month").textContent = MN[parseK(F.month).m] + " " + parseK(F.month).y;
  $("#f-repeat-sub").textContent = "Vanaf " + MN[parseK(F.month).m] + " " + parseK(F.month).y;
  $("#f-repeat").setAttribute("aria-checked", String(F.repeat));
  document.querySelectorAll("#sh-entry .seg button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.kind === F.kind)));
  $("#f-cat-wrap").hidden = F.kind !== "out";

  $("#f-quick").innerHTML = quickAmountsFor(F.kind).map((a) => `<button type="button" class="qbtn" data-amt="${a}">${fmt(a)}</button>`).join("");
  $("#f-quick").querySelectorAll("[data-amt]").forEach((b) => b.addEventListener("click", () => { F.amount = b.dataset.amt; syncEntry(); }));

  $("#f-recent").innerHTML = D.recentLabels.slice(0, 5).map((l) => `<button type="button" class="qbtn sm" data-lab="${esc(l)}">${esc(l)}</button>`).join("");
  $("#f-recent").querySelectorAll("[data-lab]").forEach((b) => b.addEventListener("click", () => { F.label = b.dataset.lab; $("#f-label").value = F.label; $("#f-amount").focus(); }));

  $("#f-pots").innerHTML = D.pots.map((p) => `<button type="button" class="opt" role="radio" aria-checked="${F.potId === p.id}" data-pot="${p.id}"><span aria-hidden="true">${p.icon}</span><span class="t">${esc(p.label)}</span></button>`).join("");
  $("#f-pots").querySelectorAll("[data-pot]").forEach((b) => b.addEventListener("click", () => { F.potId = b.dataset.pot; syncEntry(); }));

  $("#f-cats").innerHTML = CAT_KEYS.map((k) => `<button type="button" class="opt" role="radio" aria-checked="${F.category === k}" data-cat="${k}"><span aria-hidden="true">${CATS[k].icon}</span><span class="t">${CATS[k].label}</span></button>`).join("");
  $("#f-cats").querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { F.category = b.dataset.cat; syncEntry(); }));

  updateWhatIf();
}

function updateWhatIf() {
  const amt = parseAmount(F.amount);
  const box = $("#whatif");
  if (!Number.isFinite(amt) || amt <= 0) { box.hidden = true; S.draft = null; renderMonth(); return; }

  const baseSeries = series(null);
  S.draft = { id: "__draft", kind: F.kind, label: F.label || "Concept", amount: amt, day: F.day, potId: F.potId, category: F.category, month: F.month, group: F.group };
  const withSeries = series(null);
  box.hidden = false;

  const all = baseSeries.map((p) => p.v).concat(withSeries.map((p) => p.v));
  let lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  if (hi === lo) hi = lo + 1;
  const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;
  const PX = (i, n) => (n < 2 ? 0 : (i / (n - 1)) * 300);
  const PY = (v) => 50 - ((v - lo) / (hi - lo)) * 46;
  const path = (arr) => arr.map((p, i) => (i ? "L" : "M") + PX(i, arr.length).toFixed(1) + " " + PY(p.v).toFixed(1)).join(" ");

  $("#wi-svg").innerHTML =
    `<path d="${path(baseSeries)}" fill="none" stroke="var(--ink4)" stroke-width="1.4" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
     <path d="${path(withSeries)}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;

  const endDelta = withSeries.length && baseSeries.length ? withSeries[withSeries.length - 1].v - baseSeries[baseSeries.length - 1].v : 0;
  const dEl = $("#wi-delta");
  dEl.textContent = (endDelta >= 0 ? "+ " : "− ") + fmt(Math.abs(endDelta)) + " over 12 mnd";
  dEl.className = "whatif-delta tnum " + (endDelta >= 0 ? "pos" : "neg");

  const low = withSeries.reduce((a, p) => (p.v < a.v ? p : a), withSeries[0]);
  const lEl = $("#wi-low");
  lEl.textContent = `Laagste stand ${fmt(low.v)} op ${low.d.getDate()} ${MS[low.d.getMonth()]}`;
  lEl.classList.toggle("neg", low.v < 0);

  renderMonth();
}

$("#f-amount").addEventListener("input", (e) => { F.amount = e.target.value; updateWhatIf(); });
$("#f-label").addEventListener("input", (e) => { F.label = e.target.value; });
$("#f-day").addEventListener("input", (e) => {
  const v = Math.floor(Number(e.target.value));
  F.day = Number.isFinite(v) && v >= 1 ? Math.min(v, 31) : 1;
  updateWhatIf();
});
$("#f-repeat").addEventListener("click", () => { F.repeat = !F.repeat; syncEntry(); });
document.querySelectorAll("#sh-entry .seg button").forEach((b) => b.addEventListener("click", () => { F.kind = b.dataset.kind; syncEntry(); }));
$("#f-month").addEventListener("click", () => openPicker("entry", F.month));
$("#entry-transfer").addEventListener("click", () => openTransfer());

$("#sh-entry").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const label = F.label.trim();
  const amount = parseAmount(F.amount);
  const err = $("#entry-error");
  if (!Number.isFinite(amount) || amount <= 0) { err.textContent = "Vul een geldig bedrag in."; err.hidden = false; return; }
  if (!label) { err.textContent = "Vul een omschrijving in."; err.hidden = false; return; }
  if (!F.potId) { err.textContent = "Kies een potje."; err.hidden = false; return; }

  const editId = S.editId;
  const rec = { kind: F.kind, label, amount, day: F.day, potId: F.potId };
  if (F.kind === "out") rec.category = F.category;
  if (F.group) rec.group = F.group;
  if (F.review) rec.review = true;

  const nd = clone();
  if (editId) {
    nd.recurring = nd.recurring.filter((r) => r.id !== editId);
    Object.keys(nd.months).forEach((k) => {
      nd.months[k].entries = (nd.months[k].entries || []).filter((e) => e.id !== editId);
    });
  }
  if (F.repeat) nd.recurring.push({ id: editId || uid(), fromMonth: F.month, ...rec });
  else {
    nd.months[F.month] = nd.months[F.month] || { entries: [], skip: [] };
    nd.months[F.month].entries.push({ id: editId || uid(), ...rec });
  }
  nd.recentLabels = [label].concat((nd.recentLabels || []).filter((x) => x.toLowerCase() !== label.toLowerCase())).slice(0, 8);

  S.editId = null; S.draft = null;
  S.month = F.month;
  D = nd; save();
  closeSheets();
  burst(10);
});

$("#entry-del").addEventListener("click", () => {
  const id = S.editId;
  if (!id) return;
  const inRec = D.recurring.find((r) => r.id === id);
  if (inRec) { const r = { ...inRec, rec: true }; S.editId = null; closeSheets(); askChoice(r, "del"); return; }
  const mk = S.month;
  const nd = clone();
  const removed = (nd.months[mk]?.entries || []).find((e) => e.id === id);
  nd.months[mk].entries = (nd.months[mk].entries || []).filter((e) => e.id !== id);
  S.editId = null;
  closeSheets();
  commit(nd, (removed?.label || "Post") + " verwijderd", () => {
    const b = clone();
    b.months[mk] = b.months[mk] || { entries: [], skip: [] };
    if (removed) b.months[mk].entries.push(removed);
    return b;
  });
});

/* ---------- Overboeken ---------- */
const T = { amount: "", from: null, to: null, month: null, day: 1, repeat: false };
function openTransfer() {
  T.amount = ""; T.month = clampMonth(S.month); T.day = Math.min(new Date().getDate(), dim(T.month));
  T.from = D.pots[0]?.id || null;
  T.to = D.pots[1]?.id || D.pots[0]?.id || null;
  T.repeat = false;
  $("#tf-error").hidden = true;
  syncTransfer();
  openSheet("sh-transfer");
}
function syncTransfer() {
  $("#tf-amount").value = T.amount;
  $("#tf-day").value = String(T.day);
  $("#tf-month").textContent = MN[parseK(T.month).m] + " " + parseK(T.month).y;
  $("#tf-repeat").setAttribute("aria-checked", String(T.repeat));
  const fromP = D.pots.find((p) => p.id === T.from), toP = D.pots.find((p) => p.id === T.to);
  $("#tf-summary").textContent = fromP && toP ? `Van ${fromP.label} naar ${toP.label}` : "Kies twee potjes";
  $("#tf-from").innerHTML = D.pots.map((p) => `<button type="button" class="opt box" role="radio" aria-checked="${T.from === p.id}" data-from="${p.id}"><span aria-hidden="true">${p.icon}</span><span class="t">${esc(p.label)}</span><span class="sub">${fmt(end(T.month, p.id))}</span></button>`).join("");
  $("#tf-to").innerHTML = D.pots.filter((p) => p.id !== T.from).map((p) => `<button type="button" class="opt" role="radio" aria-checked="${T.to === p.id}" data-to="${p.id}"><span aria-hidden="true">${p.icon}</span><span class="t">${esc(p.label)}</span></button>`).join("");
  $("#tf-from").querySelectorAll("[data-from]").forEach((b) => b.addEventListener("click", () => {
    T.from = b.dataset.from;
    if (T.to === T.from) T.to = D.pots.find((p) => p.id !== T.from)?.id || null;
    syncTransfer();
  }));
  $("#tf-to").querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => { T.to = b.dataset.to; syncTransfer(); }));
}
$("#open-transfer").addEventListener("click", () => { haptic(8); openTransfer(); });
$("#tf-amount").addEventListener("input", (e) => { T.amount = e.target.value; });
$("#tf-day").addEventListener("input", (e) => {
  const v = Math.floor(Number(e.target.value));
  T.day = Number.isFinite(v) && v >= 1 ? Math.min(v, 31) : 1;
});
$("#tf-repeat").addEventListener("click", () => { T.repeat = !T.repeat; syncTransfer(); });
$("#sh-transfer").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const amount = parseAmount(T.amount);
  const err = $("#tf-error");
  if (!Number.isFinite(amount) || amount <= 0) { err.textContent = "Vul een geldig bedrag in."; err.hidden = false; return; }
  if (!T.from || !T.to || T.from === T.to) { err.textContent = "Kies twee verschillende potjes."; err.hidden = false; return; }
  const fromP = D.pots.find((p) => p.id === T.from), toP = D.pots.find((p) => p.id === T.to);
  const rec = { kind: "move", group: "over", label: `Naar ${toP.label}`, amount, day: T.day, potId: T.from, toPot: T.to };
  const nd = clone();
  if (T.repeat) nd.recurring.push({ id: uid(), fromMonth: T.month, ...rec });
  else {
    nd.months[T.month] = nd.months[T.month] || { entries: [], skip: [] };
    nd.months[T.month].entries.push({ id: uid(), ...rec });
  }
  S.month = T.month;
  D = nd; save();
  closeSheets();
  toast(`${fmt(amount)} van ${fromP.label} naar ${toP.label}`);
  burst(8);
});

/* ---------- Belegging ---------- */
const IV = { id: null, label: "", value: "", monthly: "" };
function openInvest(inv) {
  if (inv) {
    IV.id = inv.id; IV.label = inv.label; IV.value = String(inv.value); IV.monthly = String(inv.monthly || 0);
    $("#iv-title").textContent = "Belegging bewerken";
    $("#iv-sub").textContent = inv.updated ? "Laatst bijgewerkt " + inv.updated : "Werk de waarde handmatig bij";
    $("#iv-del").hidden = false;
    $("#iv-save").textContent = "Opslaan";
  } else {
    IV.id = null; IV.label = ""; IV.value = ""; IV.monthly = "";
    $("#iv-title").textContent = "Belegging toevoegen";
    $("#iv-sub").textContent = "Werk de waarde handmatig bij";
    $("#iv-del").hidden = true;
    $("#iv-save").textContent = "Toevoegen";
  }
  $("#iv-error").hidden = true;
  syncInvest();
  openSheet("sh-invest");
}
function syncInvest() {
  $("#iv-label").value = IV.label;
  $("#iv-value").value = IV.value;
  $("#iv-monthly").value = IV.monthly;
  const cur = parseAmount(IV.value) || 0;
  const nudges = [-5, -1, 1, 5].map((pct) => ({ pct, v: Math.round(cur * (1 + pct / 100)) }));
  $("#iv-nudges").innerHTML = cur > 0
    ? nudges.map((n) => `<button type="button" class="qbtn" data-val="${n.v}" style="color:${n.pct < 0 ? "var(--neg)" : "var(--pos)"}">${n.pct > 0 ? "+" : ""}${n.pct}%</button>`).join("")
    : "";
  $("#iv-nudges").querySelectorAll("[data-val]").forEach((b) => b.addEventListener("click", () => { IV.value = b.dataset.val; syncInvest(); }));

  $("#iv-monthly-quick").innerHTML = [0, 100, 250, 500].map((a) => {
    const on = String(a) === String(parseAmount(IV.monthly) || 0);
    return `<button type="button" class="qbtn" data-m="${a}" style="${on ? "background:var(--hero);border-color:transparent;color:#fff" : ""}">${a === 0 ? "geen" : fmt(a)}</button>`;
  }).join("");
  $("#iv-monthly-quick").querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { IV.monthly = b.dataset.m; syncInvest(); }));

  const m = parseAmount(IV.monthly) || 0;
  $("#iv-hint").textContent = m > 0
    ? `Met ${fmt(m)} per maand leg je er ${fmt(m * 12)} per jaar bij. Dit telt mee in je vermogen, niet in je spaargeld.`
    : "Vul een maandelijkse inleg in om te zien hoeveel je er per jaar bij legt.";
}
$("#iv-label").addEventListener("input", (e) => { IV.label = e.target.value; });
$("#iv-value").addEventListener("input", (e) => { IV.value = e.target.value; });
$("#iv-monthly").addEventListener("input", (e) => { IV.monthly = e.target.value; });
$("#add-invest").addEventListener("click", () => openInvest(null));
$("#sh-invest").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const label = IV.label.trim();
  const value = parseAmount(IV.value);
  const monthly = parseAmount(IV.monthly);
  const err = $("#iv-error");
  if (!label) { err.textContent = "Vul een naam in."; err.hidden = false; return; }
  if (!Number.isFinite(value) || value < 0) { err.textContent = "Vul een geldige waarde in."; err.hidden = false; return; }
  const today = new Date().toISOString().slice(0, 10);
  const nd = clone();
  if (IV.id) {
    const x = nd.investments.find((i) => i.id === IV.id);
    if (x) { x.label = label; x.value = value; x.monthly = Number.isFinite(monthly) ? monthly : 0; x.updated = today; }
  } else {
    nd.investments.push({ id: uid(), label, value, monthly: Number.isFinite(monthly) ? monthly : 0, updated: today });
  }
  D = nd; save();
  closeSheets();
  burst(8);
});
$("#iv-del").addEventListener("click", () => {
  if (!IV.id) return;
  const nd = clone();
  const idx = nd.investments.findIndex((i) => i.id === IV.id);
  const removed = idx >= 0 ? nd.investments.splice(idx, 1)[0] : null;
  closeSheets();
  commit(nd, (removed?.label || "Belegging") + " verwijderd", () => {
    const b = clone();
    if (removed) b.investments.splice(idx, 0, removed);
    return b;
  });
});

/* ---------- Keuze bij terugkerende post ---------- */
let choiceCtx = null;
function askChoice(r, mode) {
  choiceCtx = { r, mode, month: S.month };
  $("#choice-title").textContent = mode === "del" ? "Verwijderen" : "Verzetten";
  $("#choice-body").textContent = `“${r.label}” is een terugkerende post. Wat wil je doen?`;
  $("#choice-once").textContent = mode === "del" ? "Alleen deze maand overslaan" : "Alleen deze maand verzetten";
  $("#choice-all").textContent = mode === "del" ? "Elke maand verwijderen" : "Vanaf nu elke maand later";
  openSheet("sh-choice");
}
$("#choice-once").addEventListener("click", () => {
  const { r, month } = choiceCtx;
  const nd = clone();
  nd.months[month] = nd.months[month] || { entries: [], skip: [] };
  if (!nd.months[month].skip.includes(r.id)) nd.months[month].skip.push(r.id);
  if (choiceCtx.mode === "move") {
    const nk = addM(month, 1);
    nd.months[nk] = nd.months[nk] || { entries: [], skip: [] };
    nd.months[nk].entries.push({ ...r, id: uid(), rec: undefined });
  }
  closeSheets();
  commit(nd, choiceCtx.mode === "del" ? "Overgeslagen deze maand" : `${r.label} → volgende maand`, () => clone());
});
$("#choice-all").addEventListener("click", () => {
  const { r, month, mode } = choiceCtx;
  const nd = clone();
  if (mode === "del") {
    nd.recurring = nd.recurring.filter((x) => x.id !== r.id);
  } else {
    const x = nd.recurring.find((y) => y.id === r.id);
    if (x) x.day = Math.min(31, (x.day || 1) + 7);
  }
  closeSheets();
  commit(nd, mode === "del" ? `${r.label} verwijderd` : `${r.label} een week later`, () => clone());
});

/* ---------- Maandkiezer ---------- */
function openPicker(forWhat, current) {
  S.pickerFor = forWhat;
  S.pickerYear = parseK(current || S.month).y;
  renderPicker(current);
  openSheet("sh-picker");
}
function renderPicker(current) {
  $("#mp-year").textContent = String(S.pickerYear);
  const list = months();
  const min = list[0], max = S.pickerFor === "goal" ? "9999-12" : list[11];
  $("#mp-grid").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const k = key(S.pickerYear, i);
    const dis = k < min || k > max;
    return `<button type="button" class="mp-cell" data-k="${k}" aria-selected="${k === current}" ${dis ? "disabled" : ""}>${MS[i]}</button>`;
  }).join("");
  $("#mp-grid").querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => pickMonth(b.dataset.k)));
}
$("#mp-prev").addEventListener("click", () => { S.pickerYear--; renderPicker(null); });
$("#mp-next").addEventListener("click", () => { S.pickerYear++; renderPicker(null); });

function pickMonth(k) {
  const what = S.pickerFor;
  haptic(6);
  if (what === "entry") {
    F.month = k;
    S.pickerFor = null;
    $("#sh-picker").hidden = true;
    openSheet("sh-entry");
    syncEntry();
    return;
  }
  if (what === "start") {
    const nd = clone();
    nd.startMonth = k;
    D = nd; save();
    S.month = clampMonth(S.month);
    $("#sh-picker").hidden = true;
    openSheet("sh-settings");
    renderSettings();
    render();
    return;
  }
  if (what && what.startsWith("goal:")) {
    const id = what.slice(5);
    const nd = clone();
    const p = nd.pots.find((x) => x.id === id);
    if (p) p.goalDate = k;
    D = nd; save();
    $("#sh-picker").hidden = true;
    openSheet("sh-settings");
    renderSettings();
    render();
    return;
  }
  // maandnavigatie
  S.month = clampMonth(k);
  closeSheets();
  switchTab("maand");
}
$("#month-title").addEventListener("click", () => openPicker("nav", S.month));

/* ---------- Instellingen ---------- */
function renderSettings() {
  applyTheme(themePref());
  const nowK = clampMonth(todayKey());
  $("#pot-total").textContent = fmt(end(nowK)) + " totaal";
  $("#start-month-label").textContent = MN[parseK(D.startMonth).m] + " " + parseK(D.startMonth).y;
  $("#backup-label").textContent = D.lastBackup ? "Laatste back-up: " + D.lastBackup : "Nog geen back-up gemaakt";

  const box = $("#pot-manage");
  box.innerHTML = D.pots.map((p) => `<div class="pot-edit" data-pid="${p.id}">
      <div class="pe-top">
        <button type="button" class="pe-ico" data-icon aria-label="Ander icoon">${p.icon}</button>
        <input class="pe-name" data-name value="${esc(p.label)}" aria-label="Naam potje" />
        <button type="button" class="pe-del" data-rm aria-label="Potje verwijderen">×</button>
      </div>
      <div class="pe-grid">
        <label class="pe-money"><span class="k">Start</span><span class="c">€</span><input data-start inputmode="numeric" aria-label="Beginsaldo" value="${p.startBalance || ""}" /></label>
        <label class="pe-money"><span class="k">Doel</span><span class="c">€</span><input data-goal inputmode="numeric" placeholder="geen" aria-label="Doelbedrag" value="${p.goal || ""}" /></label>
      </div>
      <button type="button" class="pe-goaldate" data-gd>
        <span class="l">Doel klaar in</span>
        <span class="v">${p.goalDate ? MS[parseK(p.goalDate).m] + " " + parseK(p.goalDate).y : "geen datum"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>
      </button>
    </div>`).join("");

  box.querySelectorAll(".pot-edit").forEach((card) => {
    const id = card.dataset.pid;
    const pot = () => D.pots.find((p) => p.id === id);
    card.querySelector("[data-icon]").addEventListener("click", () => {
      const p = pot(); if (!p) return;
      const i = POT_ICONS.indexOf(p.icon);
      const nd = clone();
      nd.pots.find((x) => x.id === id).icon = POT_ICONS[(i + 1) % POT_ICONS.length];
      D = nd; save(); renderSettings(); render();
    });
    card.querySelector("[data-name]").addEventListener("change", (e) => {
      const nd = clone();
      nd.pots.find((x) => x.id === id).label = e.target.value.trim() || "Potje";
      D = nd; save(); render();
    });
    card.querySelector("[data-start]").addEventListener("change", (e) => {
      const v = parseAmount(e.target.value);
      const nd = clone();
      nd.pots.find((x) => x.id === id).startBalance = Number.isFinite(v) ? v : 0;
      D = nd; save(); renderSettings(); render();
    });
    card.querySelector("[data-goal]").addEventListener("change", (e) => {
      const v = parseAmount(e.target.value);
      const nd = clone();
      nd.pots.find((x) => x.id === id).goal = Number.isFinite(v) && v > 0 ? v : 0;
      D = nd; save(); render();
    });
    card.querySelector("[data-gd]").addEventListener("click", () => {
      $("#sh-settings").hidden = true;
      openPicker("goal:" + id, pot()?.goalDate || null);
    });
    card.querySelector("[data-rm]").addEventListener("click", () => {
      if (D.pots.length <= 1) { toast("Je hebt minstens één potje nodig"); return; }
      const nd = clone();
      const idx = nd.pots.findIndex((p) => p.id === id);
      const removed = nd.pots.splice(idx, 1)[0];
      D = nd; save(); renderSettings(); render();
      toast(`${removed.label} verwijderd`, () => {
        const b = clone(); b.pots.splice(idx, 0, removed); D = b; save(); renderSettings(); render();
      });
    });
  });
}
$("#pot-add").addEventListener("click", () => {
  const nd = clone();
  nd.pots.push({ id: uid(), label: "Nieuw potje", icon: POT_ICONS[nd.pots.length % POT_ICONS.length], startBalance: 0, goal: 0, goalDate: null });
  D = nd; save(); haptic(10); renderSettings(); render();
});
$("#start-month").addEventListener("click", () => { $("#sh-settings").hidden = true; openPicker("start", D.startMonth); });
function openSettings() { renderSettings(); openSheet("sh-settings"); }
$("#btn-settings").addEventListener("click", openSettings);
$("#empty-setup").addEventListener("click", openSettings);

/* Back-up */
function doExport() {
  const blob = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `huishoudboekje-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  const nd = clone();
  nd.lastBackup = new Date().toISOString().slice(0, 10);
  D = nd; save(); render(); renderSettings();
  toast("Back-up gemaakt");
}
$("#btn-export").addEventListener("click", doExport);
$("#backup-now").addEventListener("click", doExport);
$("#backup-later").addEventListener("click", () => {
  const nd = clone(); nd.backupDismissed = true; D = nd; save(); render();
});

const importFile = $("#import-file");
$("#btn-import").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== "object" || !data) throw new Error("ongeldig");
    D = migrate(data);
    S.month = clampMonth(todayKey());
    S.pot = null;
    save();
    closeSheets();
    toast("Back-up geïmporteerd");
  } catch { toast("Kon dit bestand niet lezen"); }
  finally { importFile.value = ""; }
});
$("#btn-reset").addEventListener("click", () => {
  const snap = JSON.stringify(D);
  D = defaultState();
  S.month = clampMonth(todayKey()); S.pot = null;
  save();
  closeSheets();
  toast("Alles gewist", () => { D = migrate(JSON.parse(snap)); save(); render(); });
});

/* ============================================================
   FAB + snelmenu
   ============================================================ */
const quick = $("#quick"), quickScrim = $("#quick-scrim");
function openQuick() {
  const items = D.recurring.filter((r) => r.kind === "out").slice(0, 3);
  const src = items.length ? items : D.recentLabels.slice(0, 3).map((l) => ({ label: l, amount: 0, category: "overig" }));
  $("#quick-items").innerHTML = src.length ? src.map((r, i) => `<button type="button" class="quick-item" data-q="${i}">
      <span class="quick-tile" aria-hidden="true">${CATS[r.category] ? CATS[r.category].icon : "💶"}</span>
      <span class="quick-label">${esc(r.label)}</span>
      <span class="quick-amt tnum">${r.amount ? fmt(r.amount) : ""}</span>
    </button>`).join("") : `<div class="group-empty" style="margin:4px 0">Nog geen vaste posten om te herhalen.</div>`;
  $("#quick-items").querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    const r = src[+b.dataset.q];
    closeQuick();
    openEntry(null, S.month);
    F.kind = "out"; F.label = r.label; F.amount = r.amount ? String(r.amount) : "";
    F.category = r.category || "overig";
    if (r.potId) F.potId = r.potId;
    syncEntry();
  }));
  quick.hidden = false; quickScrim.hidden = false;
}
function closeQuick() { quick.hidden = true; quickScrim.hidden = true; }
quickScrim.addEventListener("click", closeQuick);
$("#quick-all").addEventListener("click", () => { closeQuick(); openEntry(null, S.month); });

(() => {
  const fab = $("#fab");
  let timer = null, longFired = false;
  fab.addEventListener("pointerdown", () => {
    longFired = false;
    timer = setTimeout(() => { longFired = true; haptic(18); openQuick(); }, 450);
  });
  const cancel = () => { clearTimeout(timer); };
  fab.addEventListener("pointerup", cancel);
  fab.addEventListener("pointerleave", cancel);
  fab.addEventListener("pointercancel", cancel);
  fab.addEventListener("click", () => {
    if (longFired) { longFired = false; return; }
    haptic(10);
    if (S.tab === "vermogen") openInvest(null);
    else openEntry(null, S.month);
  });
})();

/* Waarschuwing oplossen: vul aan uit het rijkste andere potje */
$("#warn-fix").addEventListener("click", () => {
  const warn = firstWarning();
  if (!warn) return;
  const need = Math.ceil(Math.abs(warn.v) / 50) * 50;
  const wk = key(warn.d.getFullYear(), warn.d.getMonth());
  const src = D.pots.filter((p) => p.id !== warn.pot.id).sort((a, b) => end(wk, b.id) - end(wk, a.id))[0];
  if (!src) { toast("Geen ander potje om uit te halen"); return; }
  openTransfer();
  T.from = src.id; T.to = warn.pot.id; T.amount = String(need);
  T.month = clampMonth(wk); T.day = Math.max(1, warn.d.getDate() - 1);
  syncTransfer();
});

/* ============================================================
   Toast · confetti · loader
   ============================================================ */
const toastEl = $("#toast"), toastText = $("#toast-text"), toastUndo = $("#toast-undo");
let toastTimer = null;
function toast(msg, undo) {
  clearTimeout(toastTimer);
  toastText.textContent = msg;
  if (undo) {
    toastUndo.hidden = false;
    toastUndo.onclick = () => { clearTimeout(toastTimer); toastEl.hidden = true; undo(); };
  } else { toastUndo.hidden = true; toastUndo.onclick = null; }
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

function burst(n) {
  if (REDUCED) return;
  const chars = ["💶", "🪙", "💰", "€", "💶", "🪙"];
  const box = $("#conf");
  box.innerHTML = Array.from({ length: n }, (_, i) => {
    const left = Math.round(Math.random() * 92) + 2;
    const size = 18 + Math.round(Math.random() * 16);
    const dur = (1.5 + Math.random() * 0.9).toFixed(2);
    const delay = (Math.random() * 0.5).toFixed(2);
    const spin = (0.9 + Math.random() * 0.9).toFixed(2);
    return `<div style="left:${left}%;animation:confFall ${dur}s cubic-bezier(.35,.6,.5,1) ${delay}s both">
      <i style="font-size:${size}px;animation:confSpin ${spin}s linear ${delay}s infinite">${chars[i % chars.length]}</i></div>`;
  }).join("");
  clearTimeout(burst._t);
  burst._t = setTimeout(() => { box.innerHTML = ""; }, 2900);
}

const loader = $("#loader");
function runLoader(ms) {
  loader.hidden = false;
  clearTimeout(runLoader._t);
  runLoader._t = setTimeout(() => { loader.hidden = true; }, ms || 1500);
}
$("#coin").addEventListener("click", () => runLoader(1600));

/* ============================================================
   Init
   ============================================================ */
render();
if (REDUCED) loader.hidden = true; else runLoader(1500);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
