# design-import/ — landingsplek voor het Claude Design-ontwerp

Deze map is bedoeld voor de **onbewerkte export** uit Claude Design, zodat een
web-sessie van Claude Code (die zelf niet bij Claude Design kan) het ontwerp kan
lezen en implementeren.

**Bron:** https://claude.ai/design/p/21c44bce-b3a4-4a08-bf87-210587f2731e
**Project-id:** `21c44bce-b3a4-4a08-bf87-210587f2731e`

## Wat hier moet komen

```
design-import/
├── Budget App.dc.html                    ← het ontwerp (hoofdbestand)
├── support.js                            ← wordt door het ontwerp geïmporteerd
└── uploads/
    └── Make It Rain Money GIF.gif        ← binair; downloaden, niet kopiëren
```

## Hoe je die hier krijgt

Vanaf een **lokale** terminal (Claude Design vraagt een interactieve login, die
in een web-sessie niet beschikbaar is):

```bash
git clone https://github.com/mwallaart/Budgettering-.git
cd Budgettering-
claude
```

Draai in de sessie eerst `/design-login`, en geef daarna deze opdracht:

> Gebruik de DesignSync-tool om project `21c44bce-b3a4-4a08-bf87-210587f2731e`
> te lezen. Doe `list_files`, en sla vervolgens `Budget App.dc.html`,
> `support.js` en alles onder `uploads/` op in de map `design-import/`, met
> exact dezelfde bestandsnamen en mappenstructuur. Wijzig de inhoud niet.
> Commit daarna met "Importeer Claude Design-ontwerp" en push naar main.

Lukt de GIF niet via de tool (binair, limiet 256 KiB)? Download hem dan
handmatig uit de Claude Design-interface naar `design-import/uploads/`.

## Daarna

Meld in de web-sessie dat het gepusht is. Die haalt de bestanden op en bouwt het
ontwerp in de PWA, met behoud van de constraints uit `DESIGN-BRIEF.md`
(vanilla HTML/CSS/JS, geen build, offline PWA, vanaf 320px, iOS safe-areas,
licht + donker, bestaand `localStorage`-datamodel).

> Deze map is alleen bronmateriaal. De werkende app blijft `index.html`,
> `styles.css` en `app.js` in de hoofdmap.
