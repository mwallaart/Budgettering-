// Loopt elke interactie en animatie uit het ontwerp echt na in de browser.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { launchOptions } from "./browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const seed = () => {
  const d = new Date();
  const k = (n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
  return {
    version: 5, startMonth: k(0),
    pots: [
      { id: "alg", label: "Algemeen", icon: "🪙", startBalance: 2500, goal: 0, goalDate: null },
      { id: "spaar", label: "Sparen", icon: "🐖", startBalance: 12000, goal: 25000, goalDate: k(23) },
      { id: "vak", label: "Vakantie", icon: "🏖️", startBalance: 1500, goal: 4000, goalDate: k(11) },
    ],
    recurring: [
      { id: "i1", kind: "in", group: "in", label: "Salaris", amount: 3662, day: 25, potId: "alg", fromMonth: k(0) },
      { id: "u1", kind: "out", label: "Hypotheek", amount: 1800, day: 1, potId: "alg", category: "huis", fromMonth: k(0) },
      { id: "u2", kind: "out", label: "Zorgverzekering", amount: 350, day: 1, potId: "alg", category: "verzekering", review: true, fromMonth: k(0) },
      { id: "o1", kind: "move", group: "over", label: "Naar Sparen", amount: 1000, day: 26, potId: "alg", toPot: "spaar", fromMonth: k(0) },
    ],
    months: { [k(0)]: { entries: [{ id: "e1", kind: "out", label: "Tandarts", amount: 180, day: 12, potId: "alg", category: "overig" }], skip: [] } },
    investments: [{ id: "v1", label: "Meesman", value: 18400, monthly: 500, updated: "2026-07-28" }],
    recentLabels: ["Boodschappen", "Benzine"],
    backupDismissed: false, lastBackup: null,
  };
};

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate((j) => localStorage.setItem("budget-glass-v1", j), JSON.stringify(seed()));
await page.reload({ waitUntil: "networkidle" });

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

/* ---------- 1. Laadscherm (barFill + shine + GIF) ---------- */
const loaderVisible = await page.locator("#loader").isVisible().catch(() => false);
const loaderAnim = await page.evaluate(() => {
  const bar = document.querySelector(".loader-bar i");
  return bar ? getComputedStyle(bar).animationName : null;
});
check("Laadscherm zichtbaar bij opstart", loaderVisible);
check("barFill-animatie op laadbalk", loaderAnim === "barFill", loaderAnim);
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
check("Laadscherm verdwijnt automatisch", true);
await page.waitForTimeout(500);

/* ---------- 2. Munt-logo: shine + laadscherm opnieuw ---------- */
const coinAnim = await page.evaluate(() => getComputedStyle(document.querySelector(".coin-shine")).animationName);
check("shine-animatie op muntlogo", coinAnim === "shine", coinAnim);
await page.click("#coin");
check("Munt herstart laadscherm (replayLoader)", await page.locator("#loader").isVisible());
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(300);

/* ---------- 3. Hero: floatY op € + privacy ---------- */
const glyphAnim = await page.evaluate(() => getComputedStyle(document.querySelector(".hero-glyph")).animationName);
check("floatY-animatie op hero-€", glyphAnim === "floatY", glyphAnim);
const before = await page.textContent("#ov-amount");
await page.click("#hero-savings");
await page.waitForTimeout(250);
const masked = await page.textContent("#ov-amount");
const hintText = await page.textContent("#privacy-hint");
check("Privacy-modus maskeert bedrag", masked.includes("••") && masked !== before, masked);
check("Privacy-hint wisselt naar 'tik om te tonen'", /tonen/.test(hintText), hintText);
await page.click("#hero-savings");
await page.waitForTimeout(250);
check("Privacy-modus terug te zetten", (await page.textContent("#ov-amount")) === before);

/* ---------- 4. View-animatie riseIn ---------- */
const viewAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#v-overzicht")).animationName);
check("riseIn-animatie op schermwissel", viewAnim === "riseIn", viewAnim);

/* ---------- 5. Grafiek scrubben ---------- */
const chart = await page.locator("#chart-hit svg").boundingBox();
const focus0 = await page.textContent("#focus-date");
await page.mouse.move(chart.x + chart.width * 0.15, chart.y + chart.height / 2);
await page.mouse.down();
await page.mouse.move(chart.x + chart.width * 0.75, chart.y + chart.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
const focus1 = await page.textContent("#focus-date");
check("Grafiek scrubben verplaatst focus", focus0 !== focus1, `${focus0} → ${focus1}`);
const goldLine = await page.locator('#chart-hit line[stroke="var(--gold2)"]').count();
const nowLine = await page.locator('#chart-hit line[stroke-dasharray="2 4"]').count();
check("Gouden focuslijn in grafiek", goldLine === 1);
check("Gestippelde 'nu'-lijn in grafiek", nowLine === 1);

/* ---------- 6. Maandrij → maanddetail ---------- */
await page.click("#month-list .mrow");
await page.waitForTimeout(400);
check("Maandrij opent maanddetail", await page.locator("#v-maand").isVisible());

/* ---------- 7. Potje-chip selecteren ---------- */
const scopeBefore = await page.textContent("#month-scope");
await page.locator('#pots .pot[data-pot="spaar"]').click();
await page.waitForTimeout(300);
const scopeAfter = await page.textContent("#month-scope");
check("Potje-chip filtert de maand", scopeBefore !== scopeAfter && /Sparen/.test(scopeAfter), scopeAfter);
const paceText = await page.locator('#pots .pot[data-pot="spaar"] .pot-pace').textContent().catch(() => "");
check("Pace-label op potje met doeldatum", /schema|achter/.test(paceText), paceText.trim());
await page.locator('#pots .pot[data-pot=""]').click();
await page.waitForTimeout(300);

/* ---------- 8. Groepen in-/uitklappen ---------- */
const grpBtn = page.locator('#groups [data-group="in"]');
const expBefore = await grpBtn.getAttribute("aria-expanded");
await grpBtn.click();
await page.waitForTimeout(300);
const expAfter = await grpBtn.getAttribute("aria-expanded");
check("Groep in-/uitklappen werkt", expBefore !== expAfter, `${expBefore} → ${expAfter}`);
const carets = await page.evaluate(() => {
  const g = (k) => document.querySelector(`#groups [data-group="${k}"] .group-caret`);
  const st = (k) => { const c = g(k); return c ? getComputedStyle(c).transform : null; };
  return { open: st("over"), closed: st("fixed") };
});
check("Caret roteert bij open groep", carets.open && carets.open !== "none", carets.open);
check("Caret rechtop bij dichte groep", carets.closed === "none", carets.closed);
await grpBtn.click();
await page.waitForTimeout(300);

/* ---------- 9. swipeHint op de eerste regel ---------- */
const hintAnim = await page.evaluate(() => {
  const r = document.querySelector("#groups .row");
  return r ? getComputedStyle(r).animationName : null;
});
check("swipeHint-animatie op eerste regel", hintAnim === "swipeHint", hintAnim);

/* ---------- 10. Vegen: acties openen ---------- */
// "Vaste lasten" staat standaard dichtgeklapt: eerst openen
await page.locator('#groups [data-group="fixed"]').click();
await page.waitForTimeout(350);
check("Vaste lasten uitklappen toont regels", (await page.locator('#groups .row:has-text("Hypotheek")').count()) === 1);
const row = page.locator('#groups .row:has-text("Hypotheek")').first();
const rb = await row.boundingBox();
// Start midden op de regel: de ⋯-knop rechts blokkeert bewust het vegen
await page.mouse.move(rb.x + rb.width * 0.62, rb.y + rb.height / 2);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width * 0.1, rb.y + rb.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(450);
const tx = await row.evaluate((el) => el.style.transform);
check("Vegen naar links opent acties", /translateX\(-1[0-9]{2}px\)/.test(tx), tx);
check("Actieknoppen alleen actief bij geveegde regel",
  (await page.locator("#groups .swipe.open").count()) === 1 &&
  (await page.locator('#groups .swipe:not(.open) [data-del][tabindex="-1"]').count()) >= 1);

/* ---------- 11. Wissen + toast met ongedaan maken ---------- */
const rowsBefore = await page.locator("#groups .row").count();
await page.locator('#groups .swipe.open [data-del]').click();
await page.waitForTimeout(500);
const choiceOpen = await page.locator("#sh-choice").isVisible();
check("Terugkerende post vraagt keuze bij wissen", choiceOpen);
await page.locator("#choice-once").click();   // alleen deze maand overslaan
await page.waitForTimeout(500);
const rowsAfter = await page.locator("#groups .row").count();
check("Post overslaan verwijdert de regel", rowsAfter < rowsBefore, `${rowsBefore} → ${rowsAfter}`);
const toastVisible = await page.locator("#toast").isVisible();
check("Toast verschijnt na actie", toastVisible, await page.textContent("#toast-text"));
const toastAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#toast")).animationName);
check("riseIn-animatie op toast", toastAnim === "riseIn", toastAnim);
await page.click("#toast-undo");
await page.waitForTimeout(500);
check("Ongedaan maken zet de regel terug", (await page.locator("#groups .row").count()) === rowsBefore);

/* ---------- 12. ⋯-knop per regel ---------- */
await page.locator("#groups .row-more").first().click();
await page.waitForTimeout(400);
check("⋯-knop opent actiesheet", await page.locator("#sh-choice").isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ---------- 13. Toetsenbord: rij focusbaar en te bewerken ---------- */
const kbOk = await page.evaluate(() => {
  const r = document.querySelector("#groups .row");
  if (!r) return false;
  r.focus();
  const focused = document.activeElement === r;
  r.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return focused;
});
await page.waitForTimeout(400);
check("Rij focusbaar met toetsenbord", kbOk);
check("Enter op rij opent bewerken", await page.locator("#sh-entry").isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ---------- 14. Review-stip ---------- */
check("Review-stip op post met review:true", (await page.locator("#groups .dot-review").count()) >= 1);

/* ---------- 15. FAB lang indrukken → snelmenu (popIn) ---------- */
const fab = await page.locator("#fab").boundingBox();
await page.mouse.move(fab.x + fab.width / 2, fab.y + fab.height / 2);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForTimeout(400);
const quickOpen = await page.locator("#quick").isVisible();
check("Lang indrukken FAB opent snelmenu", quickOpen);
const quickAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#quick")).animationName);
check("popIn-animatie op snelmenu", quickAnim === "popIn", quickAnim);
const quickItems = await page.locator("#quick-items .quick-item").count();
check("Snelmenu vult zich met vaste posten", quickItems >= 1, String(quickItems));
await page.locator("#quick-items .quick-item").first().click();
await page.waitForTimeout(500);
check("Snelmenu-item opent invoer met voorvulling", (await page.inputValue("#f-label")).length > 0, await page.inputValue("#f-label"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ---------- 16. FAB kort tikken → invoer (sheetUp) ---------- */
await page.click("#fab");
await page.waitForTimeout(400);
check("Korte tik FAB opent invoer", await page.locator("#sh-entry").isVisible());
const sheetAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#sh-entry")).animationName);
check("sheetUp-animatie op sheet", sheetAnim === "sheetUp", sheetAnim);
const scrimAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#scrim")).animationName);
check("fadeIn-animatie op scrim", scrimAnim === "fadeIn", scrimAnim);

/* ---------- 17. Invoer: snelbedragen, recent, wat-als ---------- */
await page.locator("#f-quick .qbtn").first().click();
await page.waitForTimeout(250);
check("Snelbedrag vult het bedrag", (await page.inputValue("#f-amount")).length > 0, await page.inputValue("#f-amount"));
check("Wat-als-grafiek verschijnt", await page.locator("#whatif").isVisible());
const wiPaths = await page.locator("#wi-svg path").count();
check("Wat-als toont basislijn + nieuwe lijn", wiPaths === 2, String(wiPaths));
check("Wat-als noemt de laagste stand", /Laagste stand/.test(await page.textContent("#wi-low")));
await page.locator("#f-recent .qbtn").first().click();
await page.waitForTimeout(250);
check("Recente omschrijving vult het label", (await page.inputValue("#f-label")).length > 0);
// type-schakelaar
await page.locator('#sh-entry .seg button[data-kind="in"]').click();
await page.waitForTimeout(250);
check("Wisselen naar Inkomst verbergt categorie", await page.locator("#f-cat-wrap").isHidden());
await page.locator('#sh-entry .seg button[data-kind="out"]').click();
await page.waitForTimeout(200);
// repeat-switch
await page.click("#f-repeat");
await page.waitForTimeout(200);
check("Herhaal-schakelaar wisselt", (await page.getAttribute("#f-repeat", "aria-checked")) === "true");
await page.click("#f-repeat");
// maandkiezer vanuit invoer
await page.click("#f-month");
await page.waitForTimeout(400);
check("Maandkiezer opent vanuit invoer", await page.locator("#sh-picker").isVisible());
const yearBefore = await page.textContent("#mp-year");
await page.click("#mp-next");
await page.waitForTimeout(250);
check("Jaar vooruit in maandkiezer", (await page.textContent("#mp-year")) !== yearBefore);
await page.click("#mp-prev");
await page.waitForTimeout(250);
await page.locator("#mp-grid .mp-cell:not([disabled])").first().click();
await page.waitForTimeout(400);
check("Maand kiezen keert terug naar invoer", await page.locator("#sh-entry").isVisible());

/* ---------- 18. Opslaan → confetti ---------- */
await page.fill("#f-label", "Interactietest");
await page.fill("#f-amount", "42");
await page.waitForTimeout(300);
await page.click("#entry-save");
await page.waitForTimeout(400);
const confCount = await page.locator("#conf > div").count();
check("Confetti na opslaan", confCount > 0, String(confCount));
const confAnim = await page.evaluate(() => {
  const d = document.querySelector("#conf > div");
  const i = document.querySelector("#conf i");
  return d && i ? getComputedStyle(d).animationName + "+" + getComputedStyle(i).animationName : null;
});
check("confFall + confSpin actief", confAnim === "confFall+confSpin", confAnim);
check("Nieuwe post staat in de lijst", (await page.locator('#groups .row:has-text("Interactietest")').count()) === 1);

/* ---------- 19. Overboeken ---------- */
await page.click("#open-transfer");
await page.waitForTimeout(400);
await page.fill("#tf-amount", "250");
await page.locator('#tf-to [data-to]').first().click();
await page.waitForTimeout(200);
const tfSum = await page.textContent("#tf-summary");
check("Overboeken toont van→naar", /Van .* naar /.test(tfSum), tfSum);
await page.click("#tf-repeat");
await page.waitForTimeout(150);
check("Overboeken kan maandelijks", (await page.getAttribute("#tf-repeat", "aria-checked")) === "true");
await page.click("#tf-repeat");
await page.locator('#sh-transfer button[type=submit]').click();
await page.waitForTimeout(500);
check("Overboeking toegevoegd", (await page.locator('#groups .row:has-text("Naar ")').count()) >= 1);

/* ---------- 20. Vermogen: belegging bewerken + nudges ---------- */
await page.locator('.tab[data-tab="vermogen"]').click();
await page.waitForTimeout(500);
await page.locator("#invest-list .irow").first().click();
await page.waitForTimeout(400);
check("Belegging opent ter bewerking", await page.locator("#sh-invest").isVisible());
const nudges = await page.locator("#iv-nudges .qbtn").count();
check("±%-nudges aanwezig", nudges === 4, String(nudges));
const valBefore = await page.inputValue("#iv-value");
await page.locator("#iv-nudges .qbtn").last().click();
await page.waitForTimeout(250);
check("Nudge past de waarde aan", (await page.inputValue("#iv-value")) !== valBefore);
await page.locator("#iv-monthly-quick .qbtn").nth(2).click();
await page.waitForTimeout(250);
check("Maandelijkse inleg via snelknop", (await page.inputValue("#iv-monthly")).length > 0);
check("Hint over inleg per jaar", /per jaar|maandelijkse/.test(await page.textContent("#iv-hint")));
await page.locator('#sh-invest button[type=submit]').click();
await page.waitForTimeout(500);
check("Belegging opgeslagen", (await page.locator("#invest-list .irow").count()) >= 1);
check("Jaar-per-categorie gevuld", (await page.locator("#year-cats .ycat").count()) >= 1);

/* ---------- 21. Instellingen: icoon, doeldatum, thema ---------- */
await page.click("#btn-settings");
await page.waitForTimeout(400);
const ico0 = await page.locator("#pot-manage [data-icon]").first().textContent();
await page.locator("#pot-manage [data-icon]").first().click();
await page.waitForTimeout(300);
const ico1 = await page.locator("#pot-manage [data-icon]").first().textContent();
check("Icoon doorklikken werkt", ico0 !== ico1, `${ico0} → ${ico1}`);
await page.locator("#pot-manage [data-gd]").first().click();
await page.waitForTimeout(400);
check("Doeldatum opent maandkiezer", await page.locator("#sh-picker").isVisible());
await page.locator("#mp-grid .mp-cell:not([disabled])").first().click();
await page.waitForTimeout(400);
check("Doeldatum gekozen, terug in instellingen", await page.locator("#sh-settings").isVisible());
const gdLabel = await page.locator("#pot-manage [data-gd] .v").first().textContent();
check("Doeldatum staat in de kaart", !/geen datum/.test(gdLabel), gdLabel.trim());
await page.locator('#theme-seg [data-theme-opt="dark"]').click();
await page.waitForTimeout(300);
check("Thema naar donker", (await page.getAttribute("html", "data-theme")) === "dark");
await page.locator('#theme-seg [data-theme-opt="light"]').click();
await page.waitForTimeout(300);
check("Thema naar licht", (await page.getAttribute("html", "data-theme")) === "light");
// startmaand
await page.click("#start-month");
await page.waitForTimeout(400);
check("Startmaand opent maandkiezer", await page.locator("#sh-picker").isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ---------- 22. Back-up-banner + waarschuwing ---------- */
await page.locator('.tab[data-tab="overzicht"]').click();
await page.waitForTimeout(400);
const bannerVisible = await page.locator("#backup-banner").isVisible();
check("Back-up-banner zichtbaar zonder back-up", bannerVisible);
if (bannerVisible) {
  await page.click("#backup-later");
  await page.waitForTimeout(300);
  check("'Later' verbergt de back-up-banner", await page.locator("#backup-banner").isHidden());
}
// Waarschuwing forceren met een te grote uitgave
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("budget-glass-v1"));
  const mk = d.startMonth;
  d.months[mk] = d.months[mk] || { entries: [], skip: [] };
  d.months[mk].entries.push({ id: "big", kind: "out", label: "Grote uitgave", amount: 99000, day: 3, potId: "vak", category: "overig" });
  localStorage.setItem("budget-glass-v1", JSON.stringify(d));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(600);
const warnVisible = await page.locator("#warn-card").isVisible();
check("Waarschuwing bij negatief potje", warnVisible, await page.textContent("#warn-title").catch(() => ""));
if (warnVisible) {
  await page.click("#warn-fix");
  await page.waitForTimeout(500);
  check("'Aanvullen' opent overboeken met bedrag", await page.locator("#sh-transfer").isVisible() && (await page.inputValue("#tf-amount")).length > 0, await page.inputValue("#tf-amount").catch(() => ""));
  await page.keyboard.press("Escape");
}

/* ---------- 23. Terugknop + tabs ---------- */
await page.locator('.tab[data-tab="maand"]').click();
await page.waitForTimeout(300);
await page.click("#back-ov");
await page.waitForTimeout(300);
check("Terugknop gaat naar Overzicht", await page.locator("#v-overzicht").isVisible());

/* ---------- 24. reduced-motion ---------- */
await page.emulateMedia({ reducedMotion: "reduce" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
const rmLoader = await page.locator("#loader").isHidden();
const rmAnim = await page.evaluate(() => getComputedStyle(document.querySelector("#v-overzicht")).animationName);
check("reduced-motion: laadscherm overgeslagen", rmLoader);
check("reduced-motion: animaties uit", rmAnim === "none" || rmAnim === "riseIn", rmAnim);
await page.emulateMedia({ reducedMotion: null });

/* ---------- 25. PWA-robuustheid: geen afwijkende weergaven ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate((j) => localStorage.setItem("budget-glass-v1", j), JSON.stringify(seed()));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(600);

// Het document zelf mag niet kunnen scrollen: alleen .scroll doet dat.
const docLock = await page.evaluate(() => {
  const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body);
  return {
    htmlOverflow: h.overflow, bodyPos: b.position,
    htmlOver: h.overscrollBehavior, bodyOver: b.overscrollBehavior,
    docScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
  };
});
check("Document scrolt niet (body vast)", docLock.bodyPos === "fixed" && !docLock.docScrollable, JSON.stringify(docLock));
check("overscroll-behavior uit op html en body", docLock.htmlOver === "none" && docLock.bodyOver === "none", `${docLock.htmlOver} / ${docLock.bodyOver}`);

// Wielen in de lijst scrollt .scroll, niet het venster.
await page.mouse.move(195, 500);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const scrolled = await page.evaluate(() => ({ inner: document.querySelector("#scroll").scrollTop, win: window.scrollY }));
check("Alleen de lijst scrolt, het venster niet", scrolled.inner > 0 && scrolled.win === 0, JSON.stringify(scrolled));

// Sheet open: achtergrond staat stil en is niet bereikbaar.
await page.click("#fab");
await page.waitForTimeout(450);
const lockState = await page.evaluate(() => {
  const s = document.querySelector("#scroll");
  return {
    locked: document.querySelector(".app").classList.contains("locked"),
    overflow: getComputedStyle(s).overflowY,
    scrollInert: s.inert, tabbarInert: document.querySelector(".tabbar").inert,
    topbarInert: document.querySelector(".topbar").inert, fabInert: document.querySelector("#fab").inert,
    toastInert: !!document.querySelector("#toast").inert,
    top: s.scrollTop,
  };
});
await page.mouse.move(195, 120);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const topAfter = await page.evaluate(() => document.querySelector("#scroll").scrollTop);
check("Achtergrond scrolt niet met sheet open", lockState.overflow === "hidden" && topAfter === lockState.top, `${lockState.top} → ${topAfter}`);
check("Achtergrond niet bereikbaar met sheet open", lockState.locked && lockState.scrollInert && lockState.tabbarInert && lockState.topbarInert && lockState.fabInert, JSON.stringify(lockState));
check("Toast blijft bereikbaar met sheet open", lockState.toastInert === false);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const unlocked = await page.evaluate(() => ({
  locked: document.querySelector(".app").classList.contains("locked"),
  inert: document.querySelector("#scroll").inert,
  overflow: getComputedStyle(document.querySelector("#scroll")).overflowY,
}));
check("Sluiten heft de vergrendeling op", !unlocked.locked && !unlocked.inert && unlocked.overflow === "auto", JSON.stringify(unlocked));

// Toast bóven een open sheet: potje wissen in Instellingen en terugdraaien.
await page.click("#btn-settings");
await page.waitForTimeout(450);
const potsBefore = await page.locator("#pot-manage .pot-edit").count();
await page.locator("#pot-manage .pot-edit [data-rm]").last().click();
await page.waitForTimeout(400);
const toastBox = await page.locator("#toast").boundingBox();
const onTop = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest("#toast"));
}, [toastBox.x + toastBox.width - 40, toastBox.y + toastBox.height / 2]);
check("Toast ligt boven de open sheet", onTop);
await page.click("#toast-undo");
await page.waitForTimeout(400);
check("Ongedaan maken werkt met sheet open", (await page.locator("#pot-manage .pot-edit").count()) === potsBefore,
  `${potsBefore} → ${await page.locator("#pot-manage .pot-edit").count()}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Vegen sluit bij scrollen, zodat er geen halfopen regel achterblijft.
await page.locator('.tab[data-tab="maand"]').click();
await page.waitForTimeout(400);
await page.locator('#groups [data-group="fixed"]').click();
await page.waitForTimeout(350);
const rrow = page.locator('#groups .row:has-text("Hypotheek")').first();
const rrb = await rrow.boundingBox();
await page.mouse.move(rrb.x + rrb.width * 0.62, rrb.y + rrb.height / 2);
await page.mouse.down();
await page.mouse.move(rrb.x + rrb.width * 0.1, rrb.y + rrb.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
const openedSwipe = (await page.locator("#groups .swipe.open").count()) === 1;
await page.evaluate(() => { document.querySelector("#scroll").scrollTop += 200; });
await page.waitForTimeout(350);
check("Vegen sluit weer bij scrollen", openedSwipe && (await page.locator("#groups .swipe.open").count()) === 0);

// Draaien naar liggend: opnieuw tekenen zonder horizontale overloop.
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(500);
const land = await page.evaluate(() => {
  const dock = document.querySelector(".dock").getBoundingClientRect();
  return {
    hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
    dockBottom: Math.round(dock.bottom), inner: window.innerHeight,
    viewVisible: !document.querySelector("#v-maand").hidden,
  };
});
check("Liggend: geen horizontale overloop", !land.hOverflow && !land.bodyOverflow, JSON.stringify(land));
check("Liggend: navigatie blijft in beeld", land.dockBottom <= land.inner + 1 && land.viewVisible, JSON.stringify(land));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const back = await page.evaluate(() => ({
  hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  dockBottom: Math.round(document.querySelector(".dock").getBoundingClientRect().bottom),
  inner: window.innerHeight,
}));
check("Terug naar staand: layout herstelt", !back.hOverflow && back.dockBottom <= back.inner + 1, JSON.stringify(back));

// Dubbeltik-zoom uit, maar knijpzoom moet blijven werken (toegankelijkheid).
const zoomOk = await page.evaluate(() => {
  const mv = document.querySelector('meta[name="viewport"]').content;
  return { touchAction: getComputedStyle(document.body).touchAction, mv };
});
check("Dubbeltik-zoom uit via touch-action", /manipulation/.test(zoomOk.touchAction), zoomOk.touchAction);
check("Knijpzoom blijft toegestaan", !/user-scalable\s*=\s*no|maximum-scale/.test(zoomOk.mv), zoomOk.mv);

/* ---------- 26. Databeveiliging ---------- */
// Migratie van v5 naar v6: de oude ja/nee-vlag wordt een uitsteldatum.
const mig = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("budget-glass-v1"));
  return { version: d.version, hasOld: "backupDismissed" in d, snoozed: d.backupSnoozed };
});
check("Data gemigreerd naar v6", mig.version === 6 && !mig.hasOld, JSON.stringify(mig));

// Herinnering op leeftijd: een back-up van 60 dagen oud moet weer opkomen.
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("budget-glass-v1"));
  const t = new Date(); t.setDate(t.getDate() - 60);
  d.lastBackup = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  d.backupSnoozed = null;
  localStorage.setItem("budget-glass-v1", JSON.stringify(d));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(600);
const staleTitle = await page.textContent("#backup-title");
check("Oude back-up geeft opnieuw een herinnering", await page.locator("#backup-banner").isVisible() && /weken oud/.test(staleTitle), staleTitle);

// 'Later' stelt uit in plaats van voorgoed te zwijgen.
await page.click("#backup-later");
await page.waitForTimeout(300);
const snoozed = await page.evaluate(() => JSON.parse(localStorage.getItem("budget-glass-v1")).backupSnoozed);
check("'Later' stelt uit met een datum", await page.locator("#backup-banner").isHidden() && /^\d{4}-\d{2}-\d{2}$/.test(snoozed || ""), String(snoozed));
const wakesUp = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("budget-glass-v1"));
  const t = new Date(); t.setDate(t.getDate() - 10);
  d.backupSnoozed = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  localStorage.setItem("budget-glass-v1", JSON.stringify(d));
  return d.backupSnoozed;
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(600);
check("Uitstel loopt af en de herinnering komt terug", await page.locator("#backup-banner").isVisible(), wakesUp);

// Mislukt opslaan moet zichtbaar worden, niet stil verdwijnen.
await page.evaluate(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === "budget-glass-v1") { const e = new Error("vol"); e.name = "QuotaExceededError"; throw e; }
    return orig.call(this, k, v);
  };
});
await page.click("#backup-later");
await page.waitForTimeout(400);
const stTxt = await page.textContent("#storage-text").catch(() => "");
check("Mislukt opslaan geeft een waarschuwing", await page.locator("#storage-banner").isVisible() && /vol/.test(stTxt), stTxt.slice(0, 60));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#loader[hidden]", { state: "attached", timeout: 6000 });
await page.waitForTimeout(600);
check("Waarschuwing weg als opslaan weer werkt", await page.locator("#storage-banner").isHidden());

// Herstelpunten: automatisch bewaard en terug te zetten.
await page.click('.tab[data-tab="maand"]');
await page.waitForTimeout(400);
await page.click("#fab");
await page.waitForTimeout(450);
await page.fill("#f-amount", "77");
await page.fill("#f-label", "Herstelpunt-test");
await page.locator("#sh-entry .save").click();
await page.waitForTimeout(600);
const snapCount = await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open("huishoudboekje", 1);
  rq.onsuccess = () => {
    const db = rq.result;
    const all = db.transaction("snapshots", "readonly").objectStore("snapshots").getAll();
    all.onsuccess = () => { res(all.result.length); db.close(); };
    all.onerror = () => { res(-1); db.close(); };
  };
  rq.onerror = () => res(-1);
}));
check("Herstelpunt automatisch bewaard in IndexedDB", snapCount >= 1, String(snapCount));
await page.click("#btn-settings");
await page.waitForTimeout(700);
const restoreRows = await page.locator("#restore-list [data-restore]").count();
check("Herstelpunten staan in de instellingen", restoreRows >= 1, String(restoreRows));
// Het oudste herstelpunt dateert van vóór "Herstelpunt-test": terugzetten moet
// die post dus laten verdwijnen, en ongedaan maken hem terugbrengen.
const hasTest = () => page.evaluate(() => localStorage.getItem("budget-glass-v1").includes("Herstelpunt-test"));
check("Testpost staat in de data vóór terugzetten", await hasTest());
await page.locator("#restore-list [data-restore]").last().click();
await page.waitForTimeout(700);
check("Terugzetten meldt zich met ongedaan maken",
  await page.locator("#toast").isVisible() && /Herstelpunt/.test(await page.textContent("#toast-text")),
  await page.textContent("#toast-text").catch(() => ""));
check("Oud herstelpunt draait de wijziging echt terug", !(await hasTest()));
await page.click("#toast-undo");
await page.waitForTimeout(600);
check("Terugzetten is ongedaan te maken", await hasTest());

await browser.close();
server.close();

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
console.log(`\n${results.length - bad.length}/${results.length} checks geslaagd`);
console.log("Console-fouten:", errors.length ? errors.slice(0, 6) : "geen");
if (bad.length || errors.length) process.exitCode = 1;
