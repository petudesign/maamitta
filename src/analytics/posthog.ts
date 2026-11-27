/**
 * Opt-in PostHog EU analytics & session replay loader.
 *
 * Strictly privacy-first:
 * - Never loads any external script unless VITE_POSTHOG_KEY is configured AND
 *   the user explicitly grants consent in the beta banner.
 * - Uses in-memory persistence (cookie-free) and masks all input fields in replays.
 * - Tags sessions with `?ref=...` (e.g. `?ref=beta`) so beta tester sessions
 *   are easy to filter separately from internal testing.
 */

const CONSENT_STORAGE_KEY = 'maamitta:beta-analytics-consent';

export type AnalyticsConsent = 'granted' | 'denied';

interface PostHogStub extends Array<unknown> {
  _i?: Array<[string, Record<string, unknown>, string]>;
  init?: (key: string, config: Record<string, unknown>, name?: string) => void;
  register?: (props: Record<string, string | number | boolean>) => void;
  capture?: (
    eventName: string,
    props?: Record<string, string | number | boolean>
  ) => void;
  startSessionRecording?: () => void;
  __SV?: number;
}

let loaded = false;

function getPostHogKey(): string {
  return (import.meta.env.VITE_POSTHOG_KEY ?? '').trim();
}

function getPostHogHost(): string {
  const raw = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim();
  if (!raw) return 'https://eu.i.posthog.com';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.origin : 'https://eu.i.posthog.com';
  } catch {
    return 'https://eu.i.posthog.com';
  }
}

export function isPostHogConfigured(): boolean {
  return getPostHogKey().length > 0;
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
    return null;
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch {
    // Ignore storage quota / private mode errors
  }
}

function resolveAssetsHost(apiHost: string): string {
  return apiHost
    .replace(/\/+$/, '')
    .replace('://eu.i.posthog.com', '://eu-assets.i.posthog.com')
    .replace('://us.i.posthog.com', '://us-assets.i.posthog.com');
}

function readRefParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
    return ref ? ref.slice(0, 40) : null;
  } catch {
    return null;
  }
}

/**
 * Dynamically injects PostHog JS only after explicit user consent.
 * Safe to call multiple times (idempotent).
 */
export function initPostHog(): void {
  if (loaded || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const key = getPostHogKey();
  if (!key) return;
  loaded = true;

  const apiHost = getPostHogHost();
  const assetsHost = resolveAssetsHost(apiHost);

  // Official lightweight PostHog queue stub so events captured before array.js finishes loading are preserved
  const win = window as unknown as { posthog?: PostHogStub };
  const ph: PostHogStub = (win.posthog = win.posthog ?? []);
  if (!ph.__SV) {
    ph._i = [];
    const methods = [
      'capture',
      'register',
      'register_once',
      'unregister',
      'identify',
      'reset',
      'opt_in_capturing',
      'opt_out_capturing',
      'startSessionRecording',
      'stopSessionRecording',
    ];
    for (const method of methods) {
      (ph as unknown as Record<string, (...args: unknown[]) => void>)[method] = (
        ...args: unknown[]
      ) => {
        ph.push([method, ...args]);
      };
    }
    ph.init = (token: string, config: Record<string, unknown>, name = 'posthog') => {
      ph._i?.push([token, config, name]);
    };
    ph.__SV = 1;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `${assetsHost}/static/array.js`;
    script.onerror = () => {
      loaded = false;
      ph.length = 0;
    };
    document.head.appendChild(script);
  }

  ph.init?.(key, {
    api_host: apiHost,
    persistence: 'memory',
    person_profiles: 'identified_only',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: true,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-no-capture]',
    },
  });

  const ref = readRefParam();
  if (ref) {
    ph.register?.({ ref });
  }
  ph.startSessionRecording?.();
}
