// ============================================================
//  Budget · state, berekeningen en UI
// ============================================================

const STORAGE_KEY = "budget-glass-v1";

/* ---------- Categorieën (voor aankopen) ---------- */
const CATS = {
  baby:   { label: "Baby",   color: "#D96BA0", icon: "🍼" },
  huis:   { label: "Huis",   color: "#3E7CB1", icon: "🏠" },
  overig: { label: "Overig", color: "#C99A2E", icon: "🏷️" },
};
const CAT_KEYS = Object.keys(CATS);
const DEFAULT_CAT = "overig";
const catOf = (e) => (CATS[e?.category] ? e.category : DEFAULT_CAT);

/* ---------- Standaard spaarpotjes ---------- */
const DEFAULT_POTS = [
  { id: "algemeen", label: "Algemeen", startBalance: 0, goal: 0, icon: "🐷" },
  { id: "vakantie", label: "Vakantie", startBalance: 0, goal: 0, icon: "🏖️" },
  { id: "auto", label: "Auto", startBalance: 0, goal: 0, icon: "🚗" },
];
const POT_COLORS = ["#1B4D3E", "#2E8B6B", "#57B894", "#8FD3B6", "#3AA57D"];
const INV_COLORS = ["#3E7CB1", "#B4482E", "#C99A2E", "#7A5CC0", "#D96BA0"];

function guessIcon(label) {
  const l = (label || "").toLowerCase();
  if (/vakantie|reis|trip|holiday|vlieg/.test(l)) return "🏖️";
  if (/auto|car|wagen|scooter|fiets/.test(l)) return "🚗";
  if (/huis|home|hypotheek|wonen|verbouw|keuken|meubel/.test(l)) return "🏠";
  if (/baby|kind|kids|luier/.test(l)) return "🍼";
  if (/nood|buffer|reserve/.test(l)) return "🛟";
  if (/beleg|invest|aandeel|etf/.test(l)) return "📈";
  if (/cadeau|gift|kerst|sint/.test(l)) return "🎁";
  return "🐷";
}

/* ---------- Formatters ---------- */
const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const monthFmt = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("nl-NL", { month: "short" });
const monthOnlyFmt = new Intl.DateTimeFormat("nl-NL", { month: "long" });

/* ---------- Maand-helpers (sleutel = "YYYY-MM") ---------- */
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function keyToDate(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1); }
function addMonths(key, n) { const d = keyToDate(key); d.setMonth(d.getMonth() + n); return monthKey(d); }
function monthName(key) { return monthFmt.format(keyToDate(key)); }
function currentMonthKey() { return monthKey(new Date()); }
function daysInMonth(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function clampDay(day, dim) { const d = Math.floor(Number(day)); if (!Number.isFinite(d) || d < 1) return 1; return Math.min(d, dim); }
function monthsBetween(a, b) { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return (by - ay) * 12 + (bm - am); }
function maxKey(a, b) { return a >= b ? a : b; }
function todayDay() { return new Date().getDate(); }

/* ---------- Bedrag parsen ---------- */
function parseAmount(raw) {
  if (typeof raw !== "string") return NaN;
  let s = raw.trim().replace(/[€\s]/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* ---------- Haptiek ---------- */
function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch { /* n.v.t. */ } }

/* ============================================================
   Thema: 'auto' (systeem) | 'light' | 'dark'
   Los van de budget-state opgeslagen, zodat de inline head-script het
   vóór de eerste paint kan lezen.
   ============================================================ */
const THEME_KEY = "budget-theme";
const sysDark = window.matchMedia("(prefers-color-scheme: dark)");

function getThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch { return "auto"; }
}
function resolvedDark(pref) {
  return pref === "dark" || (pref === "auto" && sysDark.matches);
}
function applyTheme(pref) {
  const dark = resolvedDark(pref);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.getElementById("meta-theme-color");
  if (meta) meta.setAttribute("content", dark ? "#08120f" : "#ffffff");
  syncThemeSeg(pref);
}
function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* n.v.t. */ }
  applyTheme(pref);
}
function syncThemeSeg(pref) {
  document.querySelectorAll("#theme-seg .seg-opt").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.themeOpt === pref));
  });
}
document.querySelectorAll("#theme-seg .seg-opt").forEach((b) => {
  b.addEventListener("click", () => { haptic(8); setThemePref(b.dataset.themeOpt); });
});
// Volgt het systeem alleen wanneer de voorkeur 'auto' is
sysDark.addEventListener("change", () => { if (getThemePref() === "auto") applyTheme("auto"); });
applyTheme(getThemePref());

/* ============================================================
   State
   ============================================================ */
function defaultState() {
  return {
    version: 4,
    startMonth: currentMonthKey(),
    pots: DEFAULT_POTS.map((p) => ({ ...p })),
    recurring: [],
    months: {},
    investments: [],
    recentLabels: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultState(), ...parsed };
    if (parsed && parsed.pots === undefined) {
      merged.pots = DEFAULT_POTS.map((p) => ({ ...p }));
      if (typeof parsed.startBalance === "number") merged.pots[0].startBalance = parsed.startBalance;
    }
    if (!Array.isArray(merged.pots) || merged.pots.length === 0) merged.pots = DEFAULT_POTS.map((p) => ({ ...p }));
    merged.pots = merged.pots.map((p) => ({ goal: 0, icon: guessIcon(p.label), ...p }));
    if (!Array.isArray(merged.recentLabels)) merged.recentLabels = [];
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* vol/geblokkeerd */ }
}

let state = loadState();
let viewMonth = clampToStart(currentMonthKey());
let selectedPot = "all";
let activeTab = "overzicht";
let mpYear = Number(currentMonthKey().slice(0, 4));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- Potjes-helpers ---------- */
function firstPotId() { return state.pots[0] ? state.pots[0].id : "algemeen"; }
function getPot(id) { return state.pots.find((p) => p.id === id) || null; }
function potOf(e) { return getPot(e?.potId) ? e.potId : firstPotId(); }

/* ============================================================
   Berekeningen
   ============================================================ */
function monthData(key) { return state.months[key] || { entries: [], skip: [] }; }

function entriesForMonth(key) {
  const md = monthData(key);
  const skip = md.skip || [];
  const oneOff = (md.entries || []).map((e) => ({ ...e, recurring: false }));
  const recurring = state.recurring
    .filter((r) => r.fromMonth <= key && !skip.includes(r.id))
    .map((r) => ({ ...r, recurring: true }));
  return [...recurring, ...oneOff];
}

function monthNet(key, potId) {
  let inc = 0, out = 0;
  for (const e of entriesForMonth(key)) {
    if (potId && potOf(e) !== potId) continue;
    if (e.kind === "in") inc += e.amount; else out += e.amount;
  }
  return { inc, out, net: inc - out };
}

function startSum(potId) {
  if (potId) return getPot(potId)?.startBalance || 0;
  return state.pots.reduce((s, p) => s + (p.startBalance || 0), 0);
}

function beginBalance(key, potId) {
  let bal = startSum(potId);
  let cursor = state.startMonth;
  while (cursor < key) { bal += monthNet(cursor, potId).net; cursor = addMonths(cursor, 1); }
  return bal;
}
function endBalance(key, potId) { return beginBalance(key, potId) + monthNet(key, potId).net; }
function clampToStart(key) { return key < state.startMonth ? state.startMonth : key; }
function liquidNow() { return endBalance(clampToStart(currentMonthKey())); }
function investTotal() { return state.investments.reduce((s, i) => s + (Number(i.value) || 0), 0); }

// Horizon voor grafiek/lijst
function chartSpan() {
  const start = state.startMonth;
  const endM = addMonths(maxKey(viewMonth, currentMonthKey()), 6);
  return Math.max(5, Math.min(17, monthsBetween(start, endM)));
}

// Eerste dag waarop een potje onder nul komt (of null)
function firstNegative(potId) {
  const start = state.startMonth;
  const span = chartSpan();
  let bal = startSum(potId);
  let mk = start;
  for (let mi = 0; mi <= span; mi++) {
    const dim = daysInMonth(mk);
    const deltas = new Array(dim + 1).fill(0);
    for (const e of entriesForMonth(mk)) {
      if (potOf(e) !== potId) continue;
      deltas[clampDay(e.day, dim)] += e.kind === "in" ? e.amount : -e.amount;
    }
    for (let d = 1; d <= dim; d++) { bal += deltas[d]; if (bal < 0) return { key: mk, day: d, amount: bal }; }
    mk = addMonths(mk, 1);
  }
  return null;
}

/* ============================================================
   DOM refs
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const els = {
  brandName: $("#brand-name"),
  // overzicht
  ovNow: $("#ov-now"), ovWorth: $("#ov-worth"),
  warnings: $("#warnings"),
  chartSub: $("#chart-sub"),
  chartScroll: $("#chart-scroll"), chartMonth: $("#chart-month"), chartValue: $("#chart-value"),
  monthList: $("#month-list"),
  emptyHint: $("#empty-hint"),
  // maand
  monthName: $("#month-name"),
  prev: $("#prev-month"), next: $("#next-month"), today: $("#today-btn"),
  potsStrip: $("#pots-strip"),
  heroEyebrow: $("#hero-title"),
  end: $("#end-balance"), begin: $("#begin-balance"), net: $("#net-badge"),
  totalIn: $("#total-in"), totalOut: $("#total-out"),
  listIn: $("#list-in"), listOut: $("#list-out"), catSummary: $("#cat-summary"),
  // vermogen
  worthTotal: $("#worth-total"), worthCash: $("#worth-cash"), worthInvest: $("#worth-invest"),
  alloc: $("#alloc"), listInvest: $("#list-invest"),
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Bedrag met count-up ---------- */
const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const _amtCache = new WeakMap();
function setAmount(el, value) {
  const prev = _amtCache.get(el);
  _amtCache.set(el, value);
  if (REDUCE_MOTION || prev === undefined || prev === value) { el.textContent = eur.format(value); return; }
  const from = prev, to = value, dur = 450, t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = eur.format(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step); else el.textContent = eur.format(to);
  }
  requestAnimationFrame(step);
}

/* ============================================================
   Render
   ============================================================ */
function render() { renderOverview(); renderMonth(); renderVermogen(); }

function isEmptyState() {
  const noStart = state.pots.every((p) => !p.startBalance);
  const noRec = state.recurring.length === 0;
  const noMonths = Object.values(state.months).every((m) => !(m.entries && m.entries.length));
  const noInv = state.investments.length === 0;
  return noStart && noRec && noMonths && noInv;
}

/* ---------- Overzicht ---------- */
function renderOverview() {
  els.emptyHint.hidden = !isEmptyState();
  const now = liquidNow();
  setAmount(els.ovNow, now);
  els.ovNow.classList.toggle("is-neg", now < 0);
  els.ovWorth.textContent = eur.format(now + investTotal());
  renderWarnings();
  renderChart();
  renderMonthList();
}

function renderWarnings() {
  els.warnings.innerHTML = "";
  const found = [];
  for (const p of state.pots) { const n = firstNegative(p.id); if (n) found.push({ pot: p, ...n }); }
  for (const w of found.slice(0, 4)) {
    const card = document.createElement("div");
    card.className = "warn-card";
    card.innerHTML = `<span class="wi" aria-hidden="true">⚠️</span>
      <span><b>${escapeHtml(w.pot.label)}</b> komt op ${w.day} ${monthShortFmt.format(keyToDate(w.key))} ${w.key.slice(0, 4)} onder nul (<b>${eur.format(w.amount)}</b>)</span>`;
    els.warnings.appendChild(card);
  }
}

function renderMonthList() {
  // horizon: van startmaand t/m (laatste data-maand of nu) + 3
  let last = currentMonthKey();
  for (const k of Object.keys(state.months)) if ((state.months[k].entries || []).length && k > last) last = k;
  for (const r of state.recurring) if (r.fromMonth > last) last = r.fromMonth;
  const horizon = addMonths(last, 3);
  const count = Math.min(24, Math.max(1, monthsBetween(state.startMonth, horizon) + 1));
  const nowKey = currentMonthKey();

  els.monthList.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const key = addMonths(state.startMonth, i);
    const { inc, out } = monthNet(key);
    const end = endBalance(key);
    const isNow = key === nowKey;

    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "month-row" + (isNow ? " is-now" : "");

    const total = inc + out;
    const bar = total > 0
      ? `<div class="mr-bar"><span class="in" style="flex:${inc}"></span><span class="out" style="flex:${out}"></span></div>`
      : `<div class="mr-bar"></div>`;

    b.innerHTML = `
      <div class="mr-main">
        <div class="mr-top">
          <span class="mr-name">${escapeHtml(monthName(key))}</span>
          ${isNow ? '<span class="mr-now-pill">Nu</span>' : ""}
        </div>
        ${bar}
        <div class="mr-flow"><span class="in">+ ${eur.format(inc)}</span><span class="out">− ${eur.format(out)}</span></div>
      </div>
      <div class="mr-right">
        <span class="mr-end tnum${end < 0 ? " is-neg" : ""}">${eur.format(end)}</span>
        <span class="mr-lbl">eindsaldo</span>
      </div>`;

    b.addEventListener("click", () => { viewMonth = key; selectedPot = "all"; haptic(6); switchTab("maand"); render(); });
    li.appendChild(b);
    els.monthList.appendChild(li);
  }
}

/* ---------- Maanddetail ---------- */
function renderMonth() {
  if (selectedPot !== "all" && !getPot(selectedPot)) selectedPot = "all";
  const pf = selectedPot === "all" ? undefined : selectedPot;

  els.monthName.textContent = monthName(viewMonth);
  els.prev.disabled = viewMonth <= state.startMonth;

  const { inc, out, net } = monthNet(viewMonth, pf);
  const end = endBalance(viewMonth, pf);

  const potLabel = pf ? getPot(pf).label : null;
  els.heroEyebrow.textContent = potLabel ? `Saldo einde maand · ${potLabel}` : "Verwacht saldo einde maand";

  els.begin.textContent = eur.format(beginBalance(viewMonth, pf));
  setAmount(els.end, end);
  els.end.classList.toggle("is-neg", end < 0);

  const sign = net > 0 ? "+" : net < 0 ? "−" : "±";
  els.net.textContent = `${sign} ${eur.format(Math.abs(net))}`;
  els.net.classList.toggle("is-neg", net < 0);

  els.totalIn.textContent = eur.format(inc);
  els.totalOut.textContent = eur.format(out);

  renderPots();
  renderCatSummary(pf);
  renderList("in", els.listIn, pf);
  renderList("out", els.listOut, pf);
}

function renderPots() {
  els.potsStrip.innerHTML = "";
  const card = (id, label, amount, on, pot) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pot-card" + (on ? " is-on" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(on));
    if (pot && pot.icon) {
      const ic = document.createElement("span");
      ic.className = "pc-icon"; ic.textContent = pot.icon; ic.setAttribute("aria-hidden", "true");
      b.appendChild(ic);
    }
    const n = document.createElement("span");
    n.className = "pc-name"; n.textContent = label;
    const a = document.createElement("span");
    a.className = "pc-amt tnum" + (amount < 0 ? " is-neg" : ""); a.textContent = eur.format(amount);
    b.append(n, a);
    if (pot && pot.goal > 0) {
      const pct = Math.max(0, Math.min(1, amount / pot.goal));
      const bar = document.createElement("div"); bar.className = "pot-progress";
      const fill = document.createElement("span"); fill.style.width = `${(pct * 100).toFixed(0)}%`; bar.appendChild(fill);
      const g = document.createElement("span"); g.className = "pc-goal";
      g.textContent = `van ${eur.format(pot.goal)} · ${Math.round(pct * 100)}%`;
      b.append(bar, g);
    }
    b.addEventListener("click", () => { selectedPot = id; haptic(8); renderMonth(); });
    return b;
  };
  els.potsStrip.appendChild(card("all", "Alle potjes", endBalance(viewMonth), selectedPot === "all", null));
  for (const p of state.pots) els.potsStrip.appendChild(card(p.id, p.label, endBalance(viewMonth, p.id), selectedPot === p.id, p));
}

function renderCatSummary(pf) {
  const totals = { baby: 0, huis: 0, overig: 0 };
  for (const e of entriesForMonth(viewMonth)) {
    if (e.kind !== "out") continue;
    if (pf && potOf(e) !== pf) continue;
    totals[catOf(e)] += e.amount;
  }
  const grand = totals.baby + totals.huis + totals.overig;
  els.catSummary.innerHTML = "";
  if (grand <= 0) return;
  for (const key of CAT_KEYS) {
    const val = totals[key]; if (val <= 0) continue;
    const cat = CATS[key];
    const chip = document.createElement("div");
    chip.className = "cat-stat";
    chip.innerHTML = `<span class="cat-dot" style="background:${cat.color}" aria-hidden="true"></span>
      <span class="cat-name">${cat.label}</span><span class="cat-val tnum">${eur.format(val)}</span>`;
    els.catSummary.appendChild(chip);
  }
}

function renderList(kind, ul, pf) {
  const items = entriesForMonth(viewMonth).filter((e) => e.kind === kind && (!pf || potOf(e) === pf));
  ul.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = kind === "in" ? "Nog geen inkomsten deze maand." : "Nog geen aankopen deze maand.";
    ul.appendChild(li);
    return;
  }
  for (const e of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "row";
    btn.addEventListener("click", () => openEntrySheet(e));

    const dot = document.createElement("span");
    if (kind === "out") { const c = CATS[catOf(e)]; dot.className = "row-dot"; dot.style.background = c.color + "22"; dot.textContent = c.icon; }
    else { dot.className = "row-dot in"; dot.textContent = "↓"; }
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "row-main";
    const label = document.createElement("span");
    label.className = "row-label"; label.textContent = e.label;
    main.appendChild(label);

    const bits = [`${e.day || 1}e`];
    if (selectedPot === "all") bits.push(getPot(potOf(e)).label);
    if (kind === "out") bits.push(CATS[catOf(e)].label);
    if (e.recurring) bits.push("↻ maandelijks");
    const tag = document.createElement("span");
    tag.className = "row-tag"; tag.textContent = bits.join(" · ");
    main.appendChild(tag);

    const amount = document.createElement("span");
    amount.className = `row-amount tnum ${kind}`;
    amount.textContent = (kind === "in" ? "+ " : "− ") + eur.format(e.amount);

    btn.append(dot, main, amount);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

/* ---------- Cashflow-grafiek (dagelijks, scrubbaar) ---------- */
function renderChart(pf) {
  const start = state.startMonth;
  const span = chartSpan();

  const pts = [];
  const monthStart = [];
  let bal = startSum(pf);
  let mk = start;
  for (let mi = 0; mi <= span; mi++) {
    const dim = daysInMonth(mk);
    const deltas = new Array(dim + 1).fill(0);
    for (const e of entriesForMonth(mk)) {
      if (pf && potOf(e) !== pf) continue;
      deltas[clampDay(e.day, dim)] += e.kind === "in" ? e.amount : -e.amount;
    }
    monthStart.push({ index: pts.length, key: mk });
    for (let d = 1; d <= dim; d++) { bal += deltas[d]; pts.push({ key: mk, day: d, balance: bal }); }
    mk = addMonths(mk, 1);
  }
  if (pts.length === 0) return;

  const stepX = 4.4, padX = 14, H = 168, padTop = 18, padBot = 26;
  const W = padX * 2 + (pts.length - 1) * stepX;
  let min = Infinity, max = -Infinity;
  for (const p of pts) { if (p.balance < min) min = p.balance; if (p.balance > max) max = p.balance; }
  min = Math.min(min, 0); max = Math.max(max, 0);
  if (min === max) max = min + 1;
  const range = max - min;
  const X = (i) => padX + i * stepX;
  const Y = (v) => padTop + (1 - (v - min) / range) * (H - padTop - padBot);
  const baseY = H - padBot;

  let line = "";
  for (let i = 0; i < pts.length; i++) line += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(pts[i].balance).toFixed(1) + " ";
  const area = `M ${X(0).toFixed(1)} ${baseY} ${line}L ${X(pts.length - 1).toFixed(1)} ${baseY} Z`;

  const nowKey = currentMonthKey();
  let ticks = "";
  for (const m of monthStart) {
    const isNow = m.key === nowKey;
    ticks += `<text class="c-tick${isNow ? " is-now" : ""}" x="${X(m.index).toFixed(1)}" y="${H - 8}" text-anchor="middle">${monthShortFmt.format(keyToDate(m.key))}</text>`;
  }
  const danger = min < 0 ? `<rect class="c-danger" x="${padX}" y="${Y(0).toFixed(1)}" width="${(W - padX * 2).toFixed(1)}" height="${(baseY - Y(0)).toFixed(1)}"/>` : "";
  const zero = (min < 0 && max > 0) ? `<line class="c-zero" x1="${padX}" y1="${Y(0).toFixed(1)}" x2="${(W - padX).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>` : "";

  let grid = "";
  const gN = 3;
  for (let g = 1; g <= gN; g++) {
    const gy = (padTop + (g / (gN + 1)) * (H - padTop - padBot)).toFixed(1);
    grid += `<line class="c-grid" x1="${padX}" y1="${gy}" x2="${(W - padX).toFixed(1)}" y2="${gy}"/>`;
  }

  let todayMark = "";
  const nowM = monthStart.find((m) => m.key === nowKey);
  if (nowM) {
    const tx = X(nowM.index + Math.min(todayDay(), daysInMonth(nowKey)) - 1).toFixed(1);
    todayMark = `<line class="c-today" x1="${tx}" y1="${padTop}" x2="${tx}" y2="${baseY}"/><text class="c-today-lbl" x="${tx}" y="${padTop - 5}" text-anchor="middle">nu</text>`;
  }

  els.chartSub.textContent = "sleep om te bekijken";
  els.chartScroll.innerHTML = `
    <svg class="chart-svg" width="${W.toFixed(0)}" height="${H}" viewBox="0 0 ${W.toFixed(0)} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="c-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.30"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0.02"/>
      </linearGradient></defs>
      ${grid}${danger}${zero}
      <path class="c-area" d="${area}"/>
      <path class="c-line" d="${line.trim()}"/>
      ${todayMark}${ticks}
      <line class="c-guide" id="c-guide" x1="0" y1="${padTop}" x2="0" y2="${baseY}"/>
      <circle class="c-focus" id="c-focus" r="5" cx="-10" cy="-10"/>
    </svg>`;

  const svgEl = els.chartScroll.querySelector("svg");
  const guide = svgEl.querySelector("#c-guide");
  const focus = svgEl.querySelector("#c-focus");
  const clampIdx = (i) => Math.max(0, Math.min(pts.length - 1, i));

  function setFocus(i) {
    i = clampIdx(i);
    const p = pts[i];
    const x = X(i), y = Y(p.balance);
    guide.setAttribute("x1", x); guide.setAttribute("x2", x);
    focus.setAttribute("cx", x); focus.setAttribute("cy", y);
    focus.classList.toggle("is-neg", p.balance < 0);
    els.chartMonth.textContent = `${p.day} ${monthShortFmt.format(keyToDate(p.key))} ${p.key.slice(0, 4)}`;
    els.chartValue.textContent = eur.format(p.balance);
    els.chartValue.classList.toggle("is-neg", p.balance < 0);
    return p;
  }

  let focusIdx = monthStart[0].index;
  const vm = monthStart.find((m) => m.key === viewMonth);
  if (vm) { focusIdx = vm.index; if (viewMonth === nowKey) focusIdx = vm.index + Math.min(todayDay(), daysInMonth(nowKey)) - 1; }
  setFocus(focusIdx);
  requestAnimationFrame(() => { els.chartScroll.scrollLeft = X(focusIdx) - els.chartScroll.clientWidth / 2; });

  const idxFromEvent = (ev) => { const rect = svgEl.getBoundingClientRect(); return Math.round((ev.clientX - rect.left - padX) / stepX); };
  let downX = null, moved = false, ptype = null;
  svgEl.addEventListener("pointerdown", (ev) => { downX = ev.clientX; moved = false; ptype = ev.pointerType; if (ptype !== "touch") setFocus(idxFromEvent(ev)); });
  svgEl.addEventListener("pointermove", (ev) => { if (downX === null) return; if (Math.abs(ev.clientX - downX) > 6) moved = true; if (ptype !== "touch" && ev.buttons & 1) setFocus(idxFromEvent(ev)); });
  svgEl.addEventListener("pointerup", (ev) => {
    if (downX === null) return;
    const tap = !moved, wasTouch = ptype === "touch";
    downX = null;
    if (!wasTouch || tap) {
      const p = setFocus(idxFromEvent(ev));
      if (p) { viewMonth = clampToStart(p.key); selectedPot = "all"; haptic(6); switchTab("maand"); render(); }
    }
  });
  svgEl.addEventListener("pointercancel", () => { downX = null; });
}

/* ---------- Vermogen ---------- */
function renderVermogen() {
  const cash = liquidNow(), inv = investTotal(), total = cash + inv;
  els.worthCash.textContent = eur.format(cash);
  els.worthInvest.textContent = eur.format(inv);
  setAmount(els.worthTotal, total);
  els.worthTotal.classList.toggle("is-neg", total < 0);
  renderAllocation();
  renderInvestList();
}

function renderAllocation() {
  const cur = clampToStart(currentMonthKey());
  const parts = [
    ...state.pots.map((p, i) => ({ label: p.label, value: Math.max(0, endBalance(cur, p.id)), color: POT_COLORS[i % POT_COLORS.length] })),
    ...state.investments.map((iv, i) => ({ label: iv.label, value: Math.max(0, Number(iv.value) || 0), color: INV_COLORS[i % INV_COLORS.length] })),
  ].filter((p) => p.value > 0);

  els.alloc.innerHTML = "";
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (sum <= 0) { els.alloc.innerHTML = `<p class="empty" style="padding:8px 4px">Nog niets om te verdelen. Vul een beginsaldo of belegging in.</p>`; return; }

  const bar = document.createElement("div");
  bar.className = "alloc-bar";
  for (const p of parts) {
    const seg = document.createElement("span");
    seg.className = "alloc-seg";
    seg.style.width = `${(p.value / sum) * 100}%`; seg.style.background = p.color;
    seg.title = `${p.label}: ${eur.format(p.value)}`;
    bar.appendChild(seg);
  }
  els.alloc.appendChild(bar);

  const legend = document.createElement("div");
  legend.className = "alloc-legend";
  for (const p of parts) {
    const pct = Math.round((p.value / sum) * 100);
    const row = document.createElement("div");
    row.className = "alloc-item";
    row.innerHTML = `<span class="cat-dot" style="background:${p.color}" aria-hidden="true"></span>
      <span class="alloc-label">${escapeHtml(p.label)}</span>
      <span class="alloc-pct tnum">${pct}%</span><span class="alloc-amt tnum">${eur.format(p.value)}</span>`;
    legend.appendChild(row);
  }
  els.alloc.appendChild(legend);
}

function renderInvestList() {
  const ul = els.listInvest;
  ul.innerHTML = "";
  if (state.investments.length === 0) {
    const li = document.createElement("li");
    li.className = "empty"; li.textContent = "Nog geen beleggingen. Voeg je eerste rekening toe.";
    ul.appendChild(li); return;
  }
  for (const inv of state.investments) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "row";
    btn.addEventListener("click", () => openInvestSheet(inv));
    const dot = document.createElement("span");
    dot.className = "row-dot"; dot.style.background = "rgba(62,124,177,0.16)"; dot.textContent = "📈"; dot.setAttribute("aria-hidden", "true");
    const main = document.createElement("span");
    main.className = "row-main";
    const label = document.createElement("span");
    label.className = "row-label"; label.textContent = inv.label; main.appendChild(label);
    const amount = document.createElement("span");
    amount.className = "row-amount tnum"; amount.textContent = eur.format(Number(inv.value) || 0);
    btn.append(dot, main, amount);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

/* ============================================================
   Tabs
   ============================================================ */
const TAB_LABEL = { overzicht: "Overzicht", maand: "Maand", vermogen: "Vermogen" };
const tabs = {
  overzicht: $("#tab-overzicht"),
  maand: $("#tab-maand"),
  vermogen: $("#tab-vermogen"),
};
const tabInd = $("#tab-ind");
function positionTabInd(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (!btn || !tabInd) return;
  tabInd.style.left = btn.offsetLeft + "px";
  tabInd.style.width = btn.offsetWidth + "px";
}
function switchTab(name) {
  activeTab = name;
  for (const k of Object.keys(tabs)) tabs[k].hidden = k !== name;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("is-active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  positionTabInd(name);
  const shown = tabs[name];
  if (shown) { shown.classList.remove("tab-enter"); void shown.offsetWidth; shown.classList.add("tab-enter"); }
  els.brandName.textContent = TAB_LABEL[name] || "Budget";
  window.scrollTo({ top: 0, behavior: "auto" });
}
window.addEventListener("resize", () => positionTabInd(activeTab));
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => { haptic(6); switchTab(btn.dataset.tab); });
});
$("#back-overzicht").addEventListener("click", () => { haptic(6); switchTab("overzicht"); });

/* ============================================================
   Maandnavigatie + maandkiezer
   ============================================================ */
els.prev.addEventListener("click", () => { viewMonth = clampToStart(addMonths(viewMonth, -1)); render(); });
els.next.addEventListener("click", () => { viewMonth = addMonths(viewMonth, 1); render(); });
els.today.addEventListener("click", () => { viewMonth = clampToStart(currentMonthKey()); render(); });

const monthOverlay = $("#month-overlay");
const mpYearEl = $("#mp-year");
const mpGrid = $("#mp-grid");
els.monthName.addEventListener("click", () => { mpYear = Number(viewMonth.slice(0, 4)); renderMpGrid(); openOverlay(monthOverlay); });
$("#mp-prev").addEventListener("click", () => { mpYear--; renderMpGrid(); });
$("#mp-next").addEventListener("click", () => { mpYear++; renderMpGrid(); });

function renderMpGrid() {
  mpYearEl.textContent = String(mpYear);
  mpGrid.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const key = `${mpYear}-${String(m).padStart(2, "0")}`;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "mp-cell" + (key === viewMonth ? " is-on" : "");
    // Korte namen: passen ook op smalle toestellen in 3 kolommen
    cell.textContent = monthShortFmt.format(new Date(mpYear, m - 1, 1)).replace(".", "");
    cell.setAttribute("aria-label", monthOnlyFmt.format(new Date(mpYear, m - 1, 1)));
    cell.disabled = key < state.startMonth;
    cell.addEventListener("click", () => { viewMonth = clampToStart(key); haptic(6); closeOverlay(monthOverlay); switchTab("maand"); render(); });
    mpGrid.appendChild(cell);
  }
}

/* ============================================================
   Entry-sheet
   ============================================================ */
const entryOverlay = $("#entry-overlay");
const entryForm = $("#entry-form");
const fMonth = $("#f-month");
const fLabel = $("#f-label");
const fAmount = $("#f-amount");
const fDay = $("#f-day");
const fRecurring = $("#f-recurring");
const entryTitle = $("#entry-title");
const entryError = $("#entry-error");
const segOpts = [...entryForm.querySelectorAll(".seg-opt")];
const catField = $("#cat-field");
const catRow = $("#cat-row");
const potRow = $("#pot-row");
const suggestRow = $("#suggest-row");

let editing = null;
let formKind = "in";
let formCat = DEFAULT_CAT;
let formPot = firstPotId();

for (const key of CAT_KEYS) {
  const c = CATS[key];
  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "cat-chip"; chip.dataset.cat = key; chip.setAttribute("role", "radio");
  chip.style.setProperty("--c", c.color);
  chip.innerHTML = `<span aria-hidden="true">${c.icon}</span> ${c.label}`;
  chip.addEventListener("click", () => setCat(key));
  catRow.appendChild(chip);
}
function setCat(key) {
  formCat = CATS[key] ? key : DEFAULT_CAT;
  catRow.querySelectorAll(".cat-chip").forEach((ch) => { const on = ch.dataset.cat === formCat; ch.classList.toggle("is-on", on); ch.setAttribute("aria-checked", String(on)); });
}
function buildPotChips() {
  potRow.innerHTML = "";
  for (const p of state.pots) {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "cat-chip"; chip.dataset.pot = p.id; chip.setAttribute("role", "radio");
    chip.style.setProperty("--c", "var(--accent)");
    chip.textContent = (p.icon ? p.icon + " " : "") + p.label;
    chip.addEventListener("click", () => setPot(p.id));
    potRow.appendChild(chip);
  }
}
function setPot(id) {
  formPot = getPot(id) ? id : firstPotId();
  potRow.querySelectorAll(".cat-chip").forEach((ch) => { const on = ch.dataset.pot === formPot; ch.classList.toggle("is-on", on); ch.setAttribute("aria-checked", String(on)); });
}
function setKind(kind) {
  formKind = kind;
  for (const opt of segOpts) opt.setAttribute("aria-selected", String(opt.dataset.kind === kind));
  catField.hidden = kind !== "out";
}
segOpts.forEach((opt) => { opt.setAttribute("role", "tab"); opt.addEventListener("click", () => setKind(opt.dataset.kind)); });

function buildSuggestions() {
  suggestRow.innerHTML = "";
  for (const l of state.recentLabels.slice(0, 6)) {
    const c = document.createElement("button");
    c.type = "button"; c.className = "suggest-chip"; c.textContent = l;
    c.addEventListener("click", () => { fLabel.value = l; fAmount.focus(); });
    suggestRow.appendChild(c);
  }
}
document.querySelectorAll("#qa-row .qa-chip").forEach((ch) => {
  ch.addEventListener("click", () => { fAmount.value = ch.dataset.amt; fAmount.focus(); });
});

function openEntrySheet(entry, presetKind) {
  entryError.hidden = true;
  buildPotChips();
  buildSuggestions();
  if (entry) {
    editing = { id: entry.id, recurring: entry.recurring, kind: entry.kind };
    entryTitle.textContent = "Bewerken";
    setKind(entry.kind); setCat(catOf(entry)); setPot(potOf(entry));
    fMonth.value = viewMonth;
    fLabel.value = entry.label;
    fAmount.value = String(entry.amount).replace(".", ",");
    fDay.value = entry.day ? String(entry.day) : "";
    fRecurring.checked = !!entry.recurring;
  } else {
    editing = null;
    entryTitle.textContent = "Toevoegen";
    setKind(presetKind || "in"); setCat(DEFAULT_CAT);
    setPot(selectedPot !== "all" ? selectedPot : firstPotId());
    fMonth.value = clampToStart(viewMonth);
    fLabel.value = ""; fAmount.value = ""; fDay.value = ""; fRecurring.checked = false;
  }
  deleteBtn.style.display = entry ? "block" : "none";
  openOverlay(entryOverlay);
  if (!isTouch()) setTimeout(() => fLabel.focus(), 60);
}

entryForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const label = fLabel.value.trim();
  const amount = parseAmount(fAmount.value);
  if (!label) return showError(entryError, "Vul een omschrijving in.");
  if (!Number.isFinite(amount) || amount <= 0) return showError(entryError, "Vul een geldig bedrag in.");

  let target = /^\d{4}-\d{2}$/.test(fMonth.value) ? fMonth.value : viewMonth;
  target = clampToStart(target);

  const dayNum = Math.floor(Number(fDay.value));
  const day = Number.isFinite(dayNum) && dayNum >= 1 ? Math.min(dayNum, 31) : 1;

  const recurring = fRecurring.checked;
  const rec = { kind: formKind, label, amount, potId: formPot, day };
  if (formKind === "out") rec.category = formCat;

  if (editing) removeEntry(editing.id, editing.recurring, viewMonth, true);

  if (recurring) state.recurring.push({ id: uid(), fromMonth: target, ...rec });
  else ensureMonth(target).entries.push({ id: uid(), ...rec });

  pushRecent(label);
  viewMonth = target;
  haptic(12);
  saveState();
  closeOverlay(entryOverlay);
  render();
});

function pushRecent(label) {
  const l = label.trim();
  if (!l) return;
  state.recentLabels = [l, ...state.recentLabels.filter((x) => x.toLowerCase() !== l.toLowerCase())].slice(0, 8);
}
function showError(el, msg) { el.textContent = msg; el.hidden = false; }
function ensureMonth(key) {
  if (!state.months[key]) state.months[key] = { entries: [], skip: [] };
  if (!state.months[key].skip) state.months[key].skip = [];
  if (!state.months[key].entries) state.months[key].entries = [];
  return state.months[key];
}

/* ---------- Verwijderen ---------- */
function removeEntry(id, recurring, key, silent) {
  if (recurring) {
    const idx = state.recurring.findIndex((r) => r.id === id);
    const removed = idx >= 0 ? state.recurring.splice(idx, 1)[0] : null;
    if (!silent && removed) { haptic(18); saveState(); render(); toast("Terugkerende post verwijderd", () => { state.recurring.push(removed); saveState(); render(); }); }
  } else {
    const md = ensureMonth(key);
    const idx = md.entries.findIndex((e) => e.id === id);
    const removed = idx >= 0 ? md.entries.splice(idx, 1)[0] : null;
    if (!silent && removed) { haptic(18); saveState(); render(); toast("Post verwijderd", () => { ensureMonth(key).entries.push(removed); saveState(); render(); }); }
  }
}
function skipRecurringThisMonth(id, key) {
  const md = ensureMonth(key);
  if (!md.skip.includes(id)) md.skip.push(id);
  saveState(); render();
  toast("Overgeslagen deze maand", () => { const m = ensureMonth(key); m.skip = m.skip.filter((s) => s !== id); saveState(); render(); });
}

/* ---------- Verwijderknop ---------- */
const entryActions = entryForm.querySelector(".sheet-actions");
const deleteBtn = document.createElement("button");
deleteBtn.type = "button"; deleteBtn.className = "btn-danger"; deleteBtn.textContent = "Verwijderen"; deleteBtn.style.display = "none";
deleteBtn.addEventListener("click", () => {
  if (!editing) return;
  closeOverlay(entryOverlay);
  if (editing.recurring) askDeleteRecurring({ id: editing.id, label: fLabel.value.trim() || "deze post" });
  else removeEntry(editing.id, false, viewMonth);
});
entryActions.parentNode.insertBefore(deleteBtn, entryActions);

/* ============================================================
   Belegging-sheet
   ============================================================ */
const investOverlay = $("#invest-overlay");
const investForm = $("#invest-form");
const iLabel = $("#i-label");
const iValue = $("#i-value");
const investTitle = $("#invest-title");
const investError = $("#invest-error");
let editingInvest = null;

const investActions = investForm.querySelector(".sheet-actions");
const investDelete = document.createElement("button");
investDelete.type = "button"; investDelete.className = "btn-danger"; investDelete.textContent = "Verwijderen"; investDelete.style.display = "none";
investDelete.addEventListener("click", () => {
  if (!editingInvest) return;
  const idx = state.investments.findIndex((i) => i.id === editingInvest);
  const removed = idx >= 0 ? state.investments.splice(idx, 1)[0] : null;
  closeOverlay(investOverlay);
  if (removed) { haptic(18); saveState(); render(); toast("Belegging verwijderd", () => { state.investments.splice(idx, 0, removed); saveState(); render(); }); }
});
investActions.parentNode.insertBefore(investDelete, investActions);

function openInvestSheet(inv) {
  investError.hidden = true;
  if (inv) { editingInvest = inv.id; investTitle.textContent = "Belegging bewerken"; iLabel.value = inv.label; iValue.value = String(inv.value).replace(".", ","); investDelete.style.display = "block"; }
  else { editingInvest = null; investTitle.textContent = "Belegging toevoegen"; iLabel.value = ""; iValue.value = ""; investDelete.style.display = "none"; }
  openOverlay(investOverlay);
  if (!isTouch()) setTimeout(() => iLabel.focus(), 60);
}
$("#add-invest").addEventListener("click", () => openInvestSheet(null));

investForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const label = iLabel.value.trim();
  const value = parseAmount(iValue.value);
  if (!label) return showError(investError, "Vul een naam in.");
  if (!Number.isFinite(value) || value < 0) return showError(investError, "Vul een geldige waarde in.");
  if (editingInvest) { const inv = state.investments.find((i) => i.id === editingInvest); if (inv) { inv.label = label; inv.value = value; } }
  else state.investments.push({ id: uid(), label, value });
  haptic(12); saveState(); closeOverlay(investOverlay); render();
});

/* ============================================================
   Choice-sheet
   ============================================================ */
const choiceOverlay = $("#choice-overlay");
const choiceText = $("#choice-text");
const choiceA = $("#choice-a");
const choiceB = $("#choice-b");
function askDeleteRecurring(entry) {
  choiceText.textContent = `“${entry.label}” is een terugkerende post. Wat wil je doen?`;
  choiceA.textContent = "Alleen deze maand overslaan";
  choiceB.textContent = "Elke maand verwijderen";
  const onA = () => { cleanup(); closeOverlay(choiceOverlay); skipRecurringThisMonth(entry.id, viewMonth); };
  const onB = () => { cleanup(); closeOverlay(choiceOverlay); removeEntry(entry.id, true, viewMonth); };
  function cleanup() { choiceA.removeEventListener("click", onA); choiceB.removeEventListener("click", onB); }
  choiceA.addEventListener("click", onA);
  choiceB.addEventListener("click", onB);
  openOverlay(choiceOverlay);
}

/* ============================================================
   Overlays helper
   ============================================================ */
let lastFocus = null;
function openOverlay(overlay) { lastFocus = document.activeElement; overlay.hidden = false; document.body.style.overflow = "hidden"; }
function closeOverlay(overlay) { overlay.hidden = true; document.body.style.overflow = ""; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
document.querySelectorAll("[data-close]").forEach((btn) => { btn.addEventListener("click", () => { const ov = btn.closest(".sheet-overlay"); if (ov) closeOverlay(ov); }); });
document.querySelectorAll(".sheet-overlay").forEach((ov) => { ov.addEventListener("click", (e) => { if (e.target === ov) closeOverlay(ov); }); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const open = [...document.querySelectorAll(".sheet-overlay")].find((o) => !o.hidden); if (open) closeOverlay(open); } });
document.querySelectorAll("[data-add]").forEach((btn) => { btn.addEventListener("click", () => openEntrySheet(null, btn.dataset.add)); });

/* ---------- FAB ---------- */
$("#fab").addEventListener("click", () => { haptic(10); if (activeTab === "vermogen") openInvestSheet(null); else openEntrySheet(null, "out"); });

/* ============================================================
   Instellingen — potjes (beginsaldo + doel), startmaand, back-up
   ============================================================ */
const settingsOverlay = $("#settings-overlay");
const sStartMonth = $("#s-start-month");
const potManage = $("#pot-manage");

function moneyInput(placeholder, value, aria, onChange) {
  const wrap = document.createElement("div"); wrap.className = "pe-money";
  const cur = document.createElement("span"); cur.className = "cur"; cur.textContent = "€";
  const input = document.createElement("input"); input.inputMode = "decimal"; input.placeholder = placeholder;
  input.value = value ? String(value).replace(".", ",") : ""; input.setAttribute("aria-label", aria);
  input.addEventListener("change", () => onChange(parseAmount(input.value)));
  wrap.append(cur, input);
  return wrap;
}

function renderPotManage() {
  potManage.innerHTML = "";
  state.pots.forEach((p, idx) => {
    const card = document.createElement("div"); card.className = "pot-edit";

    const top = document.createElement("div"); top.className = "pe-top";
    const icon = document.createElement("input");
    icon.className = "pe-icon"; icon.value = p.icon || ""; icon.maxLength = 2; icon.setAttribute("aria-label", "Icoon (emoji)");
    icon.addEventListener("change", () => { p.icon = icon.value.trim() || guessIcon(p.label); saveState(); render(); });
    const name = document.createElement("input");
    name.className = "pe-name"; name.value = p.label; name.setAttribute("aria-label", "Naam potje");
    name.addEventListener("change", () => { p.label = name.value.trim() || `Potje ${idx + 1}`; saveState(); render(); });
    const del = document.createElement("button");
    del.type = "button"; del.className = "pot-del"; del.setAttribute("aria-label", `Potje ${p.label} verwijderen`); del.textContent = "×";
    del.addEventListener("click", () => {
      if (state.pots.length <= 1) return toast("Je hebt minstens één potje nodig");
      const removed = state.pots.splice(idx, 1)[0];
      haptic(18); saveState(); renderPotManage(); render();
      toast("Potje verwijderd", () => { state.pots.splice(idx, 0, removed); saveState(); renderPotManage(); render(); });
    });
    top.append(icon, name, del);

    const cols = document.createElement("div"); cols.className = "pe-cols";
    const col1 = document.createElement("label"); col1.className = "pe-col";
    col1.innerHTML = "<span>Beginsaldo</span>";
    col1.appendChild(moneyInput("0,00", p.startBalance, "Beginsaldo potje", (v) => { p.startBalance = Number.isFinite(v) ? v : 0; saveState(); render(); }));
    const col2 = document.createElement("label"); col2.className = "pe-col";
    col2.innerHTML = "<span>Doel (optioneel)</span>";
    col2.appendChild(moneyInput("bijv. 2000", p.goal, "Doelbedrag potje", (v) => { p.goal = Number.isFinite(v) && v > 0 ? v : 0; saveState(); render(); }));
    cols.append(col1, col2);

    card.append(top, cols);
    potManage.appendChild(card);
  });
}
$("#pot-add").addEventListener("click", () => { state.pots.push({ id: uid(), label: "Nieuw potje", startBalance: 0, goal: 0, icon: "🐷" }); haptic(10); saveState(); renderPotManage(); render(); });

function openSettings() { renderPotManage(); sStartMonth.value = state.startMonth; openOverlay(settingsOverlay); }
$("#btn-settings").addEventListener("click", openSettings);
$("#hint-setup").addEventListener("click", openSettings);

function commitSettings() {
  if (/^\d{4}-\d{2}$/.test(sStartMonth.value)) { state.startMonth = sStartMonth.value; viewMonth = clampToStart(viewMonth); }
  saveState(); render();
}
sStartMonth.addEventListener("change", commitSettings);
settingsOverlay.querySelector("[data-close]").addEventListener("click", commitSettings);

/* ---------- Export / import / reset ---------- */
$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `budget-backup-${currentMonthKey()}.json`; a.click();
  URL.revokeObjectURL(url);
});
const importFile = $("#import-file");
$("#btn-import").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== "object" || !data) throw new Error("ongeldig");
    state = { ...defaultState(), ...data };
    if (!Array.isArray(state.pots) || state.pots.length === 0) state.pots = DEFAULT_POTS.map((p) => ({ ...p }));
    state.pots = state.pots.map((p) => ({ goal: 0, icon: guessIcon(p.label), ...p }));
    if (!Array.isArray(state.recentLabels)) state.recentLabels = [];
    selectedPot = "all"; viewMonth = clampToStart(currentMonthKey());
    saveState(); render(); renderPotManage(); closeOverlay(settingsOverlay); toast("Back-up geïmporteerd");
  } catch { toast("Kon dit bestand niet lezen"); }
  finally { importFile.value = ""; }
});
$("#btn-reset").addEventListener("click", () => {
  const snapshot = JSON.stringify(state);
  state = defaultState(); selectedPot = "all"; viewMonth = currentMonthKey();
  saveState(); render(); closeOverlay(settingsOverlay);
  toast("Alles gewist", () => { state = JSON.parse(snapshot); selectedPot = "all"; viewMonth = clampToStart(currentMonthKey()); saveState(); render(); });
});

/* ============================================================
   Toast
   ============================================================ */
const toastEl = $("#toast");
const toastText = $("#toast-text");
const toastAction = $("#toast-action");
let toastTimer = null;
function toast(msg, onUndo) {
  clearTimeout(toastTimer);
  toastText.textContent = msg;
  if (onUndo) { toastAction.textContent = "Ongedaan maken"; toastAction.style.display = ""; toastAction.onclick = () => { clearTimeout(toastTimer); toastEl.hidden = true; onUndo(); }; }
  else { toastAction.style.display = "none"; toastAction.onclick = null; }
  toastEl.hidden = false;
  toastTimer = setTimeout(() => (toastEl.hidden = true), 5000);
}

/* ---------- utils ---------- */
function isTouch() { return window.matchMedia("(pointer: coarse)").matches; }

/* ============================================================
   Init + service worker
   ============================================================ */
switchTab("overzicht");
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
