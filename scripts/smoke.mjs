import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

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

// Seed via UI: open settings, set beginsaldo van het eerste potje (Algemeen)
await page.click("#btn-settings");
const firstBal = page.locator("#pot-manage .pot-edit").first().locator(".pe-bal");
await firstBal.fill("5000");
await firstBal.blur();
await page.click("#settings-overlay [data-close]");

// Voeg terugkerend spaarbedrag toe
await page.click('[data-add="in"]');
await page.fill("#f-label", "Maandelijks sparen");
await page.fill("#f-amount", "800");
await page.click(".switch-track");
await page.click("#entry-submit");

// Voeg aankoop toe in categorie Baby
await page.click('[data-add="out"]');
await page.click('.cat-chip[data-cat="baby"]');
await page.fill("#f-label", "Kinderwagen");
await page.fill("#f-amount", "1200");
await page.click("#entry-submit");

// Voeg aankoop toe in categorie Huis
await page.click('[data-add="out"]');
await page.click('.cat-chip[data-cat="huis"]');
await page.fill("#f-label", "Bank");
await page.fill("#f-amount", "2500");
await page.click("#entry-submit");

await page.waitForTimeout(300);
const endBalance = await page.textContent("#end-balance");
const totalOut = await page.textContent("#total-out");
await page.screenshot({ path: path.join(root, "scripts", "shot-budget.png"), fullPage: true });

// Vermogen-tab
await page.click('.tab-btn[data-tab="vermogen"]');
await page.click("#add-invest");
await page.fill("#i-label", "Meesman");
await page.fill("#i-value", "15000");
await page.click("#invest-form button[type=submit]");
await page.waitForTimeout(300);
const worthTotal = await page.textContent("#worth-total");
const worthCash = await page.textContent("#worth-cash");
await page.screenshot({ path: path.join(root, "scripts", "shot-vermogen.png"), fullPage: true });

await browser.close();
server.close();

console.log("Budget eindsaldo:", endBalance, "| aankopen:", totalOut);
console.log("Vermogen totaal:", worthTotal, "| spaargeld:", worthCash);
console.log("Console errors:", errors.length ? errors : "geen");
if (errors.length) process.exit(1);
