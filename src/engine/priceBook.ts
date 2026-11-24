import type {
  MaterialPreset,
  PresetPriceOverride,
  PriceBook,
} from './types';

export const DEFAULT_HOURLY_RATE_EUR = 75;
export const MAX_MARGIN_PCT = 30;

export const DEFAULT_PRICE_BOOK: PriceBook = {
  presets: {},
  hourlyRateEur: DEFAULT_HOURLY_RATE_EUR,
  marginPct: 0,
};

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function sanitizePriceBook(raw: unknown): PriceBook {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PRICE_BOOK, presets: {} };
  }
  const obj = raw as Partial<PriceBook>;
  const presets: Record<string, PresetPriceOverride> = {};

  if (obj.presets && typeof obj.presets === 'object') {
    for (const [presetId, entry] of Object.entries(obj.presets)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Partial<PresetPriceOverride>;
      const clean: PresetPriceOverride = {};
      if (typeof e.unitPriceEur === 'number' && Number.isFinite(e.unitPriceEur)) {
        clean.unitPriceEur = clampFinite(e.unitPriceEur, 0, 100_000, 0);
      }
      if (typeof e.wastePct === 'number' && Number.isFinite(e.wastePct)) {
        clean.wastePct = clampFinite(e.wastePct, 0, 50, 0);
      }
      if (clean.unitPriceEur !== undefined || clean.wastePct !== undefined) {
        presets[presetId] = clean;
      }
    }
  }

  return {
    presets,
    hourlyRateEur: clampFinite(
      obj.hourlyRateEur,
      0,
      1_000,
      DEFAULT_HOURLY_RATE_EUR
    ),
    marginPct: clampFinite(obj.marginPct, 0, MAX_MARGIN_PCT, 0),
  };
}

/**
 * Applies contractor margin (0–30%) onto a base amount (excl. VAT).
 */
export function applyMargin(
  baseEur: number,
  marginPct: number
): { totalWithMarginEur: number; marginEur: number; safeMarginPct: number } {
  const safeBase = clampFinite(baseEur, 0, 1_000_000_000, 0);
  const safeMarginPct = clampFinite(marginPct, 0, MAX_MARGIN_PCT, 0);
  const marginEur = safeBase * (safeMarginPct / 100);
  return {
    totalWithMarginEur: safeBase + marginEur,
    marginEur,
    safeMarginPct,
  };
}

/**
 * Resolves a preset's effective starting unit price and parameter map by
 * overlaying the contractor's saved PriceBook on top of Maamitta's built-in defaults.
 */
export function resolvePresetDefaults(
  preset: MaterialPreset,
  priceBook: PriceBook
): { unitPriceEur: number; params: Record<string, number> } {
  const override = priceBook.presets[preset.id];
  const params: Record<string, number> = {};
  for (const param of preset.parameters) {
    if (
      param.key === 'wastePct' &&
      override?.wastePct !== undefined &&
      Number.isFinite(override.wastePct)
    ) {
      params[param.key] = clampFinite(
        override.wastePct,
        param.min,
        param.max,
        param.defaultValue
      );
    } else {
      params[param.key] = param.defaultValue;
    }
  }

  const unitPriceEur =
    override?.unitPriceEur !== undefined && Number.isFinite(override.unitPriceEur)
      ? clampFinite(override.unitPriceEur, 0, 100_000, preset.defaultUnitPriceEur)
      : preset.defaultUnitPriceEur;

  return { unitPriceEur, params };
}

/**
 * Returns a new PriceBook with the given preset's unit price and optional waste% saved.
 */
export function savePresetToPriceBook(
  priceBook: PriceBook,
  presetId: string,
  unitPriceEur: number,
  wastePct?: number
): PriceBook {
  const nextEntry: PresetPriceOverride = {
    unitPriceEur: clampFinite(unitPriceEur, 0, 100_000, 0),
  };
  if (wastePct !== undefined && Number.isFinite(wastePct)) {
    nextEntry.wastePct = clampFinite(wastePct, 0, 50, 0);
  }
  return {
    ...priceBook,
    presets: {
      ...priceBook.presets,
      [presetId]: nextEntry,
    },
  };
}

export function hasCustomPriceBook(priceBook: PriceBook): boolean {
  return (
    Object.keys(priceBook.presets).length > 0 ||
    priceBook.hourlyRateEur !== DEFAULT_HOURLY_RATE_EUR ||
    priceBook.marginPct > 0
  );
}
