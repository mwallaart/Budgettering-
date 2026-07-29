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
  { id: "algemeen", label: "Algemeen", startBalance: 0 },
  { id: "vakantie", label: "Vakantie", startBalance: 0 },
  { id: "auto", label: "Auto", startBalance: 0 },
];
const POT_COLORS = ["#1B4D3E", "#2E8B6B", "#57B894", "#8FD3B6", "#3AA57D"];
const INV_COLORS = ["#3E7CB1", "#B4482E", "#C99A2E", "#7A5CC0", "#D96BA0"];

/* ---------- Formatters ---------- */
const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});
const monthFmt = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("nl-NL", { month: "short" });

/* ---------- Maand-helpers (sleutel = "YYYY-MM") ---------- */
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function keyToDate(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function addMonths(key, n) {
  const d = keyToDate(key);
  d.setMonth(d.getMonth() + n);
  return monthKey(d);
}
function monthName(key) {
  return monthFmt.format(keyToDate(key));
}
function currentMonthKey() {
  return monthKey(new Date());
}
function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function clampDay(day, dim) {
  const d = Math.floor(Number(day));
  if (!Number.isFinite(d) || d < 1) return 1;
  return Math.min(d, dim);
}
function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function maxKey(a, b) {
  return a >= b ? a : b;
}
function todayDay() {
  return new Date().getDate();
}

/* ---------- Bedrag parsen ("1.234,56" / "1234.56" / "1234,56") ---------- */
function parseAmount(raw) {
  if (typeof raw !== "string") return NaN;
  let s = raw.trim().replace(/[€\s]/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* ---------- Haptische feedback (waar ondersteund) ---------- */
function haptic(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch { /* niet ondersteund */ }
}

/* ============================================================
   State
   ============================================================ */
function defaultState() {
  return {
    version: 3,
    startMonth: currentMonthKey(),
    pots: DEFAULT_POTS.map((p) => ({ ...p })),
    recurring: [],   // {id, kind, label, amount, category?, potId, fromMonth}
    months: {},      // key -> { entries:[{id,kind,label,amount,category?,potId}], skip:[recurringId] }
    investments: [], // {id, label, value}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultState(), ...parsed };
    // Migratie v2 → v3: enkel beginsaldo werd één potje
    if (parsed && parsed.pots === undefined) {
      merged.pots = DEFAULT_POTS.map((p) => ({ ...p }));
      if (typeof parsed.startBalance === "number") merged.pots[0].startBalance = parsed.startBalance;
    }
    if (!Array.isArray(merged.pots) || merged.pots.length === 0) {
      merged.pots = DEFAULT_POTS.map((p) => ({ ...p }));
    }
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage vol of geblokkeerd */ }
}

let state = loadState();
let viewMonth = clampToStart(currentMonthKey());
let selectedPot = "all"; // 'all' of pot-id
let activeTab = "budget";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Potjes-helpers ---------- */
function firstPotId() {
  return state.pots[0] ? state.pots[0].id : "algemeen";
}
function getPot(id) {
  return state.pots.find((p) => p.id === id) || null;
}
function potOf(e) {
  return getPot(e?.potId) ? e.potId : firstPotId();
}

/* ============================================================
   Berekeningen
   ============================================================ */
function monthData(key) {
  return state.months[key] || { entries: [], skip: [] };
}

function entriesForMonth(key) {
  const md = monthData(key);
  const skip = md.skip || [];
  const oneOff = (md.entries || []).map((e) => ({ ...e, recurring: false }));
  const recurring = state.recurring
    .filter((r) => r.fromMonth <= key && !skip.includes(r.id))
    .map((r) => ({ ...r, recurring: true }));
  return [...recurring, ...oneOff];
}

// potId undefined => alle potjes samen
function monthNet(key, potId) {
  let inc = 0;
  let out = 0;
  for (const e of entriesForMonth(key)) {
    if (potId && potOf(e) !== potId) continue;
    if (e.kind === "in") inc += e.amount;
    else out += e.amount;
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
  while (cursor < key) {
    bal += monthNet(cursor, potId).net;
    cursor = addMonths(cursor, 1);
  }
  return bal;
}

function endBalance(key, potId) {
  return beginBalance(key, potId) + monthNet(key, potId).net;
}

function clampToStart(key) {
  return key < state.startMonth ? state.startMonth : key;
}

function liquidNow() {
  return endBalance(clampToStart(currentMonthKey())); // totaal alle potjes
}
function investTotal() {
  return state.investments.reduce((s, i) => s + (Number(i.value) || 0), 0);
}

/* ============================================================
   DOM refs
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const els = {
  monthName: $("#month-name"),
  prev: $("#prev-month"),
  next: $("#next-month"),
  today: $("#today-btn"),
  potsStrip: $("#pots-strip"),
  heroEyebrow: $("#hero-title"),
  end: $("#end-balance"),
  begin: $("#begin-balance"),
  net: $("#net-badge"),
  totalIn: $("#total-in"),
  totalOut: $("#total-out"),
  listIn: $("#list-in"),
  listOut: $("#list-out"),
  catSummary: $("#cat-summary"),
  emptyHint: $("#empty-hint"),
  projSub: $("#proj-sub"),
  chartScroll: $("#chart-scroll"),
  chartMonth: $("#chart-month"),
  chartValue: $("#chart-value"),
  worthTotal: $("#worth-total"),
  worthCash: $("#worth-cash"),
  worthInvest: $("#worth-invest"),
  alloc: $("#alloc"),
  listInvest: $("#list-invest"),
};

/* ============================================================
   Render
   ============================================================ */
function render() {
  renderBudget();
  renderVermogen();
}

function renderBudget() {
  if (selectedPot !== "all" && !getPot(selectedPot)) selectedPot = "all";
  const pf = selectedPot === "all" ? undefined : selectedPot;

  els.monthName.textContent = monthName(viewMonth);
  els.prev.disabled = viewMonth <= state.startMonth;

  const { inc, out, net } = monthNet(viewMonth, pf);
  const end = endBalance(viewMonth, pf);

  const potLabel = pf ? getPot(pf).label : null;
  els.heroEyebrow.textContent = potLabel
    ? `Saldo einde maand · ${potLabel}`
    : "Verwacht saldo einde maand";

  els.begin.textContent = eur.format(beginBalance(viewMonth, pf));
  els.end.textContent = eur.format(end);
  els.end.classList.toggle("is-neg", end < 0);

  const sign = net > 0 ? "+" : net < 0 ? "−" : "±";
  els.net.textContent = `${sign} ${eur.format(Math.abs(net))}`;
  els.net.classList.toggle("is-neg", net < 0);

  els.totalIn.textContent = eur.format(inc);
  els.totalOut.textContent = eur.format(out);

  els.emptyHint.hidden = !isEmptyState();
  renderPots();
  renderCatSummary(pf);
  renderList("in", els.listIn, pf);
  renderList("out", els.listOut, pf);
  renderChart(pf);
}

function isEmptyState() {
  const noStart = state.pots.every((p) => !p.startBalance);
  const noRec = state.recurring.length === 0;
  const noMonths = Object.values(state.months).every((m) => !(m.entries && m.entries.length));
  const noInv = state.investments.length === 0;
  return noStart && noRec && noMonths && noInv;
}

function renderPots() {
  els.potsStrip.innerHTML = "";
  const make = (id, label, amount, on) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pot-card" + (on ? " is-on" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(on));
    const n = document.createElement("span");
    n.className = "pc-name";
    n.textContent = label;
    const a = document.createElement("span");
    a.className = "pc-amt tnum" + (amount < 0 ? " is-neg" : "");
    a.textContent = eur.format(amount);
    b.append(n, a);
    b.addEventListener("click", () => {
      selectedPot = id;
      haptic(8);
      renderBudget();
    });
    return b;
  };
  els.potsStrip.appendChild(make("all", "Alle potjes", endBalance(viewMonth), selectedPot === "all"));
  for (const p of state.pots) {
    els.potsStrip.appendChild(make(p.id, p.label, endBalance(viewMonth, p.id), selectedPot === p.id));
  }
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
    const val = totals[key];
    if (val <= 0) continue;
    const cat = CATS[key];
    const chip = document.createElement("div");
    chip.className = "cat-stat";
    chip.innerHTML = `
      <span class="cat-dot" style="background:${cat.color}" aria-hidden="true"></span>
      <span class="cat-name">${cat.label}</span>
      <span class="cat-val tnum">${eur.format(val)}</span>`;
    els.catSummary.appendChild(chip);
  }
}

function renderList(kind, ul, pf) {
  const items = entriesForMonth(viewMonth).filter(
    (e) => e.kind === kind && (!pf || potOf(e) === pf)
  );
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
    btn.type = "button";
    btn.className = "row";
    btn.addEventListener("click", () => openEntrySheet(e));

    const dot = document.createElement("span");
    if (kind === "out") {
      const c = CATS[catOf(e)];
      dot.className = "row-dot";
      dot.style.background = c.color + "22";
      dot.textContent = c.icon;
    } else {
      dot.className = "row-dot in";
      dot.textContent = "↓";
    }
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "row-main";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = e.label;
    main.appendChild(label);

    const bits = [];
    bits.push(`${e.day || 1}e`);
    if (selectedPot === "all") bits.push(getPot(potOf(e)).label);
    if (kind === "out") bits.push(CATS[catOf(e)].label);
    if (e.recurring) bits.push("↻ maandelijks");
    if (bits.length) {
      const tag = document.createElement("span");
      tag.className = "row-tag";
      tag.textContent = bits.join(" · ");
      main.appendChild(tag);
    }

    const amount = document.createElement("span");
    amount.className = `row-amount tnum ${kind}`;
    amount.textContent = (kind === "in" ? "+ " : "− ") + eur.format(e.amount);

    btn.append(dot, main, amount);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

// Dagelijkse cashflow-grafiek: loopt saldo dag voor dag op, scrubbaar.
function renderChart(pf) {
  const start = state.startMonth;
  const endM = addMonths(maxKey(viewMonth, currentMonthKey()), 6);
  let span = monthsBetween(start, endM);
  span = Math.max(5, Math.min(17, span));

  const pts = [];               // {key, day, balance}
  const monthStart = [];        // {index, key}
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
    for (let d = 1; d <= dim; d++) {
      bal += deltas[d];
      pts.push({ key: mk, day: d, balance: bal });
    }
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

  const zero = min < 0 && max > 0
    ? `<line class="c-zero" x1="${padX}" y1="${Y(0).toFixed(1)}" x2="${(W - padX).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>` : "";

  els.projSub.textContent = pf ? `${getPot(pf).label}` : "sleep om te bekijken";
  els.chartScroll.innerHTML = `
    <svg class="chart-svg" width="${W.toFixed(0)}" height="${H}" viewBox="0 0 ${W.toFixed(0)} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="c-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.30"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0.02"/>
      </linearGradient></defs>
      ${zero}
      <path class="c-area" d="${area}"/>
      <path class="c-line" d="${line.trim()}"/>
      ${ticks}
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

  // Startfocus: vandaag (indien huidige maand in beeld), anders 1e van bekeken maand
  let focusIdx = monthStart[0].index;
  const vm = monthStart.find((m) => m.key === viewMonth);
  if (vm) {
    focusIdx = vm.index;
    if (viewMonth === nowKey) focusIdx = vm.index + Math.min(todayDay(), daysInMonth(nowKey)) - 1;
  }
  setFocus(focusIdx);
  requestAnimationFrame(() => {
    els.chartScroll.scrollLeft = X(focusIdx) - els.chartScroll.clientWidth / 2;
  });

  const idxFromEvent = (ev) => {
    const rect = svgEl.getBoundingClientRect();
    return Math.round((ev.clientX - rect.left - padX) / stepX);
  };
  let downX = null, moved = false, ptype = null;
  svgEl.addEventListener("pointerdown", (ev) => {
    downX = ev.clientX; moved = false; ptype = ev.pointerType;
    if (ptype !== "touch") setFocus(idxFromEvent(ev)); // muis: direct scrubben
  });
  svgEl.addEventListener("pointermove", (ev) => {
    if (downX === null) return;
    if (Math.abs(ev.clientX - downX) > 6) moved = true;
    if (ptype !== "touch" && ev.buttons & 1) setFocus(idxFromEvent(ev));
  });
  svgEl.addEventListener("pointerup", (ev) => {
    if (downX === null) return;
    const tap = !moved;
    const wasTouch = ptype === "touch";
    downX = null;
    // Muis: altijd naar focus; touch: alleen bij een tik (drag = pannen)
    if (!wasTouch || tap) {
      const p = setFocus(idxFromEvent(ev));
      if (p && p.key !== viewMonth) { viewMonth = clampToStart(p.key); haptic(6); renderBudget(); }
    }
  });
  svgEl.addEventListener("pointercancel", () => { downX = null; });
}

/* ============================================================
   Render — Vermogen
   ============================================================ */
function renderVermogen() {
  const cash = liquidNow();
  const inv = investTotal();
  const total = cash + inv;
  els.worthCash.textContent = eur.format(cash);
  els.worthInvest.textContent = eur.format(inv);
  els.worthTotal.textContent = eur.format(total);
  els.worthTotal.classList.toggle("is-neg", total < 0);
  renderAllocation();
  renderInvestList();
}

function renderAllocation() {
  const cur = clampToStart(currentMonthKey());
  const parts = [
    ...state.pots.map((p, i) => ({
      label: p.label,
      value: Math.max(0, endBalance(cur, p.id)),
      color: POT_COLORS[i % POT_COLORS.length],
    })),
    ...state.investments.map((iv, i) => ({
      label: iv.label,
      value: Math.max(0, Number(iv.value) || 0),
      color: INV_COLORS[i % INV_COLORS.length],
    })),
  ].filter((p) => p.value > 0);

  els.alloc.innerHTML = "";
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (sum <= 0) {
    els.alloc.innerHTML = `<p class="empty" style="padding:8px 4px">Nog niets om te verdelen. Vul een beginsaldo of belegging in.</p>`;
    return;
  }

  const bar = document.createElement("div");
  bar.className = "alloc-bar";
  for (const p of parts) {
    const seg = document.createElement("span");
    seg.className = "alloc-seg";
    seg.style.width = `${(p.value / sum) * 100}%`;
    seg.style.background = p.color;
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
    row.innerHTML = `
      <span class="cat-dot" style="background:${p.color}" aria-hidden="true"></span>
      <span class="alloc-label">${escapeHtml(p.label)}</span>
      <span class="alloc-pct tnum">${pct}%</span>
      <span class="alloc-amt tnum">${eur.format(p.value)}</span>`;
    legend.appendChild(row);
  }
  els.alloc.appendChild(legend);
}

function renderInvestList() {
  const ul = els.listInvest;
  ul.innerHTML = "";
  if (state.investments.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nog geen beleggingen. Voeg je eerste rekening toe.";
    ul.appendChild(li);
    return;
  }
  for (const inv of state.investments) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.addEventListener("click", () => openInvestSheet(inv));

    const dot = document.createElement("span");
    dot.className = "row-dot";
    dot.style.background = "rgba(62,124,177,0.16)";
    dot.textContent = "📈";
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "row-main";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = inv.label;
    main.appendChild(label);

    const amount = document.createElement("span");
    amount.className = "row-amount tnum";
    amount.textContent = eur.format(Number(inv.value) || 0);

    btn.append(dot, main, amount);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   Tabs
   ============================================================ */
const tabBudget = $("#tab-budget");
const tabVermogen = $("#tab-vermogen");
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    haptic(6);
    const isBudget = activeTab === "budget";
    tabBudget.hidden = !isBudget;
    tabVermogen.hidden = isBudget;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
});

/* ============================================================
   Maandnavigatie
   ============================================================ */
els.prev.addEventListener("click", () => { viewMonth = clampToStart(addMonths(viewMonth, -1)); renderBudget(); });
els.next.addEventListener("click", () => { viewMonth = addMonths(viewMonth, 1); renderBudget(); });
els.today.addEventListener("click", () => { viewMonth = clampToStart(currentMonthKey()); renderBudget(); });

/* ============================================================
   Entry-sheet (toevoegen / bewerken)
   ============================================================ */
const entryOverlay = $("#entry-overlay");
const entryForm = $("#entry-form");
const fLabel = $("#f-label");
const fAmount = $("#f-amount");
const fDay = $("#f-day");
const fRecurring = $("#f-recurring");
const entryTitle = $("#entry-title");
const entryError = $("#entry-error");
const segOpts = [...document.querySelectorAll(".seg-opt")];
const catField = $("#cat-field");
const catRow = $("#cat-row");
const potRow = $("#pot-row");

let editing = null;
let formKind = "in";
let formCat = DEFAULT_CAT;
let formPot = firstPotId();

// categorie-chips
for (const key of CAT_KEYS) {
  const c = CATS[key];
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "cat-chip";
  chip.dataset.cat = key;
  chip.setAttribute("role", "radio");
  chip.style.setProperty("--c", c.color);
  chip.innerHTML = `<span aria-hidden="true">${c.icon}</span> ${c.label}`;
  chip.addEventListener("click", () => setCat(key));
  catRow.appendChild(chip);
}

function setCat(key) {
  formCat = CATS[key] ? key : DEFAULT_CAT;
  catRow.querySelectorAll(".cat-chip").forEach((ch) => {
    const on = ch.dataset.cat === formCat;
    ch.classList.toggle("is-on", on);
    ch.setAttribute("aria-checked", String(on));
  });
}

// potje-chips (herbouwen zodat wijzigingen meteen zichtbaar zijn)
function buildPotChips() {
  potRow.innerHTML = "";
  for (const p of state.pots) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cat-chip";
    chip.dataset.pot = p.id;
    chip.setAttribute("role", "radio");
    chip.style.setProperty("--c", "var(--accent)");
    chip.textContent = p.label;
    chip.addEventListener("click", () => setPot(p.id));
    potRow.appendChild(chip);
  }
}
function setPot(id) {
  formPot = getPot(id) ? id : firstPotId();
  potRow.querySelectorAll(".cat-chip").forEach((ch) => {
    const on = ch.dataset.pot === formPot;
    ch.classList.toggle("is-on", on);
    ch.setAttribute("aria-checked", String(on));
  });
}

function setKind(kind) {
  formKind = kind;
  for (const opt of segOpts) opt.setAttribute("aria-selected", String(opt.dataset.kind === kind));
  catField.hidden = kind !== "out";
}
segOpts.forEach((opt) => {
  opt.setAttribute("role", "tab");
  opt.addEventListener("click", () => setKind(opt.dataset.kind));
});

function openEntrySheet(entry, presetKind) {
  entryError.hidden = true;
  buildPotChips();
  if (entry) {
    editing = { id: entry.id, recurring: entry.recurring, kind: entry.kind };
    entryTitle.textContent = "Bewerken";
    setKind(entry.kind);
    setCat(catOf(entry));
    setPot(potOf(entry));
    fLabel.value = entry.label;
    fAmount.value = String(entry.amount).replace(".", ",");
    fDay.value = entry.day ? String(entry.day) : "";
    fRecurring.checked = !!entry.recurring;
  } else {
    editing = null;
    entryTitle.textContent = "Toevoegen";
    setKind(presetKind || "in");
    setCat(DEFAULT_CAT);
    setPot(selectedPot !== "all" ? selectedPot : firstPotId());
    fLabel.value = "";
    fAmount.value = "";
    fDay.value = "";
    fRecurring.checked = false;
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

  const dayNum = Math.floor(Number(fDay.value));
  const day = Number.isFinite(dayNum) && dayNum >= 1 ? Math.min(dayNum, 31) : 1;

  const recurring = fRecurring.checked;
  const rec = { kind: formKind, label, amount, potId: formPot, day };
  if (formKind === "out") rec.category = formCat;

  if (editing) removeEntry(editing.id, editing.recurring, viewMonth, true);

  if (recurring) state.recurring.push({ id: uid(), fromMonth: viewMonth, ...rec });
  else ensureMonth(viewMonth).entries.push({ id: uid(), ...rec });

  haptic(12);
  saveState();
  closeOverlay(entryOverlay);
  render();
});

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
    if (!silent && removed) {
      haptic(18); saveState(); render();
      toast("Terugkerende post verwijderd", () => { state.recurring.push(removed); saveState(); render(); });
    }
  } else {
    const md = ensureMonth(key);
    const idx = md.entries.findIndex((e) => e.id === id);
    const removed = idx >= 0 ? md.entries.splice(idx, 1)[0] : null;
    if (!silent && removed) {
      haptic(18); saveState(); render();
      toast("Post verwijderd", () => { ensureMonth(key).entries.push(removed); saveState(); render(); });
    }
  }
}

function skipRecurringThisMonth(id, key) {
  const md = ensureMonth(key);
  if (!md.skip.includes(id)) md.skip.push(id);
  saveState(); render();
  toast("Overgeslagen deze maand", () => {
    const m = ensureMonth(key);
    m.skip = m.skip.filter((s) => s !== id);
    saveState(); render();
  });
}

/* ---------- Verwijderknop in bewerk-sheet ---------- */
const entryActions = entryForm.querySelector(".sheet-actions");
const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "btn-danger";
deleteBtn.textContent = "Verwijderen";
deleteBtn.style.display = "none";
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
investDelete.type = "button";
investDelete.className = "btn-danger";
investDelete.textContent = "Verwijderen";
investDelete.style.display = "none";
investDelete.addEventListener("click", () => {
  if (!editingInvest) return;
  const idx = state.investments.findIndex((i) => i.id === editingInvest);
  const removed = idx >= 0 ? state.investments.splice(idx, 1)[0] : null;
  closeOverlay(investOverlay);
  if (removed) {
    haptic(18); saveState(); render();
    toast("Belegging verwijderd", () => { state.investments.splice(idx, 0, removed); saveState(); render(); });
  }
});
investActions.parentNode.insertBefore(investDelete, investActions);

function openInvestSheet(inv) {
  investError.hidden = true;
  if (inv) {
    editingInvest = inv.id;
    investTitle.textContent = "Belegging bewerken";
    iLabel.value = inv.label;
    iValue.value = String(inv.value).replace(".", ",");
    investDelete.style.display = "block";
  } else {
    editingInvest = null;
    investTitle.textContent = "Belegging toevoegen";
    iLabel.value = "";
    iValue.value = "";
    investDelete.style.display = "none";
  }
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

  if (editingInvest) {
    const inv = state.investments.find((i) => i.id === editingInvest);
    if (inv) { inv.label = label; inv.value = value; }
  } else {
    state.investments.push({ id: uid(), label, value });
  }
  haptic(12);
  saveState();
  closeOverlay(investOverlay);
  render();
});

/* ============================================================
   Choice-sheet (terugkerende post verwijderen)
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
  function cleanup() {
    choiceA.removeEventListener("click", onA);
    choiceB.removeEventListener("click", onB);
  }
  choiceA.addEventListener("click", onA);
  choiceB.addEventListener("click", onB);
  openOverlay(choiceOverlay);
}

/* ============================================================
   Overlays helper
   ============================================================ */
let lastFocus = null;
function openOverlay(overlay) {
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeOverlay(overlay) {
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ov = btn.closest(".sheet-overlay");
    if (ov) closeOverlay(ov);
  });
});
document.querySelectorAll(".sheet-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => { if (e.target === ov) closeOverlay(ov); });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const open = [...document.querySelectorAll(".sheet-overlay")].find((o) => !o.hidden);
    if (open) closeOverlay(open);
  }
});
document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => openEntrySheet(null, btn.dataset.add));
});

/* ---------- Zwevende +-knop ---------- */
$("#fab").addEventListener("click", () => {
  haptic(10);
  if (activeTab === "vermogen") openInvestSheet(null);
  else openEntrySheet(null, "out");
});

/* ============================================================
   Instellingen — potjes, startmaand, back-up
   ============================================================ */
const settingsOverlay = $("#settings-overlay");
const sStartMonth = $("#s-start-month");
const potManage = $("#pot-manage");

function renderPotManage() {
  potManage.innerHTML = "";
  state.pots.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "pot-edit";

    const name = document.createElement("input");
    name.className = "pe-name";
    name.value = p.label;
    name.setAttribute("aria-label", "Naam potje");
    name.addEventListener("change", () => {
      p.label = name.value.trim() || `Potje ${idx + 1}`;
      saveState(); render();
    });

    const balWrap = document.createElement("div");
    balWrap.className = "pe-bal-wrap";
    const cur = document.createElement("span");
    cur.className = "cur";
    cur.textContent = "€";
    const bal = document.createElement("input");
    bal.className = "pe-bal";
    bal.inputMode = "decimal";
    bal.placeholder = "0,00";
    bal.value = p.startBalance ? String(p.startBalance).replace(".", ",") : "";
    bal.setAttribute("aria-label", "Beginsaldo potje");
    bal.addEventListener("change", () => {
      const v = parseAmount(bal.value);
      p.startBalance = Number.isFinite(v) ? v : 0;
      saveState(); render();
    });
    balWrap.append(cur, bal);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "pot-del";
    del.setAttribute("aria-label", `Potje ${p.label} verwijderen`);
    del.textContent = "×";
    del.addEventListener("click", () => {
      if (state.pots.length <= 1) return toast("Je hebt minstens één potje nodig");
      const removed = state.pots.splice(idx, 1)[0];
      haptic(18); saveState(); renderPotManage(); render();
      toast("Potje verwijderd", () => {
        state.pots.splice(idx, 0, removed);
        saveState(); renderPotManage(); render();
      });
    });

    row.append(name, balWrap, del);
    potManage.appendChild(row);
  });
}

$("#pot-add").addEventListener("click", () => {
  state.pots.push({ id: uid(), label: "Nieuw potje", startBalance: 0 });
  haptic(10); saveState(); renderPotManage(); render();
});

function openSettings() {
  renderPotManage();
  sStartMonth.value = state.startMonth;
  openOverlay(settingsOverlay);
}
$("#btn-settings").addEventListener("click", openSettings);
$("#hint-setup").addEventListener("click", openSettings);

function commitSettings() {
  if (/^\d{4}-\d{2}$/.test(sStartMonth.value)) {
    state.startMonth = sStartMonth.value;
    viewMonth = clampToStart(viewMonth);
  }
  saveState();
  render();
}
sStartMonth.addEventListener("change", commitSettings);
settingsOverlay.querySelector("[data-close]").addEventListener("click", commitSettings);

/* ---------- Export / import / reset ---------- */
$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-backup-${currentMonthKey()}.json`;
  a.click();
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
    selectedPot = "all";
    viewMonth = clampToStart(currentMonthKey());
    saveState();
    render();
    renderPotManage();
    closeOverlay(settingsOverlay);
    toast("Back-up geïmporteerd");
  } catch {
    toast("Kon dit bestand niet lezen");
  } finally {
    importFile.value = "";
  }
});

$("#btn-reset").addEventListener("click", () => {
  const snapshot = JSON.stringify(state);
  state = defaultState();
  selectedPot = "all";
  viewMonth = currentMonthKey();
  saveState();
  render();
  closeOverlay(settingsOverlay);
  toast("Alles gewist", () => {
    state = JSON.parse(snapshot);
    selectedPot = "all";
    viewMonth = clampToStart(currentMonthKey());
    saveState();
    render();
  });
});

/* ============================================================
   Toast met undo
   ============================================================ */
const toastEl = $("#toast");
const toastText = $("#toast-text");
const toastAction = $("#toast-action");
let toastTimer = null;

function toast(msg, onUndo) {
  clearTimeout(toastTimer);
  toastText.textContent = msg;
  if (onUndo) {
    toastAction.textContent = "Ongedaan maken";
    toastAction.style.display = "";
    toastAction.onclick = () => { clearTimeout(toastTimer); toastEl.hidden = true; onUndo(); };
  } else {
    toastAction.style.display = "none";
    toastAction.onclick = null;
  }
  toastEl.hidden = false;
  toastTimer = setTimeout(() => (toastEl.hidden = true), 5000);
}

/* ---------- utils ---------- */
function isTouch() {
  return window.matchMedia("(pointer: coarse)").matches;
}

/* ============================================================
   Init + service worker
   ============================================================ */
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
