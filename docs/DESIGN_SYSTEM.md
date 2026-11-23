# Design System — Maamitta

Maamitta on **kenttätyökalu**, ei koristeellinen markkinointisivusto. Suunnittelu perustuu pohjoismaiseen maastokartografiaan, korkeaan luettavuuteen ulkovalossa sekä natiiviin mobiilituntumaan.

## 1. Suunnitteluperiaatteet

- **Kartta on pääasia.** Käyttöliittymä kelluu kevyesti kartan reunoilla; ei tarpeettomia sivupalkkeja tai geneerisiä korttirivejä.
- **Luettavuus ulkona:** Korkea kontrasti, selkeät reunaviivat (hairline borders) ja riittävän suuret kosketusalueet (vähintään 44×44 px).
- **Ei AI-sloppia:** Ei neon-liukuvärejä, ei turhia animaatioita toistuvissa toiminnoissa, ei keksittyjä mittareita. Selkeä suomalainen ammattikieli.
- **Numerot eivät hypi:** Kaikki mitat, määrät ja eurot käyttävät `font-variant-numeric: tabular-nums`.

## 2. Värihierarkia ja tokenit (`src/styles/tokens.css`)

Käyttöliittymässä on neljä selkeää visuaalista tasoa (toimii myös punavihervärisokeille):
1. **Päätoiminto (CTA):** Havumetsänvihreä `#184E3B` — varattu ensisijaisesti *Lataa PDF-arvio* -toiminnolle.
2. **Aktiiviset valinnat:** Lämmin tummanharmaa grafiitti `#252F2C` (`--surface-selected`) valkoisella tekstillä (`FI / EN`, aktiivinen karttataso, työlaji, kaltevuus, työkalu).
3. **Toissijaiset klikattavat napit:** Valkoinen `#FFFFFF` reunaviivalla ja kevyellä varjolla.
4. **Staattiset mittalaatikot:** Upotettu lämmin kivi `#F1EFEA` ilman varjoa.

| Token | Arvo | Käyttötarkoitus |
| :--- | :--- | :--- |
| `--surface-base` | `#FAF9F6` | Lämmin paperinvalkoinen päätausta |
| `--surface-elevated` | `#FFFFFF` | Kelluvat kortit, laskuripaneeli, painikkeet |
| `--surface-subtle` | `#F1EFEA` | Toissijaiset syötekentät, välilehtipohjat |
| `--ink-primary` | `#141A18` | Pääteksti ja ensisijaiset ikonit |
| `--ink-secondary` | `#4A5551` | Selitteet, yksiköt, toissijaiset arvot |
| `--ink-muted` | `#6E7B76` | Paikkamerkit, aputekstit |
| `--accent-primary` | `#184E3B` | Pohjoismainen havumetsä — päätoiminnot (CTA) |
| `--accent-primary-hover` | `#123C2D` | Hover (vain osoitinlaitteilla) |
| `--accent-soft` | `#E7F1ED` | Aktiivinen valintatila |
| `--geo-area` | `#0B6EFD` | Mitattu alue kartalla (väriesteetön sininen punaisen kiinteistörajan päällä) |
| `--geo-cutout` | `#D97706` | Poisleikattu alue / rakennus (kirkas keltainen/meripihka katkoviivalla) |
| `--geo-line` | `#9333EA` | Mitattu linja (aita / salaoja — selkeä violetti) |

## 3. Typografia

- **UI-fontti:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`
- **Numerot ja koordinaatit:** `tabular-nums`, päämitta-arvot `font-weight: 600` ja `letter-spacing: -0.02em`.
- **Syötekentät:** Aina vähintään `16px`, jotta iOS Safari ei zoomaa sivua kenttään napautettaessa.

## 4. Liikekieli ja vuorovaikutus

- **Käyrät:**
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — painikkeet, popoverit, valinnat (120–200 ms)
  - `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` — laskuripaneeli / bottom sheet (280–340 ms)
- **Painallustuntuma:** Jokainen painike skaalautuu `:active`-tilassa `scale(0.97)` (120 ms `--ease-out`).
- **Ei animaatiota `scale(0)`:sta:** Ponnahduselementit alkavat `scale(0.96)` + `opacity: 0`.
- **Ei toistuvien toimintojen hidastamista:** Pisteen lisäys kartalle ja kumoa-toiminto reagoivat välittömästi ilman viivettä.

## 5. Mobiilinatiivi peruskerros (`src/styles/mobile-native.css`)

- `height: 100dvh` sovelluskehyksessä (ei `100vh`-bugia mobiiliselaimen osoitepalkin kanssa).
- `viewport-fit=cover` + `env(safe-area-inset-*)` yläpalkissa ja alatelakassa (iPhonen lovi ja kotipalkki).
- `-webkit-tap-highlight-color: transparent` poistaa harmaan välähdyksen napautuksessa.
- `overscroll-behavior: none` juurella ja `overscroll-behavior: contain` vieritettävässä paneelissa.
- Kaikki `:hover`-tyylit rajattu `@media (hover: hover) and (pointer: fine)` -kyselyyn (ei jumittavia hover-tiloja kosketusnäytöllä).
- `touch-action: manipulation` painikkeissa ja `user-select: none` vain kontrolleissa (ei laskelmien tulosteksteissä).
- **Älä koskaan estä zoomia** (`user-scalable=no` kielletty saavutettavuussyistä).
