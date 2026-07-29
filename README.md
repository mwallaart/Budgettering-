# Budget · Saldo &amp; vermogen

Een persoonlijke **budgetteer-PWA** in Apple glass-stijl. Volledig client-side,
werkt offline en is te installeren op je telefoon (iOS/Android) of desktop.
Geen account, geen server — alle gegevens blijven lokaal op je apparaat
(`localStorage`).

## Wat kan het?

- **Spaargeld per maand** — voer in wat er maandelijks bijkomt (los of terugkerend).
- **Aankopen plannen** in een specifieke maand, met categorieën **Baby · Huis · Overig**.
- **Saldo op elk moment** — beginsaldo → eindsaldo per maand, met doorlopende
  overdracht naar volgende maanden en een **saldoverloop** voor de komende 6 maanden.
- **Terugkerende posten** — markeer vast inkomen of vaste lasten als "elke maand";
  ze verschijnen automatisch en zijn per maand overslaan of helemaal te verwijderen.
- **Vermogen-overzicht** — een tweede tab met je **totale vermogen**
  (spaargeld + beleggingen) en een verdeling per onderdeel. Voeg beleggingen toe
  en werk hun waarde handmatig bij.
- **Back-up** — exporteer/importeer je gegevens als JSON.

## Gebruiken

Het is een statische site — geen build-stap nodig.

```bash
# willekeurige statische server, bijv.:
python3 -m http.server 8080
# open http://localhost:8080
```

> Een service worker + PWA-installatie werkt alleen via `https://` of `http://localhost`.

Om te installeren op iPhone: open in Safari → deelknop → **Zet op beginscherm**.

## Structuur

| Bestand | Doel |
|---|---|
| `index.html` | App-shell (twee tabs: Budget &amp; Vermogen) |
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
(`budget-glass-v1` in `localStorage`); nieuwe velden krijgen defaults bij het laden.
