import { useEffect, useState } from 'react';
import {
  initPostHog,
  isPostHogConfigured,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  type AnalyticsConsent,
} from '../analytics/posthog';
import type { Locale } from '../i18n';

interface BetaConsentBannerProps {
  locale: Locale;
}

export function BetaConsentBanner({ locale }: BetaConsentBannerProps) {
  const configured = isPostHogConfigured();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() =>
    configured ? readAnalyticsConsent() : 'denied'
  );

  useEffect(() => {
    if (configured && consent === 'granted') {
      initPostHog();
    }
  }, [configured, consent]);

  if (!configured || consent !== null) {
    return null;
  }

  const handleChoose = (choice: AnalyticsConsent) => {
    saveAnalyticsConsent(choice);
    setConsent(choice);
    if (choice === 'granted') {
      initPostHog();
    }
  };

  return (
    <div
      className="beta-consent-banner"
      role="dialog"
      aria-live="polite"
      aria-label={locale === 'en' ? 'Beta feedback consent' : 'Beta-testin seuranta'}
    >
      <p className="beta-consent-text">
        <strong>{locale === 'en' ? 'Beta test:' : 'Beta-testi:'}</strong>{' '}
        {locale === 'en'
          ? 'May we record anonymous usage (clicks & screen replay) so we can see where the tool gets stuck?'
          : 'Saako tallentaa anonyymin käytön (klikkaukset ja ruutunauhoitus), jotta näen missä työkalu tökkii?'}
      </p>
      <div className="beta-consent-actions">
        <button
          type="button"
          className="btn btn-primary beta-consent-btn"
          onClick={() => handleChoose('granted')}
        >
          {locale === 'en' ? 'Yes, help improve' : 'Kyllä, auta kehittämään'}
        </button>
        <button
          type="button"
          className="btn btn-subtle beta-consent-btn"
          onClick={() => handleChoose('denied')}
        >
          {locale === 'en' ? 'No thanks' : 'Ei kiitos'}
        </button>
      </div>
    </div>
  );
}
