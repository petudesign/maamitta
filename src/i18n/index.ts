import { en } from './en';
import { fi } from './fi';
import type { Locale, Messages } from './types';

export type { Locale, Messages };

const LOCALE_STORAGE_KEY = 'maamitta:locale:v1';

const DICTIONARIES: Record<Locale, Messages> = { fi, en };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

export function loadInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'fi' || saved === 'en') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'fi';
}

export function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors
  }
}
