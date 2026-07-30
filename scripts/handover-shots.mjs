// Maakt referentie-screenshots voor DESIGN-BRIEF.md (licht + donker).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "design-refs");
fs.mkdirSync(OUT, { recursive: true });
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end("nf"); }
  rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

// Realistische voorbeeldstaat: potjes met doelen, geplande aankopen, belegging
const seed = (monthKey, next1, next2) => ({
  version: 4,
  startMonth: monthKey,
  pots: [
    { id: "algemeen", label: "Algemeen", startBalance: 12500, goal: 20000, icon: "🐷" },
    { id: "vakantie", label: "Vakantie", startBalance: 1800, goal: 4000, icon: "🏖️" },
    { id: "auto", label: "Auto", startBalance: 3200, goal: 12000, icon: "🚗" },
  ],
  recurring: [
    { id: "r1", kind: "in", label: "Salaris Mitchel", amount: 1400, day: 25, potId: "algemeen", fromMonth: monthKey },
    { id: "r2", kind: "in", label: "Sparen vakantie", amount: 200, day: 25, potId: "vakantie", fromMonth: monthKey },
    { id: "r3", kind: "in", label: "Sparen auto", amount: 150, day: 25, potId: "auto", fromMonth: monthKey },
  ],
  months: {
    [monthKey]: {
      entries: [
        { id: "e1", kind: "out", label: "Kinderwagen", amount: 1150, day: 10, potId: "algemeen", category: "baby" },
        { id: "e2", kind: "out", label: "Babykamer verven", amount: 320, day: 14, potId: "algemeen", category: "baby" },
        { id: "e3", kind: "out", label: "Nieuwe bank", amount: 2400, day: 18, potId: "algemeen", category: "huis" },
      ],
      skip: [],
    },
    [next1]: {
      entries: [
        { id: "e4", kind: "out", label: "Autoverzekering", amount: 680, day: 5, potId: "auto", category: "overig" },
        { id: "e5", kind: "out", label: "Wieg + matras", amount: 430, day: 12, potId: "algemeen", category: "baby" },
      ],
      skip: [],
    },
    [next2]: {
      entries: [
        { id: "e6", kind: "out", label: "Vliegtickets", amount: 2600, day: 8, potId: "vakantie", category: "overig" },
      ],
      skip: [],
    },
  },
  investments: [
    { id: "i1", label: "Meesman", value: 18400 },
    { id: "i2", label: "DEGIRO", value: 6750 },
  ],
  recentLabels: ["Salaris Mitchel", "Boodschappen", "Kinderwagen"],
});

const _now = new Date();
const mk = (n) => {
  const x = new Date(_now.getFullYear(), _now.getMonth() + n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
const mKey = mk(0), mNext1 = mk(1), mNext2 = mk(2);

async function shoot(theme) {
  const page = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await page.addInitScript((t) => { localStorage.setItem("budget-theme", t); }, theme);
  await page.goto(base, { waitUntil: "networkidle" });

  await page.evaluate((json) => {
    localStorage.setItem("budget-glass-v1", json);
  }, JSON.stringify(seed(mKey, mNext1, mNext2)));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const suffix = theme === "dark" ? "-dark" : "";
  await page.screenshot({ path: path.join(OUT, `overzicht${suffix}.png`), fullPage: true });

  await page.click('.tab-btn[data-tab="maand"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `maand${suffix}.png`), fullPage: true });

  await page.click('.tab-btn[data-tab="vermogen"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `vermogen${suffix}.png`), fullPage: true });

  // Invoer-sheet
  await page.click('.tab-btn[data-tab="maand"]');
  await page.click('[data-add="out"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `sheet-invoer${suffix}.png`) });
  await page.keyboard.press("Escape");

  // Instellingen-sheet
  await page.click("#btn-settings");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `sheet-instellingen${suffix}.png`) });

  await page.close();
}

const browser = await chromium.launch({ executablePath: EXE });
await shoot("light");
await shoot("dark");
await browser.close();
server.close();
console.log("Referentie-screenshots in design-refs/:", fs.readdirSync(OUT).join(", "));
