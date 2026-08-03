import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { launchOptions } from "./browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch(launchOptions());
// Smal toestel = strengste test (iPhone SE-breedte)
const page = await browser.newPage({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2 });
await page.goto(base, { waitUntil: "networkidle" });

await page.click("#btn-settings");
// Extra potjes zodat het scherm echt vol is
for (let i = 0; i < 2; i++) await page.click("#pot-add");
await page.waitForTimeout(300);

const diag = await page.evaluate(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const sheet = document.querySelector("#settings-overlay .sheet");
  const sr = sheet.getBoundingClientRect();

  // Welke elementen steken buiten de viewport-breedte?
  const wide = [];
  for (const el of document.querySelectorAll("#settings-overlay *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      wide.push({
        sel: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").join(".") : ""),
        left: Math.round(r.left), right: Math.round(r.right),
      });
    }
  }

  const last = document.querySelector("#settings-overlay .sheet-actions .btn-primary");
  const lr = last.getBoundingClientRect();

  return {
    viewport: { vw, vh },
    sheet: {
      top: Math.round(sr.top), bottom: Math.round(sr.bottom),
      height: Math.round(sr.height),
      scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight,
      scrollWidth: sheet.scrollWidth, clientWidth: sheet.clientWidth,
      canScrollY: sheet.scrollHeight > sheet.clientHeight + 1,
      hasHOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
      belowViewport: sr.bottom > vh + 0.5,
    },
    lastButton: { top: Math.round(lr.top), bottom: Math.round(lr.bottom), reachableNow: lr.bottom <= vh + 0.5 },
    overflowingRight: wide.slice(0, 12),
  };
});

console.log(JSON.stringify(diag, null, 2));
await page.screenshot({ path: path.join(root, "scripts", "shot-diag-settings.png") });

// Thema-toggle: werkt schakelen én blijft het bewaard?
const themeCheck = { start: await page.getAttribute("html", "data-theme") };
await page.click('#theme-seg [data-theme-opt="dark"]');
await page.waitForTimeout(150);
themeCheck.afterDark = await page.getAttribute("html", "data-theme");
await page.screenshot({ path: path.join(root, "scripts", "shot-diag-theme-dark.png") });
await page.click('#theme-seg [data-theme-opt="light"]');
await page.waitForTimeout(150);
themeCheck.afterLight = await page.getAttribute("html", "data-theme");
await page.click('#theme-seg [data-theme-opt="dark"]');
await page.reload({ waitUntil: "networkidle" });
themeCheck.afterReload = await page.getAttribute("html", "data-theme");
themeCheck.metaColor = await page.getAttribute("#meta-theme-color", "content");
// Terug naar systeem
await page.click("#btn-settings");
await page.click('#theme-seg [data-theme-opt="auto"]');
await page.waitForTimeout(150);
themeCheck.afterAuto = await page.getAttribute("html", "data-theme");
console.log("Theme:", JSON.stringify(themeCheck));

// Scroll naar onderen in de sheet en kijk of de laatste knop dan bereikbaar is
await page.evaluate(() => { const s = document.querySelector("#settings-overlay .sheet"); s.scrollTop = s.scrollHeight; });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(root, "scripts", "shot-diag-settings-bottom.png") });

await browser.close();
server.close();
