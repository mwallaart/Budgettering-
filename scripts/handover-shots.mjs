import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "design-refs");
fs.mkdirSync(OUT, { recursive: true });
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


async function shoot(theme) {
  const p = await newPage(390, 844, theme);
  await load(p);
  const sfx = theme === "dark" ? "-dark" : "";
  await p.screenshot({ path: path.join(OUT, `overzicht${sfx}.png`), fullPage: true });
  await p.click('.tab[data-tab="maand"]'); await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(OUT, `maand${sfx}.png`), fullPage: true });
  await p.click('.tab[data-tab="vermogen"]'); await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(OUT, `vermogen${sfx}.png`), fullPage: true });
  await p.click('.tab[data-tab="maand"]'); await p.click("#fab"); await p.waitForTimeout(500);
  await p.fill("#f-amount", "120"); await p.fill("#f-label", "Boodschappen"); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, `sheet-invoer${sfx}.png`) });
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await p.click("#open-transfer"); await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(OUT, `sheet-overboeken${sfx}.png`) });
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await p.click("#btn-settings"); await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(OUT, `sheet-instellingen${sfx}.png`) });
  await p.close();
}
await shoot("light");
await shoot("dark");
await browser.close();
server.close();
console.log("design-refs/:", fs.readdirSync(OUT).sort().join(", "));
