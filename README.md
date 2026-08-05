# Budget · Saldo &amp; vermogen

Een persoonlijke **budgetteer-PWA** in Apple glass-stijl. Volledig client-side,
werkt offline en is te installeren op je telefoon (iOS/Android) of desktop.
Geen account, geen server — alle gegevens blijven lokaal op je apparaat
(`localStorage`).

## Wat kan het?

- **Overzicht als basis** — een startpagina met **maandtotalen** (inkomsten, uitgaven,
  eindsaldo per maand), de cashflow-grafiek en waarschuwingen. Tik een maand aan voor
  de **detailpagina** van die maand.
- **Toevoegen met maandkeuze** — voeg een inkomst of aankoop toe vanaf elke pagina en
  **kies zelf de maand** (en dag). Je hoeft niet eerst naar de betreffende maand.
- **Spaarpotjes met doelen** — verdeel je spaargeld over potjes (Algemeen, Vakantie, Auto,
  of eigen potjes), elk met beginsaldo, doorlopend saldo en een optioneel **doelbedrag met
  voortgangsbalk**. Filter het hele overzicht per potje.
- **Waarschuwing bij negatief saldo** — de app meldt het als een potje in een bepaalde
  maand onder nul dreigt te komen; de grafiek kleurt rood onder de nullijn.
- **Spaargeld per maand** — voer in wat er maandelijks bijkomt (los of terugkerend).
- **Aankopen plannen** in een specifieke maand, met categorieën **Baby · Huis · Overig**.
- **Cashflow per dag** — geef per post aan op welke dag van de maand hij binnenkomt
  of eraf gaat. Een interactieve grafiek toont je saldo dag voor dag; sleep of scrol
  om elk moment af te lezen en tik om naar die maand te springen.
- **Saldo op elk moment** — beginsaldo → eindsaldo per maand, met doorlopende
  overdracht naar volgende maanden.
- **Terugkerende posten** — markeer vast inkomen of vaste lasten als "elke maand";
  ze verschijnen automatisch en zijn per maand overslaan of helemaal te verwijderen.
- **Vaste maand beheren** (tab **Vast**) — één pagina voor al je maandelijkse
  inkomsten, vaste lasten en de verdeling naar sparen en beleggen. Bedragen
  wijzigen **met een ingangsmaand**: gaat de hypotheek in maart omhoog, dan
  houden januari en februari hun oude bedrag. Elke post heeft een verloop van
  het bedrag (met een knop om een geplande wijziging te schrappen) en kan een
  einddatum krijgen, zodat een aflopend abonnement uit je toekomst verdwijnt
  zonder je historie te veranderen. Een peilmaand-stepper laat je vooruitkijken
  naar het effect van wat je hebt gepland.
- **Vermogen-overzicht** — een aparte tab met je **totale vermogen**
  (spaargeld + beleggingen) en een verdeling per onderdeel. De **stand** van een
  belegging vul je zelf in (met de datum erbij); de **inleg** komt uit je
  verdeling op de pagina Vast en telt de app er zelf bij op. Zo verlaat je
  maandelijkse inleg wel je potjes, maar niet je vermogen.
- **Back-up** — exporteer/importeer je gegevens als JSON. Op de telefoon gaat de
  export via de deelknop, zodat je hem in één tik in iCloud Drive of je mail zet.
  De app herinnert je opnieuw zodra je laatste back-up een maand oud is, en
  waarschuwt zichtbaar als opslaan mislukt (opslag vol of privémodus).
- **Herstelpunten** — bij elke wijziging bewaart de app automatisch een kopie in
  IndexedDB (de laatste twaalf). Vergissing gemaakt of een verkeerd bestand
  geïmporteerd? Zet in Instellingen een eerder punt terug. Staat wel op hetzelfde
  toestel, dus het vervangt een back-up niet.

## Gebruiken

Het is een statische site — geen build-stap nodig.

```bash
# willekeurige statische server, bijv.:
python3 -m http.server 8080
# open http://localhost:8080
```

> Een service worker + PWA-installatie werkt alleen via `https://` of `http://localhost`.

Om te installeren op iPhone: open in Safari → deelknop → **Zet op beginscherm**.

## Testen

De app zelf heeft geen dependencies; `package.json` bestaat alleen voor de tests.
Ze draaien in een echte browser (Chromium via Playwright).

```bash
npm ci
node node_modules/playwright-core/cli.js install chromium   # eenmalig
npm test
```

- `npm run test:interactions` — 164 controles: elke animatie, veeg, sheet,
  toetsenbordpad, PWA-robuustheid, databeveiliging, de vaste-maandpagina met
  ingangsmaanden en de koppeling van je inleg aan je vermogen.
- `npm run test:smoke` — alle vier de schermen, elke sheet op 320px, donker
  thema, navigatie zonder overlap.

**Deze tests zijn een poort voor de deploy.** GitHub Actions draait ze bij elke
push naar `main` en bij elke pull request; faalt er één, dan wordt er niets
gepubliceerd en blijft de vorige versie live staan. Zie
`.github/workflows/pages.yml`.

Gaat er ondanks alles iets mis in productie: open **Actions → Test & deploy →**
een eerdere geslaagde run **→ Re-run all jobs**. Dat zet die versie terug live.

## Structuur

| Bestand | Doel |
|---|---|
| `index.html` | App-shell (vier tabs: Overzicht · Maand · Vast · Vermogen) |
| `styles.css` | Glass design-tokens, licht/donker, componenten |
| `app.js` | State, berekeningen en alle UI-logica (ES module, geen dependencies) |
| `manifest.webmanifest` | PWA-manifest |
| `sw.js` | Service worker (offline app-shell) |
| `icons/` | App-iconen (192/512/maskable/apple-touch) |
| `scripts/make-icons.py` | Genereert de iconen (Pillow) |

## Iconen opnieuw genereren

```bash
pip install Pillow
python3 scripts/make-icons.py
```

## Techniek

Vanilla HTML/CSS/JS, geen frameworks of build-tools. Gegevensmodel is versioned
(`budget-glass-v1` in `localStorage`, nu v8); nieuwe velden krijgen defaults bij
het laden, dus een oudere back-up blijft importeerbaar.

Terugkerende posten zijn **effectief-gedateerd**: naast `amount` en `day` heeft
elke post een `changes`-lijst (`{ fromMonth, amount, day }`, gesorteerd) en een
optionele `untilMonth`. `recAt(post, maand)` levert het bedrag zoals dat in die
maand geldt; `recActive(post, maand)` zegt of de post er dan nog is. Alle
berekeningen lopen via die twee functies, zodat een wijziging nooit met
terugwerkende kracht je historie verandert.

Een verdelingspost heeft één **bestemming**: niets (het geld gaat eruit, een
`out` met een categorie), een ander potje (`toPot`) of een belegging
(`toInvest`). Het soort post volgt daaruit, dus soort en bestemming kunnen niet
uit de pas lopen. `investValueAt(belegging, maand)` is de zelf ingevoerde stand
plus de inleg van de maanden ná `updated` — werk je de stand bij, dan begint dat
optellen opnieuw, zodat niets dubbel wordt geteld. Invariant die in de tests
staat: de som van de potjes plus de beleggingen is het totale vermogen.
