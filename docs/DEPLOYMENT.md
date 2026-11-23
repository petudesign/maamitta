# Julkaisu tuotantoon (Cloudflare Pages — 0 €/kk)

Maamitta on suunniteltu julkaistavaksi suoraan **Cloudflare Pages** -palveluun. Sama julkaisu sisältää sekä staattisen web-sovelluksen (`dist/`) että turvallisen MML-rajapintaproxyn (`functions/api/[[route]].ts`) välimuisteineen.

## 1. Julkaisu GitHubin kautta (suositeltu)

1. Vie projekti GitHub-repositorioon (varmista, ettei `.env` ole mukana — se on `.gitignore`-listalla).
2. Avaa **Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git**.
3. Aseta build-asetukset:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Lisää ympäristömuuttujat (**Settings -> Environment variables**):
   - `MML_PROXY_ENABLED` = `true` *(Build-aikaan: kertoo frontendille, että MML-kerrokset ovat päällä)*
   - `MML_API_KEY` = `<oma MML API-avain>` *(Aseta **Encrypt / Secret** -tilaan — ei koskaan päädy selaimelle)*
5. Julkaise! Sovellus toimii heti HTTPS-osoitteessa (ja halutessasi omalla `.fi`-domainilla).

## 2. Julkaisu komentoriviltä (Wrangler)

```bash
MML_PROXY_ENABLED=true npm run build
npx wrangler pages deploy dist
```

Aseta salaisuus kerran:

```bash
npx wrangler pages secret put MML_API_KEY
```

## Tietoturva- ja välimuistihuomiot

- `MML_API_KEY` liitetään pyyntöihin vain Cloudflare Edge -funktiossa (`functions/api/[[route]].ts`).
- Karttatiilet välimuistitetaan 24 tunniksi (`Cache-Control: max-age=86400`) ja kiinteistö-/rakennusrajat 1 tunniksi, mikä nopeuttaa karttaa ja suojaa MML:n avointa rajapintaa turhalta kuormalta.
