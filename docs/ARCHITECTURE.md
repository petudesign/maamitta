# Arkkitehtuuri

Maamitta on suunniteltu periaatteella **yksi yhteinen mittaus- ja laskentamoottori, monta markkinaa**. Uuden maan karttaprovideri tai uuden toimialan laskuripresetit voidaan lisätä koskematta käyttöliittymään tai geometrialaskentaan.

## Hakemistorakenne

```text
src/
├── map/          # Karttaproviderit (MML WMTS, ESRI World Imagery, OSM; valmis Kartverketille)
├── engine/       # Puhdas geometria- ja laskentamoottori (ei React- tai DOM-riippuvuutta)
│   ├── geometry.ts       # Pinta-ala, piiri, pituus, poisleikkaus (@turf/*)
│   ├── calculator.ts     # Materiaalimenekin ja ALV-hintojen laskenta
│   └── format.ts         # Yksikkö- ja valuuttaformatointi (fi-FI, myöhemmin en-US)
├── presets/      # Datalähtöiset materiaalilaskurit (murske, multa, nurmi, aita, auraus)
├── export/       # PDF-tarjousgeneraattori (jsPDF + MapLibre canvas snapshot)
├── store/        # Projektien tallennus (StorageRepository-rajapinta -> localStorage / Supabase)
├── styles/       # Design system: tokens.css, mobile-native.css, components.css
└── ui/           # Mobile-first React-komponentit (MapCanvas, TopBar, ToolDock, CalculatorSheet)
```

## Kerrossäännöt

1. **`src/engine/` on puhdasta TypeScriptiä.** Se ei saa importoida Reactia, MapLibrea eikä `window`-objektia. Kaikki laskentalogiikka on yksikkötestattua (`*.test.ts`).
2. **`src/presets/` on dataa.** Jos lisätään uusi materiaali tai USA:n imperial-presetit, lisätään konfiguraatio-objekti — ei `if/else`-haaroja UI-komponentteihin.
3. **`src/store/` käyttää rajapintaa.** MVP tallentaa `localStorageen`, mutta komponentit eivät kutsu `localStorage`a suoraan. Kun Supabase lisätään, vaihdetaan vain toteutusluokka.

## Tietoturva & karttadatan lisenssit

- **API-avaimet:** `MML_API_KEY` ei koskaan sisälly selaimen bundleen (`VITE_`-etuliitettä ei käytetä salaisille avaimille). Kehityksessä pyynnöt reititetään `vite.config.ts`-proxyn läpi; tuotannossa käytetään Cloudflare Worker / Vercel Edge -proxya ja tiilivälimuistia (TTL 24 h–7 vrk).
- **Attribuutio:** Karttaprovideri ilmoittaa aina oman CC BY 4.0 / copyright -tekstinsä, joka renderöidään sekä karttanäkymään että PDF-raporttiin.
- **Vastuuvapaus:** PDF-raportti sisältää aina huomautuksen, että satelliitti-/ortokuvamittaus on suuntaa-antava eikä korvaa virallista maanmittausta.

## Skaalautuvuus & mobiilijulkaisu

- **Client-side-suoritus:** Geometria, materiaalilaskenta ja PDF-generointi tapahtuvat 100 % selaimessa -> nolla palvelinkuormaa laskennasta.
- **PWA -> App Store:** Kun tuote on validoitu webissä, sama sovellus voidaan paketoida natiiviksi iOS/Android-sovellukseksi Capacitorilla tai toteuttaa SwiftUI:lla kierrättäen speksi ja backend.
