import type { Locale } from '../i18n/types';

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(decimals: number, locale: Locale): Intl.NumberFormat {
  const key = `${locale}:${decimals}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fi-FI', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatArea(sqm: number, locale: Locale = 'fi'): string {
  if (sqm >= 10_000) {
    return `${numberFormatter(2, locale).format(sqm / 10_000)} ha`;
  }
  const decimals = sqm >= 100 ? 0 : 1;
  return `${numberFormatter(decimals, locale).format(sqm)} m²`;
}

export function formatLength(meters: number, locale: Locale = 'fi'): string {
  if (meters >= 1000) {
    return `${numberFormatter(2, locale).format(meters / 1000)} km`;
  }
  const decimals = meters >= 100 ? 0 : 1;
  return `${numberFormatter(decimals, locale).format(meters)} m`;
}

export function formatNumber(
  value: number,
  decimals = 1,
  locale: Locale = 'fi'
): string {
  return numberFormatter(decimals, locale).format(value);
}

export function formatEur(amount: number, locale: Locale = 'fi'): string {
  const formatted = numberFormatter(2, locale).format(amount);
  return locale === 'en' ? `€${formatted}` : `${formatted} €`;
}
