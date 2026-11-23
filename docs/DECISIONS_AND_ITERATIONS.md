# Suunnittelu- ja kehityspäätökset (Case Study -loki)

Tämä dokumentti kokoaa Maamitta-projektin keskeiset tuote-, UX- ja tekniset päätökset sekä oikeassa testauksessa löydetyt ongelmat ja niiden ratkaisut.

---

## 1. Tuoteidea ja markkina-aukko

* **Lähtökohta:** Suomessa karttasovellukset (*Karttaselain*, *Mapis*, *MML Karttapaikka*) ovat erinomaisia retkeilyyn ja kiinteistörajojen tarkasteluun, mutta yksikään niistä ei vie urakoitsijaa saumattomasti ketjussa **karttamittaus -> rakennusten poisleikkaus -> materiaalimenekki (tonnit/kuutiot/kuormat) -> asiakasvalmis PDF-tarjous**.
* **Alustavalinta:** Mobile-first **Web App / PWA** natiivin iOS-sovelluksen sijaan MVP-vaiheessa. Poistaa App Store -kitkan ja 15–30 % maksukomission, toimii heti puhelimella ja työpöydällä (urakoitsijat viimeistelevät tarjouksia usein koneella) ja mahdollistaa myöhemmän paketoinnin natiiviksi Capacitorilla.

---

## 2. Oikeassa testauksessa löydetyt ongelmat ja ratkaisut

### 2.1 Kartan tarkkuus ja 3D-kallistus
* **Ongelma:** MapLibren oletusasetuksena oikea hiirenklikkaus kallisti tasaisen 2D-kartan turhaan 3D-kulmaan, ja kartalla pystyi zoomaamaan ulos koko maapallolle.
* **Ratkaisu:** Kartta lukittiin tiukasti suoraan ylhäältä kuvattuun 2D-näkymään (`maxPitch: 0`, `dragRotate: false`, `touchPitch: false`) ja rajattiin maantieteellisesti Suomen alueelle (`minZoom: 5`, `maxBounds: FINLAND_BOUNDS`). Oikea klikkaus vapautettiin kulmapisteen poistamiseen.

### 2.2 Retina-näyttöjen pikselöityminen & MML:n zoom-rajat
* **Ongelma:** 256 px rasteritiilet venyivät Macin Retina-näytöllä 2× sumeiksi, ja MML:n `kiinteistojaotus`-tiilet (joita tarjotaan vain tasoilla 12–18) jäivät ulos zoomatessa välimuistista punaiseksi neliöksi.
* **Ratkaisu:** HiDPI-näytöillä asetettiin `tileSize: 128`, jolloin MapLibre lataa yhtä zoom-tasoa tarkemmat tiilet 1:1-pikselitiheydellä. Kiinteistörajataso rajattiin näkyväksi vasta tonttitasolla (`minzoom: 14`), ja kaupunkikohteisiin lisättiin oletukseksi tarkempi HD-satelliitti MML:n ortokuvan ja maastokartan rinnalle.

### 2.3 Automaattinen tonttien ja rakennusten poiminta (OSM -> MML)
* **Ongelma 1:** Julkinen OpenStreetMap Overpass -rajapinta ruuhkautui metsäalueilla eikä sisältänyt kaikkia maaseudun rakennuksia; lisäksi rakennusten poisleikkaus jätti aluksi seinä seinää vasten olevia naapurirakennuksia mukaan tai ohitti L-muotoisia taloja (joiden keskipiste jäi tontin ulkopuolelle).
* **Ratkaisu:** Kytkettiin Maanmittauslaitoksen viralliset OGC API Features -rajapinnat (`/api/mml-features` kiinteistöpalstoille ja `/api/mml-maasto` Maastotietokannan rakennuksille) palvelinpuolen proxyn taakse. Rakennusten osumatarkistus vaihdettiin **tarkkaan geometriseen leikkauspinta-alaan** (`@turf/difference` >= 6 m²), joka karsii naapurirakennukset mutta poimii luotettavasti myös L- ja C-muotoiset rakennukset.
* **Satelliitin parallaksi:** Havaittiin, että vinossa kulmassa otetuissa satelliittikuvissa harjakatto näyttää siirtyvän pari metriä kivijalasta — MML:n ortokuvassa ja vektoridatassa pohjapinta-ala osuu kohdalleen (räystäitä lukuun ottamatta).

### 2.4 Väriesteettömyys (punavihervärisokeus)
* **Ongelma:** MML:n punaiset kiinteistörajat, oranssi mittausalue ja punainen rakennusvähennys sekoittuivat toisiinsa, ja valkoiseksi haalistetut kiinteistörajat hukkuivat vaaleisiin kattoihin.
* **Ratkaisu:** Palautettiin MML:n terävät punaiset kiinteistörajat ja siirryttiin Okabe-Ito-henkiseen **sininen (alue) / keltainen katkoviiva (rakennusvähennys) / violetti (linja)** -palettiin, joka tarjoaa maksimaalisen kontrastin myös punavihervärisokeille (~8 % miehistä).

### 2.5 Näkymätön offscreen-PDF-renderöinti
* **Ongelma:** Suora kuvankaappaus näkyvästä kartasta otti kuvan käyttäjän senhetkisestä zoomista (jopa kaukaa kaupunkitasolta), näytti muokkauspallot ja muiden tonttien punaiset rajat, ja kameran hyppääminen kesken PDF-viennin hämmensi käyttäjää.
* **Ratkaisu:** Rakennettiin erillinen offscreen-renderöijä (`src/export/mapSnapshot.ts`), joka luo piilotetun 1200×566 px MapLibre-instanssin ilman muiden tonttien punaisia rajoja ja muokkauspalloja, rajaa kohteen tarkasti, piirtää sivujen metrimitat suoraan kuvaan ja siivoaa WebGL-kontekstin heti kuvan ottamisen jälkeen.

### 2.6 Luottamus ja tarkkuus ("arvio" -> ammattityökalu)
* **Ratkaisu:** Lisättiin sivujen pituudet metreinä suoraan kartalle, läpinäkyvä datalähde- ja tarkkuusmerkki (*Virallinen MML-data ±2 %*), hinnan vaihteluväli, automaattinen korkeuseron/rinteen 3D-korjaus, kiinteistötunnuksen kopiointi sekä yrityksen oma logo PDF-tarjoukseen.

### 2.7 Kameran sijainnin säilyminen & moniprojektituki
* **Ongelma:** Sivun päivitys säilytti mitatun tontin (esim. Varsinais-Suomessa), mutta palautti karttakameran Helsinkiin.
* **Ratkaisu:** Kartta rajautuu nyt automaattisesti tallennetun projektin alueeseen sivun latauksessa ja projektia vaihtaessa, ja viimeisin kamerasijainti tallentuu paikallisesti.

### 2.8 Tietoturva, GDPR ja skaalautuvuus
* **API-avaimet:** `MML_API_KEY` ei koskaan päädy selaimen koodiin — kehityksessä Vite-proxy, tuotannossa Cloudflare Pages Function (`functions/api/[[route]].ts`) 24 h / 1 h edge-välimuistilla.
* **Omistajatiedot:** Kiinteistönomistajien nimet ovat KTJ-tietoluvan ja GDPR:n alaista henkilötietoa; sovellus näyttää avoimen kiinteistötunnuksen kopiointinapilla ja ohjaa viralliseen MML-asiointipalveluun.
* **Kansainvälistyminen:** Tyyppiturvallinen `FI / EN` -kielikerros (`src/i18n/`) rakennettiin heti MVP-vaiheessa, jotta uusien kielten ja markkinoiden lisääminen on suoraviivaista.
