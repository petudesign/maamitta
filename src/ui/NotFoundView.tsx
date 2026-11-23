import type { Locale } from '../i18n/types';
import { MaamittaLogo } from './MaamittaLogo';

export function NotFoundView({ locale }: { locale: Locale }) {
  return (
    <main className="not-found-shell">
      <div className="not-found-card">
        <div className="not-found-brand">
          <MaamittaLogo size={40} />
          <span className="not-found-brand-name">Maamitta</span>
        </div>
        <div className="not-found-code tabular-nums">404</div>
        <h1 className="not-found-title">
          {locale === 'en' ? 'Page not found' : 'Sivua ei löytynyt'}
        </h1>
        <p className="not-found-desc">
          {locale === 'en'
            ? 'The address you opened does not exist. Return to the map to measure parcels and calculate materials.'
            : 'Hakemaasi osoitetta ei ole olemassa. Palaa kartalle mittaamaan tontteja ja laskemaan materiaaleja.'}
        </p>
        <a href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          {locale === 'en' ? 'Back to map' : 'Palaa kartalle'}
        </a>
      </div>
    </main>
  );
}
