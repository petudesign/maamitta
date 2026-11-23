import type { Locale } from '../i18n/types';
import type {
  CalculationResult,
  MaterialPreset,
  MeasurementGeometry,
  QuoteZoneItem,
} from './types';

export interface QuoteTotals {
  areaSqm: number;
  lineM: number;
  totalEur: number;
}

export function nextUniqueZoneLabel(
  existing: QuoteZoneItem[],
  parcelCode: string | null,
  locale: Locale
): string {
  if (parcelCode) return parcelCode;
  const prefix = locale === 'en' ? 'Zone' : 'Kohde';
  const used = new Set(existing.map((item) => item.label));
  let n = 1;
  while (used.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}

export function buildQuoteZoneItem(params: {
  existing: QuoteZoneItem[];
  parcelCode: string | null;
  locale: Locale;
  preset: MaterialPreset;
  estimate: CalculationResult;
  geometry: MeasurementGeometry;
}): QuoteZoneItem {
  const { existing, parcelCode, locale, preset, estimate, geometry } = params;
  return {
    id: `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: nextUniqueZoneLabel(existing, parcelCode, locale),
    presetId: preset.id,
    presetName: preset.name,
    basisValue: estimate.basisValue,
    basisUnit: estimate.basisUnit,
    summaryText: estimate.lines
      .map((l) => `${l.label}: ${l.value}`)
      .join(' · '),
    subtotalEur: estimate.subtotalEur,
    vatEur: estimate.vatEur,
    totalEur: estimate.totalEur,
    geometry,
  };
}

export function computeQuoteTotals(items: QuoteZoneItem[]): QuoteTotals {
  let areaSqm = 0;
  let lineM = 0;
  let totalEur = 0;

  for (const item of items) {
    if (item.basisUnit === 'm²') {
      areaSqm += item.basisValue;
    } else if (item.basisUnit === 'm') {
      lineM += item.basisValue;
    }
    totalEur += item.totalEur;
  }

  return { areaSqm, lineM, totalEur };
}
