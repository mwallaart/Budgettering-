import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}/`;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 402, height: 850 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(base, { waitUntil: "networkidle" });

// Instellingen: beginsaldo + doel voor eerste potje (Algemeen)
await page.click("#btn-settings");
const pot1 = page.locator("#pot-manage .pot-edit").first();
const bal = pot1.locator(".pe-col").nth(0).locator(".pe-money input");
const goal = pot1.locator(".pe-col").nth(1).locator(".pe-money input");
await bal.fill("5000"); await bal.blur();
await goal.fill("10000"); await goal.blur();
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(root, "scripts", "shot-settings.png") });
await page.click("#settings-overlay [data-close]");

// Naar Maand-tab om posten toe te voegen
await page.click('.tab-btn[data-tab="maand"]');

// Terugkerend spaarbedrag (25e)
await page.click('[data-add="in"]');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(root, "scripts", "shot-sheet.png") });
await page.fill("#f-label", "Maandelijks sparen");
await page.fill("#f-amount", "800");
await page.fill("#f-day", "25");
await page.click(".switch-track");
await page.click("#entry-submit");

// Aankoop Baby (10e)
await page.click('[data-add="out"]');
await page.click('.cat-chip[data-cat="baby"]');
await page.fill("#f-label", "Kinderwagen");
await page.fill("#f-amount", "1200");
await page.fill("#f-day", "10");
await page.click("#entry-submit");

// Aankoop Huis (15e)
await page.click('[data-add="out"]');
await page.click('.cat-chip[data-cat="huis"]');
await page.fill("#f-label", "Bank");
await page.fill("#f-amount", "2500");
await page.fill("#f-day", "15");
await page.click("#entry-submit");

await page.waitForTimeout(700);
const endBalance = await page.textContent("#end-balance");
const totalOut = await page.textContent("#total-out");
await page.screenshot({ path: path.join(root, "scripts", "shot-maand.png"), fullPage: true });

// Overzicht-tab
await page.click('.tab-btn[data-tab="overzicht"]');
await page.waitForTimeout(700);
const ovNow = await page.textContent("#ov-now");
const monthRows = await page.locator("#month-list .month-row").count();
await page.screenshot({ path: path.join(root, "scripts", "shot-overzicht.png"), fullPage: true });

// Vermogen-tab
await page.click('.tab-btn[data-tab="vermogen"]');
await page.click("#add-invest");
await page.fill("#i-label", "Meesman");
await page.fill("#i-value", "15000");
await page.click("#invest-form button[type=submit]");
await page.waitForTimeout(700);
const worthTotal = await page.textContent("#worth-total");
await page.screenshot({ path: path.join(root, "scripts", "shot-vermogen.png"), fullPage: true });

// --- Nav bar: moet één rij zijn (3 tabs naast elkaar) en de FAB niet raken ---
const navCheck = await page.evaluate(() => {
  const bar = document.querySelector(".tabbar");
  const btns = [...document.querySelectorAll(".tab-btn")];
  const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
  const fab = document.querySelector(".fab").getBoundingClientRect();
  const barR = bar.getBoundingClientRect();
  return {
    rows: tops.size,
    tabs: btns.length,
    barHeight: Math.round(barR.height),
    fabGap: Math.round(barR.top - fab.bottom),
    overlap: fab.bottom > barR.top,
  };
});

// --- Donkere modus ---
await page.emulateMedia({ colorScheme: "dark" });
await page.click('.tab-btn[data-tab="overzicht"]');
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(root, "scripts", "shot-dark.png"), fullPage: true });
await page.click('.tab-btn[data-tab="maand"]');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(root, "scripts", "shot-dark-maand.png"), fullPage: true });

// --- Alle sheets op smal scherm: niets mag rechts uitlopen ---
await page.setViewportSize({ width: 320, height: 640 });
const sheetIssues = [];
for (const [name, open] of [
  ["instellingen", async () => { await page.click("#btn-settings"); }],
  ["invoer", async () => { await page.click('.tab-btn[data-tab="maand"]'); await page.click('[data-add="out"]'); }],
  ["belegging", async () => { await page.click('.tab-btn[data-tab="vermogen"]'); await page.click("#add-invest"); }],
  ["maandkiezer", async () => { await page.click('.tab-btn[data-tab="maand"]'); await page.click("#month-name"); }],
]) {
  await open();
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const ov = [...document.querySelectorAll(".sheet-overlay")].find((o) => !o.hidden);
    if (!ov) return { missing: true };
    const sheet = ov.querySelector(".sheet");
    const vw = window.innerWidth, vh = window.innerHeight;
    const bad = [];
    for (const el of ov.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) {
        bad.push(el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0]);
      }
    }
    const act = sheet.querySelector(".sheet-actions");
    const ar = act ? act.getBoundingClientRect() : null;
    return {
      hOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
      offscreen: [...new Set(bad)],
      actionsVisible: ar ? ar.bottom <= vh + 1 && ar.top >= 0 : null,
    };
  });
  if (r.missing || r.hOverflow || r.offscreen.length || r.actionsVisible === false) sheetIssues.push([name, r]);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

await browser.close();
server.close();

console.log("Nav:", JSON.stringify(navCheck));
console.log("Sheets:", sheetIssues.length ? JSON.stringify(sheetIssues, null, 2) : "alle 4 OK (geen overflow, acties zichtbaar)");
if (sheetIssues.length) process.exitCode = 1;

console.log("Maand eindsaldo:", endBalance, "| aankopen:", totalOut);
console.log("Overzicht spaargeld nu:", ovNow, "| maandrijen:", monthRows);
console.log("Vermogen totaal:", worthTotal);
console.log("Console errors:", errors.length ? errors : "geen");
if (errors.length) process.exit(1);
