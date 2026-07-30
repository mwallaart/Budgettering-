import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".gif": "image/gif", ".woff2": "font/woff2",
};

const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
  rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: EXE });
const errors = [];

async function newPage(w = 390, h = 844, theme = "light") {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.addInitScript((t) => { localStorage.setItem("budget-theme", t); }, theme);
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
  return page;
}

// Realistische staat: potjes met doelen, vaste lasten, verdeling, beleggingen
function seed() {
  const d = new Date();
  const k = (n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
  return {
    version: 5,
    startMonth: k(0),
    pots: [
      { id: "alg", label: "Algemeen", icon: "🪙", startBalance: 2500, goal: 0, goalDate: null },
      { id: "spaar", label: "Sparen", icon: "🐖", startBalance: 12000, goal: 25000, goalDate: k(23) },
      { id: "vak", label: "Vakantie", icon: "🏖️", startBalance: 1500, goal: 4000, goalDate: k(11) },
      { id: "pers", label: "Persoonlijk", icon: "👤", startBalance: 800, goal: 0, goalDate: null },
    ],
    recurring: [
      { id: "i1", kind: "in", group: "in", label: "Salaris Mitchel", amount: 3662, day: 25, potId: "alg", fromMonth: k(0) },
      { id: "i2", kind: "in", group: "in", label: "Salaris partner", amount: 3350, day: 24, potId: "alg", fromMonth: k(0) },
      { id: "u1", kind: "out", label: "Hypotheek", amount: 1800, day: 1, potId: "alg", category: "huis", fromMonth: k(0) },
      { id: "u2", kind: "out", label: "Zorgverzekering", amount: 350, day: 1, potId: "alg", category: "verzekering", review: true, fromMonth: k(0) },
      { id: "u3", kind: "out", label: "Gas / elektra", amount: 150, day: 2, potId: "alg", category: "huis", fromMonth: k(0) },
      { id: "u4", kind: "out", label: "Boodschappen", amount: 500, day: 5, potId: "alg", category: "bood", fromMonth: k(0) },
      { id: "u5", kind: "out", label: "Ziggo", amount: 50, day: 4, potId: "alg", category: "abo", review: true, fromMonth: k(0) },
      { id: "o1", kind: "move", group: "over", label: "Naar Sparen", amount: 1000, day: 26, potId: "alg", toPot: "spaar", fromMonth: k(0) },
      { id: "o2", kind: "move", group: "over", label: "Naar Vakantie", amount: 500, day: 26, potId: "alg", toPot: "vak", fromMonth: k(0) },
      { id: "o3", kind: "out", group: "over", label: "Beleggen", amount: 500, day: 26, potId: "alg", category: "overig", fromMonth: k(0) },
    ],
    months: {
      [k(1)]: { entries: [{ id: "e1", kind: "out", label: "Vliegtickets Portugal", amount: 1240, day: 20, potId: "vak", category: "overig" }], skip: [] },
      [k(2)]: { entries: [{ id: "e2", kind: "in", label: "Vakantiegeld", amount: 2100, day: 22, potId: "alg" }], skip: [] },
      [k(3)]: { entries: [{ id: "e3", kind: "out", label: "APK + winterbanden", amount: 340, day: 9, potId: "alg", category: "vervoer" }], skip: [] },
    },
    investments: [
      { id: "v1", label: "Meesman wereldwijd", value: 18400, monthly: 500, updated: "2026-07-28" },
      { id: "v2", label: "DEGIRO ETF", value: 7250, monthly: 0, updated: "2026-06-30" },
    ],
    recentLabels: ["Boodschappen", "Tandarts", "Benzine"],
    backupDismissed: false,
    lastBackup: null,
  };
}

async function load(page, withData = true) {
  await page.goto(base, { waitUntil: "networkidle" });
  if (withData) {
    await page.evaluate((j) => localStorage.setItem("budget-glass-v1", j), JSON.stringify(seed()));
    await page.reload({ waitUntil: "networkidle" });
  }
  // laadscherm wegwachten
  await page.waitForSelector("#loader[hidden]", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(700);
}

/* ---------- 1. Licht thema, drie schermen ---------- */
const page = await newPage();
await load(page);

const ov = {
  amount: await page.textContent("#ov-amount"),
  safe: await page.textContent("#ov-safe"),
  pots: await page.textContent("#ov-pots"),
  rows: await page.locator("#month-list .mrow").count(),
  warn: !(await page.locator("#warn-card").isHidden()),
};
await page.screenshot({ path: path.join(root, "scripts", "shot-overzicht.png"), fullPage: true });

await page.click('.tab[data-tab="maand"]');
await page.waitForTimeout(700);
const mo = {
  end: await page.textContent("#month-end"),
  hhIn: await page.textContent("#hh-in"),
  hhFixed: await page.textContent("#hh-fixed"),
  hhLeft: await page.textContent("#hh-left"),
  hhRest: await page.textContent("#hh-rest"),
  pots: await page.locator("#pots .pot").count(),
  groups: await page.locator("#groups .group").count(),
};
await page.screenshot({ path: path.join(root, "scripts", "shot-maand.png"), fullPage: true });

await page.click('.tab[data-tab="vermogen"]');
await page.waitForTimeout(700);
const we = {
  total: await page.textContent("#w-amount"),
  invests: await page.locator("#invest-list .irow").count(),
  cats: await page.locator("#year-cats .ycat").count(),
};
await page.screenshot({ path: path.join(root, "scripts", "shot-vermogen.png"), fullPage: true });

/* ---------- 2. Privacy-modus ---------- */
await page.click('.tab[data-tab="overzicht"]');
await page.waitForTimeout(300);
await page.click("#hero-savings");
await page.waitForTimeout(300);
const masked = await page.textContent("#ov-amount");
await page.click("#hero-savings");
await page.waitForTimeout(400);

/* ---------- 3. Post toevoegen via FAB ---------- */
await page.click("#fab");
await page.waitForTimeout(400);
await page.fill("#f-amount", "75");
await page.fill("#f-label", "Testpost");
await page.waitForTimeout(400);
const whatIfVisible = !(await page.locator("#whatif").isHidden());
await page.screenshot({ path: path.join(root, "scripts", "shot-sheet-entry.png") });
await page.click("#entry-save");
await page.waitForTimeout(600);
const afterAdd = await page.locator('#groups .row:has-text("Testpost")').count();

/* ---------- 4. Overboeken ---------- */
await page.click('.tab[data-tab="maand"]');
await page.waitForTimeout(400);
await page.click("#open-transfer");
await page.waitForTimeout(400);
await page.fill("#tf-amount", "200");
await page.screenshot({ path: path.join(root, "scripts", "shot-sheet-transfer.png") });
await page.click('#sh-transfer button[type=submit]');
await page.waitForTimeout(600);
const afterTransfer = await page.locator('#groups .row').count();

/* ---------- 5. Instellingen ---------- */
await page.click("#btn-settings");
await page.waitForTimeout(400);
const potEdits = await page.locator("#pot-manage .pot-edit").count();
await page.screenshot({ path: path.join(root, "scripts", "shot-sheet-settings.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ---------- 6. Nav + FAB overlap ---------- */
const nav = await page.evaluate(() => {
  const bar = document.querySelector(".tabbar").getBoundingClientRect();
  const fab = document.querySelector(".fab").getBoundingClientRect();
  const tabs = [...document.querySelectorAll(".tab")];
  const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
  return { rows: tops.size, tabs: tabs.length, fabGap: Math.round(bar.top - fab.bottom), overlap: fab.bottom > bar.top };
});
await page.close();

/* ---------- 7. Smal scherm: alle sheets ---------- */
const narrow = await newPage(320, 640);
await load(narrow);
const sheetIssues = [];
const opens = [
  ["instellingen", async (p) => { await p.click("#btn-settings"); }],
  ["invoer", async (p) => { await p.click("#fab"); }],
  ["overboeken", async (p) => { await p.click('.tab[data-tab="maand"]'); await p.click("#open-transfer"); }],
  ["belegging", async (p) => { await p.click('.tab[data-tab="vermogen"]'); await p.click("#add-invest"); }],
  ["maandkiezer", async (p) => { await p.click('.tab[data-tab="maand"]'); await p.click("#month-title"); }],
];
for (const [name, open] of opens) {
  await open(narrow);
  await narrow.waitForTimeout(400);
  const r = await narrow.evaluate(() => {
    const sheet = [...document.querySelectorAll(".sheet")].find((s) => !s.hidden);
    if (!sheet) return { missing: true };
    const vw = window.innerWidth, vh = window.innerHeight;
    const bad = [];
    for (const el of sheet.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) bad.push(el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0]);
    }
    const foot = sheet.querySelector(".sheet-foot");
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      hOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
      offscreen: [...new Set(bad)].slice(0, 6),
      footVisible: fr ? fr.bottom <= vh + 1 && fr.top >= 0 : null,
    };
  });
  if (r.missing || r.hOverflow || r.offscreen.length || r.footVisible === false) sheetIssues.push([name, r]);
  await narrow.keyboard.press("Escape");
  await narrow.waitForTimeout(250);
}
// Body mag nooit horizontaal scrollen
const bodyOverflow = await narrow.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await narrow.screenshot({ path: path.join(root, "scripts", "shot-320.png"), fullPage: true });
await narrow.close();

/* ---------- 8. Donker thema ---------- */
const dark = await newPage(390, 844, "dark");
await load(dark);
await dark.screenshot({ path: path.join(root, "scripts", "shot-dark.png"), fullPage: true });
await dark.click('.tab[data-tab="maand"]');
await dark.waitForTimeout(700);
await dark.screenshot({ path: path.join(root, "scripts", "shot-dark-maand.png"), fullPage: true });
const darkTheme = await dark.getAttribute("html", "data-theme");
await dark.close();

/* ---------- 9. Lege staat ---------- */
const empty = await newPage();
await load(empty, false);
const emptyShown = !(await empty.locator("#empty-card").isHidden());
await empty.screenshot({ path: path.join(root, "scripts", "shot-leeg.png"), fullPage: true });
await empty.close();

await browser.close();
server.close();

console.log("Overzicht:", JSON.stringify(ov));
console.log("Maand:", JSON.stringify(mo));
console.log("Vermogen:", JSON.stringify(we));
console.log("Privacy gemaskeerd:", masked, "| wat-als zichtbaar:", whatIfVisible);
console.log("Na toevoegen rijen 'Testpost':", afterAdd, "| na overboeken rijen:", afterTransfer);
console.log("Potjes in instellingen:", potEdits);
console.log("Nav:", JSON.stringify(nav));
console.log("Sheets 320px:", sheetIssues.length ? JSON.stringify(sheetIssues, null, 2) : "alle 5 OK");
console.log("Body h-overflow op 320px:", bodyOverflow);
console.log("Donker thema:", darkTheme, "| lege staat zichtbaar:", emptyShown);
console.log("Fouten:", errors.length ? errors.slice(0, 8) : "geen");
if (errors.length || sheetIssues.length || nav.overlap || bodyOverflow) process.exitCode = 1;
