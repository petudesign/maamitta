import type { GeometrySource } from '../engine/types';
import type { Locale } from '../i18n/types';

export type AreaBucket =
  | 'none'
  | '<200m2'
  | '200-1000m2'
  | '1000-5000m2'
  | '5000m2-2ha'
  | '>2ha';

/**
 * Privacy-first product analytics event schema.
 * Strictly excludes PII: never log addresses, parcel IDs, coordinates, or company names.
 */
export interface AnalyticsEventMap {
  parcel_picked: {
    source: GeometrySource;
    buildingsSubtracted: number;
    shiftMulti: boolean;
  };
  buildings_subtracted: {
    count: number;
  };
  preset_selected: {
    presetId: string;
  };
  slope_detected: {
    slopePct: number;
  };
  zone_added: {
    totalZones: number;
    basisUnit: 'm²' | 'm' | 'kpl';
  };
  pdf_exported: {
    zoneCount: number;
    hasLogo: boolean;
    areaBucket: AreaBucket;
    presetId: string;
    locale: Locale;
  };
  summary_copied: {
    zoneCount: number;
    presetId: string;
    locale: Locale;
  };
  locale_switched: {
    locale: Locale;
  };
  search_selected: {
    locale: Locale;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

interface AnalyticsProvidersWindow extends Window {
  plausible?: (
    eventName: string,
    options?: { props?: Record<string, string | number | boolean> }
  ) => void;
  umami?: {
    track: (
      eventName: string,
      props?: Record<string, string | number | boolean>
    ) => void;
  };
  posthog?: {
    capture: (
      eventName: string,
      props?: Record<string, string | number | boolean>
    ) => void;
  };
}

export function bucketAreaSqm(sqm: number): AreaBucket {
  if (!Number.isFinite(sqm) || sqm <= 0) return 'none';
  if (sqm < 200) return '<200m2';
  if (sqm < 1000) return '200-1000m2';
  if (sqm < 5000) return '1000-5000m2';
  if (sqm < 20_000) return '5000m2-2ha';
  return '>2ha';
}

/**
 * Cookie-free analytics dispatcher.
 * Automatically forwards to Plausible, Umami, or PostHog when configured on the host page.
 * Enable console inspection in development via: localStorage.setItem('maamitta:debug-analytics', '1')
 */
export function trackEvent<K extends AnalyticsEventName>(
  name: K,
  props: AnalyticsEventMap[K]
): void {
  if (typeof window === 'undefined') return;
  const w = window as AnalyticsProvidersWindow;
  const payload = props as Record<string, string | number | boolean>;

  try {
    w.plausible?.(name, { props: payload });
    w.umami?.track(name, payload);
    w.posthog?.capture(name, payload);

    if (
      import.meta.env.DEV &&
      window.localStorage.getItem('maamitta:debug-analytics') === '1'
    ) {
      // eslint-disable-next-line no-console
      console.info('[maamitta:analytics]', name, payload);
    }
  } catch {
    // Analytics must never throw or disrupt UX
  }
}
