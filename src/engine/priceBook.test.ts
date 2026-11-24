import { describe, expect, it } from 'vitest';
import { getPresetById } from '../presets/finland';
import { calculateEstimate } from './calculator';
import {
  applyMargin,
  DEFAULT_PRICE_BOOK,
  hasCustomPriceBook,
  resolvePresetDefaults,
  sanitizePriceBook,
  savePresetToPriceBook,
} from './priceBook';
import type { MeasurementSummary } from './types';

const SAMPLE_SUMMARY: MeasurementSummary = {
  grossAreaSqm: 100,
  cutoutAreaSqm: 0,
  netAreaSqm: 100,
  effectiveAreaSqm: 100,
  netAreaHa: 0.01,
  perimeterM: 40,
  lineLengthM: 20,
  slopePct: 0,
  slopeFactor: 1,
};

describe('priceBook & contractor margin engine', () => {
  it('sanitizes malformed or out-of-range stored price books safely', () => {
    const clean = sanitizePriceBook({
      hourlyRateEur: -50,
      marginPct: 99,
      presets: {
        kiveys: { unitPriceEur: 49.5, wastePct: 12 },
        bad: { unitPriceEur: Number.NaN, wastePct: 200 },
      },
    });
    expect(clean.hourlyRateEur).toBe(0);
    expect(clean.marginPct).toBe(30); // clamped to MAX_MARGIN_PCT
    expect(clean.presets.kiveys).toEqual({ unitPriceEur: 49.5, wastePct: 12 });
    expect(clean.presets.bad).toEqual({ wastePct: 50 });
  });

  it('applies saved preset unit price and waste% overrides over Maamitta defaults', () => {
    const preset = getPresetById('kiveys', 'fi');
    const customBook = savePresetToPriceBook(DEFAULT_PRICE_BOOK, 'kiveys', 52, 12);

    const resolved = resolvePresetDefaults(preset, customBook);
    expect(resolved.unitPriceEur).toBe(52);
    expect(resolved.params.wastePct).toBe(12);
    // Unoverridden params still use built-in defaults
    expect(resolved.params.sandCm).toBe(4);
    expect(hasCustomPriceBook(customBook)).toBe(true);
    expect(hasCustomPriceBook(DEFAULT_PRICE_BOOK)).toBe(false);
  });

  it('folds margin% into subtotalEur & VAT without adding a separate client-facing line', () => {
    const preset = getPresetById('kiveys', 'fi');
    const noMargin = calculateEstimate({
      preset,
      summary: SAMPLE_SUMMARY,
      params: { wastePct: 10, sandCm: 4, palletSqm: 10 },
      unitPriceEur: 40,
      vatRatePct: 25.5,
      marginPct: 0,
      locale: 'fi',
    });

    const withMargin = calculateEstimate({
      preset,
      summary: SAMPLE_SUMMARY,
      params: { wastePct: 10, sandCm: 4, palletSqm: 10 },
      unitPriceEur: 40,
      vatRatePct: 25.5,
      marginPct: 15,
      locale: 'fi',
    });

    // 100 m² + 10% waste = 110 m² * 40 € = 4400 € base
    expect(noMargin.subtotalEur).toBeCloseTo(4400, 2);
    expect(withMargin.baseSubtotalEur).toBeCloseTo(4400, 2);
    expect(withMargin.marginPct).toBe(15);
    expect(withMargin.marginEur).toBeCloseTo(660, 2);
    expect(withMargin.subtotalEur).toBeCloseTo(5060, 2);
    expect(withMargin.vatEur).toBeCloseTo(5060 * 0.255, 2);
    expect(withMargin.totalEur).toBeCloseTo(5060 * 1.255, 2);

    // Margin never leaks as a separate breakdown row in client lines
    expect(
      withMargin.lines.some((l) => /kate|margin/i.test(l.label))
    ).toBe(false);
  });

  it('clamps margin helper safely between 0% and 30%', () => {
    expect(applyMargin(1000, -10)).toEqual({
      totalWithMarginEur: 1000,
      marginEur: 0,
      safeMarginPct: 0,
    });
    expect(applyMargin(1000, 50)).toEqual({
      totalWithMarginEur: 1300,
      marginEur: 300,
      safeMarginPct: 30,
    });
  });
});
