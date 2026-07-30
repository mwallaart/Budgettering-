# Design-brief · Budget-PWA (overdracht voor een nieuw ontwerp)

> **Hoe te gebruiken:** open een nieuw gesprek met Claude, plak dit document en
> voeg de screenshots uit **`design-refs/`** toe. Vertel dan wat je anders wilt
> (bijv. "maak het speelser", "meer als een bank-app", "minimalistischer").
> Dit document bevat alles wat een ontwerper nodig heeft: doel, gebruiker,
> schermen, data, componenten, constraints en de valkuilen die we al tegenkwamen.
>
> **Referentiebeelden** (`design-refs/`, licht + `-dark` variant):
> `overzicht` · `maand` · `vermogen` · `sheet-invoer` · `sheet-instellingen`.
> Opnieuw genereren: `node scripts/handover-shots.mjs`.

---

## 1. In één alinea

Een **persoonlijke budgetteer-app** voor één huishouden (twee personen, met een
baby op komst). Doel: het spaargeld verdelen over **potjes**, geplande
**aankopen** in de juiste maand zetten, en op elk moment kunnen zien **wat het
saldo is** — ook midden in een maand, want de timing van inkomsten en uitgaven
bepaalt of er een dip ontstaat. Daarnaast een **vermogensoverzicht** dat
spaargeld en beleggingen bij elkaar optelt.

**Live:** https://mwallaart.github.io/Budgettering-/ ·
**Repo:** https://github.com/mwallaart/Budgettering-

---

## 2. Gebruiker & context

| | |
|---|---|
| **Wie** | Één eigenaar (+ partner die meekijkt). Geen meerdere accounts, geen rollen. |
| **Apparaat** | **Vooral iPhone**, als PWA op het beginscherm (fullscreen, standalone). Desktop is bijzaak. |
| **Frequentie** | Een paar keer per week even bijwerken; maandelijks een grotere invoerronde. |
| **Kernbehoefte 1** | **Overzicht**: in één blik zien hoe het ervoor staat. |
| **Kernbehoefte 2** | **Snel invoeren met de duim**, zonder gepriegel. |
| **Sfeer** | Rustig, betrouwbaar, "premium" — geen drukke dashboard-look. Nederlandse taal. |

Belangrijk citaat van de eigenaar over de eerste versie: *"vind het nu heel
basic"*. De app mag er dus verzorgd en volwassen uitzien, niet als een
standaard formulier-app.

---

## 3. Informatiearchitectuur

Drie hoofdschermen via een **tabbalk onderin** (3 gelijke kolommen):

```
┌─ Overzicht ──────────┐  ← startpagina, dit is de basis
│  Spaargeld nu (hero) │
│  Waarschuwingen      │
│  Cashflow-grafiek    │
│  Lijst per maand ────┼──→ tik een maand
└──────────────────────┘
┌─ Maand (detail) ─────┐
│  ‹ Overzicht (terug) │
│  Maandnavigatie      │  ← pijltjes + tik op naam = maandkiezer
│  Potjes-strip        │  ← horizontaal scrollen, filtert het scherm
│  Saldo einde maand   │
│  Gespaard / Aankopen │
│  Lijst inkomsten     │
│  Lijst aankopen      │
└──────────────────────┘
┌─ Vermogen ───────────┐
│  Totaal vermogen     │
│  Verdeling (balk)    │
│  Lijst beleggingen   │
└──────────────────────┘
```

Plus een **zwevende +-knop (FAB)** rechtsonder die vanaf elk scherm werkt.
Op *Vermogen* voegt hij een belegging toe, elders een inkomst/aankoop.

**Belangrijk ontwerpprincipe dat we onderweg leerden:** het overzicht met
maandtotalen is de **basis**, niet de maanddetailpagina. En bij toevoegen kies
je **zelf de maand** — je hoeft niet eerst naar die maand te navigeren.

---

## 4. Datamodel (wat er te tonen valt)

Alles staat lokaal in `localStorage` onder de sleutel `budget-glass-v1`.
Thema-voorkeur staat los onder `budget-theme`.

```js
{
  version: 4,
  startMonth: "2026-07",          // "YYYY-MM"; vóór deze maand kun je niet
  pots: [                          // spaarpotjes
    { id, label: "Vakantie", startBalance: 1500, goal: 4000, icon: "🏖️" }
  ],
  recurring: [                     // terugkerende posten
    { id, kind: "in"|"out", label, amount, day: 25,
      potId, category?, fromMonth: "2026-07" }
  ],
  months: {                        // eenmalige posten per maand
    "2026-08": {
      entries: [ { id, kind, label, amount, day, potId, category? } ],
      skip: [ recurringId ]        // terugkerende post 1x overgeslagen
    }
  },
  investments: [ { id, label: "Meesman", value: 15000 } ],
  recentLabels: [ "Salaris", "Boodschappen" ]   // suggesties bij invoer
}
```

**Categorieën** (alleen op aankopen, nu vast): `baby` 🍼 · `huis` 🏠 · `overig` 🏷️
→ *wens voor de toekomst: zelf te beheren.*

**Afgeleide waarden die de UI toont:**

- `beginBalance(maand, potje?)` — saldo aan het begin
- `endBalance(maand, potje?)` — verwacht saldo aan het eind
- `monthNet(maand, potje?)` → `{ inc, out, net }`
- **Spaargeld nu** = eindsaldo van de huidige maand, alle potjes samen
- **Totaal vermogen** = spaargeld nu + som van beleggingen
- **Cashflow-reeks**: saldo per dág, over ~6–18 maanden, door de `day` van elke
  post te verrekenen op die dag
- **Waarschuwing**: eerste dag waarop een potje onder €0 komt

---

## 5. Componenten-inventaris

Wat opnieuw ontworpen mag worden. Namen tussen `code` zijn de huidige classes.

**Structuur**
- Topbar met logo-tegel (€) + paginanaam + instellingen-knop
- Tabbalk onderin, 3 items, met meeschuivende indicator (`.tabbar`, `.tab-ind`)
- Zwevende +-knop (`.fab`) — **moet vrij blijven van de tabbalk**
- Terugknop op de maandpagina (`.back-btn`)

**Kaarten & data**
- **Hero-kaart** (`.hero`): gevulde groene gradient, wit bedrag, groot. Drie
  varianten: Spaargeld nu / Saldo einde maand / Totaal vermogen. Bevat een
  decoratieve groei-lijn (SVG) rechtsonder.
- **Statkaartjes** (`.stat`): 2 naast elkaar, licht groen/rood getint
- **Maandrij** (`.month-row`): naam + "NU"-badge, mini in/uit-verhoudingsbalk,
  eindsaldo groot rechts met label
- **Potje-kaart** (`.pot-card`): icoon, naam, saldo, en bij een doel een
  voortgangsbalk + "van € 4.000 · 38%". Eén extra kaart "Alle potjes".
- **Postregel** (`.row`): icoon-tegel, omschrijving, meta-regel
  ("25e · Vakantie · ↻ maandelijks"), bedrag met + of −
- **Waarschuwingskaart** (`.warn-card`): ⚠️ + tekst, rood getint
- **Cashflow-grafiek** (`.chart-card`): SVG-lijn met gevuld gebied,
  rasterlijnen, nullijn, rood vlak onder nul, "NU"-markering, maandlabels.
  **Interactief:** slepen/scrollen verplaatst een focuspunt; de kop toont
  datum + saldo van dat punt; tikken opent die maand.
- **Verdelingsbalk** (`.alloc`): gestapelde segmenten + legenda met %
- **Categorie-chips** (`.cat-stat`) als samenvatting boven de aankopenlijst

**Invoer (bottom sheets)**
- Sheet-patroon: van onder inschuivend, glass, greep bovenaan,
  **sticky actiebalk onderin**
- Invoer-sheet in prioriteitsorde: type-schakelaar → **bedrag** (+ snelbedragen
  € 25/50/100/250/500) → **omschrijving** (+ recent-gebruikt chips) → potje →
  categorie → maand + dag → "elke maand herhalen"-switch → acties
- Belegging-sheet: naam + waarde
- Instellingen-sheet: weergave (Systeem/Licht/Donker), potjesbeheer
  (emoji + naam + beginsaldo + doel + verwijderen), startmaand,
  back-up exporteren/importeren, alles wissen
- Maandkiezer-sheet: jaar vooruit/terug + 12 korte maandnamen in 3 kolommen
- Keuze-sheet: bij het verwijderen van een terugkerende post
  ("alleen deze maand overslaan" vs "elke maand verwijderen")
- **Toast** met "Ongedaan maken" na verwijderen

**Statussen die een ontwerp moet dekken**
- Lege app (welkomsthint met knop naar instellingen)
- Lege lijst ("Nog geen aankopen deze maand.")
- Negatief saldo (rood, en de hero-variant met rood bedrag)
- Potje zonder doel (geen voortgangsbalk) vs met doel
- Heel lange omschrijvingen en grote bedragen (moeten afbreken/ellipsen)
- Veel potjes (10+) → strip scrollt, instellingen wordt lang

---

## 6. Huidige designtaal (vervangbaar, als referentie)

**Kleur — licht thema**

| Token | Waarde | Rol |
|---|---|---|
| `--bg-0` / `--bg-1` | `#ffffff` / `#f5f8f7` | achtergrondverloop |
| `--text` / `--text-2` / `--text-3` | `#12241d` / 64% / 42% | tekst-hiërarchie |
| `--accent` | `#1B4D3E` | dennengroen: links, actieve tab |
| `--pos` | `#15653D` | inkomsten |
| `--neg` | `#B4482E` | uitgaven (terracotta) |
| `--glass` / `--glass-strong` | wit 70% / 92% | kaarten |
| `--glass-border` | groen 12% | kaartrand |
| `--hero-a/b/c` | `#2f7159` → `#1B4D3E` → `#143c30` | hero-gradient |

**Kleur — donker thema** (`:root[data-theme="dark"]`): `--bg-0: #08120f`,
kaarten `rgba(37,60,52,.78)`, accent `#6fd9ac`, pos `#54dfa8`, neg `#ff9077`,
hero luminanter (`#3d9375` → `#256853` → `#17493a`).

**Vorm & ritme**
- Radii: `26px` (grote kaart) / `18px` (kaart) / `13px` (veld, rij)
- Glass: `backdrop-filter: blur(22px) saturate(180%)` + 1px rand + zachte schaduw
- Paginabreedte: `max-width: 560px`, gecentreerd
- Zijmarge: `clamp(16px, 4.5vw, 22px)`
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
- Sfeer: drie grote wazige groene "blobs" op de achtergrond (subtiel)

**Typografie**
- Systeemfont-stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", …`)
- Hero-bedrag: `clamp(2.6rem, 12.5vw, 3.5rem)`, gewicht 760, `letter-spacing: -.035em`
- Kop: ~1.06rem/660 · Rij: .95rem/560 · Meta: .72–.8rem
- **Alle bedragen** `font-variant-numeric: tabular-nums`

**Beweging**
- Bedragen tellen op-/af (count-up ~450ms)
- Tabwissel: fade + 8px omhoog
- Sheets: van onderen inschuiven (mobiel) / oppoppen (desktop ≥600px)
- Tab-indicator schuift mee
- Alles respecteert `prefers-reduced-motion`

**Iconografie**: inline SVG voor UI (1.7 stroke), **emoji** voor potjes en
categorieën (bewust: geeft kleur en herkenning zonder icoonbibliotheek).

---

## 7. Harde constraints (niet onderhandelbaar)

1. **Vanilla HTML + CSS + JS**, geen build-stap, geen frameworks, geen
   dependencies. Drie bestanden: `index.html`, `styles.css`, `app.js`.
2. **Volledig offline** via service worker; installeerbaar als PWA.
3. **Alles lokaal** — geen server, geen account. (Cloud-sync staat op de
   wenslijst maar is er nog niet.)
4. **Mobile-first**, moet werken vanaf **320px breed**. Getest tot iPhone SE.
5. **iOS Safari standalone**: respecteer `env(safe-area-inset-*)`; gebruik
   `dvh` i.p.v. `vh`; inputs **minimaal 16px** font (anders zoomt iOS in).
6. **Beide thema's** verplicht, plus handmatige keuze (Systeem/Licht/Donker)
   via `data-theme` op `<html>`.
7. **Toegankelijkheid**: raakvlakken ≥44px, zichtbare focus-ring, correcte
   labels/`aria-*`, kleur nooit de enige aanwijzing, contrast APCA-waardig.
8. **Nederlandse** interface; bedragen via `Intl.NumberFormat('nl-NL')`
   (→ `€ 1.234,56`), datums via `Intl.DateTimeFormat`.

---

## 8. Valkuilen die we al tegenkwamen — voorkom herhaling

Deze kostten echt tijd. Neem ze mee in het nieuwe ontwerp:

1. **Flex-kinderen moeten kunnen krimpen.** Een `<input>` heeft een intrinsieke
   breedte; zonder `min-width: 0` (en `flex: 1 1 0`) duwt hij buurelementen
   buiten het scherm. Zo verdween een verwijderknop 38px buiten beeld.
2. **Generieke selectors overschrijven specifieke.** `.field input { width: 100% }`
   won van `.pe-icon { width: 48px }`. Scope breed-werkende regels.
3. **Grids moeten krimpbaar zijn:** `repeat(3, minmax(0, 1fr))`, niet `1fr`,
   anders blazen lange woorden de kolommen op (gebeurde in de maandkiezer).
4. **Tel je kolommen na het toevoegen van een tab.** De tabbalk stond op 2
   kolommen toen er een derde tab bijkwam → tweede regel + botsing met de FAB.
5. **Actieknoppen in een scrollende sheet moeten sticky zijn**, anders staat
   "Opslaan" onbereikbaar onder de schermrand.
6. **Meng geen rood over groen.** Een rode tint (`--neg`) over een groene kaart
   wordt **bruin**. Zet getinte vlakken op een neutrale ondergrond:
   `linear-gradient(tint, tint), rgba(34,30,30,.86)`.
7. **In het donker leest diepte via lichtheid, niet via schaduw.** Maak kaarten
   lichter dan de achtergrond en geef ze een zichtbare rand.
8. **Reserveer ruimte onderaan de pagina** voor tabbalk + FAB
   (`padding-bottom: calc(172px + env(safe-area-inset-bottom))`).
9. **Service worker: app-shell netwerk-eerst.** Anders mengt nieuwe HTML met
   oude CSS en breekt de lay-out na een update.

---

## 9. Wat ik terug zou willen van een nieuw ontwerp

**Voorkeur: één zelfstandige HTML-pagina** met alle drie de schermen als
statische mock (met realistische Nederlandse voorbeelddata), zodat het direct
te bekijken en te beoordelen is. Daarnaast:

1. **Designtokens** als CSS custom properties, voor licht **en** donker.
2. **Alle drie de schermen** uitgewerkt, plus de belangrijkste sheet (invoer).
3. **De statussen** uit §5 (leeg, negatief, lange tekst, veel potjes).
4. Een korte **rationale**: waarom deze hiërarchie, waarom deze kleuren.
5. Werkend vanaf **320px** en respect voor de constraints in §7.

**Vrijheid:** de complete visuele taal mag om — kleur, vorm, typografie,
lay-out, mate van "glass", illustratie-stijl. Ook de indeling binnen een scherm
mag anders, zolang de drie kernbehoeften overeind blijven: *overzicht*,
*snel invoeren*, *cashflow-inzicht*.

**Wat wél moet blijven:** het onderscheid Overzicht (basis) → Maand (detail),
de potjes als organisatieprincipe, en de scrubbare dag-voor-dag cashflow-lijn.

---

## 10. Open wensen (nog niet gebouwd)

Als een nieuw ontwerp hier al rekening mee houdt, scheelt dat later werk:

- **Overboeken tussen potjes** (van Algemeen → Auto) als één actie
- **Doel met einddatum** + "je loopt voor/achter"-indicatie
- **Eigen categorieën** beheren (nu vast: Baby/Huis/Overig)
- **Terugkerende post met einddatum** (bijv. aflopende lening)
- **Jaaroverzicht** per categorie
- **Cloud-sync** (meerdere apparaten; data staat nu alleen lokaal)
- **Back-up-herinnering** — nu is data kwijt als de PWA verwijderd wordt
