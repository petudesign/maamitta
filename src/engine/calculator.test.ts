import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAT_RATE_PCT,
  getDefaultParamValues,
  getPresetById,
} from '../presets/finland';
import { calculateEstimate } from './calculator';
import type { MeasurementSummary } from './types';

const sampleSummary: MeasurementSummary = {
  grossAreaSqm: 240,
  cutoutAreaSqm: 40,
  netAreaSqm: 200,
  effectiveAreaSqm: 200,
  netAreaHa: 0.02,
  perimeterM: 64,
  lineLengthM: 50,
  slopePct: 0,
  slopeFactor: 1,
};

describe('material calculator', () => {
  it('calculates crushed stone tonnes, loads, and 25.5% VAT', () => {
    const preset = getPresetById('murske');
    const result = calculateEstimate({
      preset,
      summary: sampleSummary,
      params: getDefaultParamValues(preset),
      unitPriceEur: 30,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });

    // 200 m² * 0.15 m = 30 m³; * 1.10 waste = 33 m³; * 1.7 t/m³ = 56.1 t
    expect(result.billableQuantity).toBeCloseTo(56.1, 2);
    expect(result.subtotalEur).toBeCloseTo(56.1 * 30, 2);
    expect(result.totalEur).toBeCloseTo(56.1 * 30 * 1.255, 2);
  });

  it('calculates fence posts from line length', () => {
    const preset = getPresetById('aita');
    const result = calculateEstimate({
      preset,
      summary: sampleSummary,
      params: { postSpacingM: 2.5, wastePct: 5 },
      unitPriceEur: 40,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });

    // 50 m / 2.5 m = 20 intervals -> 21 posts
    expect(result.lines.find((l) => l.label.includes('Tolpat'))?.value).toBe(
      '21 kpl'
    );
    expect(result.billableQuantity).toBeCloseTo(52.5, 2);
  });

  it('clamps negative and extreme scientific-notation inputs safely', () => {
    const preset = getPresetById('murske');
    const negative = calculateEstimate({
      preset,
      summary: sampleSummary,
      params: { depthCm: -50, densityTPerM3: -2, wastePct: -150, truckLoadT: -10 },
      unitPriceEur: -100,
      vatRatePct: -50,
    });

    expect(negative.billableQuantity).toBeGreaterThanOrEqual(0);
    expect(negative.subtotalEur).toBe(0);
    expect(negative.vatRatePct).toBe(0);
    expect(negative.totalEur).toBe(0);

    const huge = calculateEstimate({
      preset,
      summary: sampleSummary,
      params: { depthCm: 1e200, densityTPerM3: 1e200, wastePct: 1e200, truckLoadT: 1e200 },
      unitPriceEur: 1e200,
      vatRatePct: 1e200,
    });

    expect(Number.isFinite(huge.totalEur)).toBe(true);
    expect(Number.isFinite(huge.billableQuantity)).toBe(true);
  });

  it('calculates stone paving pallets, bedding sand, and edging from perimeter', () => {
    const preset = getPresetById('kiveys');
    const result = calculateEstimate({
      preset,
      summary: sampleSummary,
      params: getDefaultParamValues(preset),
      unitPriceEur: 38,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });

    // 200 m² * 1.08 = 216 m² -> 22 pallets (10 m²/pallet), perimeter 64 m edging
    expect(result.billableQuantity).toBeCloseTo(216, 1);
    expect(result.lines.some((l) => l.value === '22 kpl')).toBe(true);
    expect(result.lines.some((l) => l.value === '64,0 m')).toBe(true);
  });

  it('calculates asphalt, excavation swell, and forest seedlings', () => {
    const asphalt = calculateEstimate({
      preset: getPresetById('asfaltti'),
      summary: sampleSummary,
      params: { thicknessMm: 50, wastePct: 5 },
      unitPriceEur: 26,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });
    expect(asphalt.billableQuantity).toBe(200);
    expect(asphalt.lines.some((l) => l.label.includes('Asfalttimäärä'))).toBe(true);

    const dig = calculateEstimate({
      preset: getPresetById('kaivanto'),
      summary: sampleSummary,
      params: { depthCm: 50, swellFactor: 1.3, truckLoadM3: 10 },
      unitPriceEur: 18,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });
    // 200 * 0.5 = 100 bank m³ * 1.3 = 130 loose m³ -> 13 loads
    expect(dig.billableQuantity).toBeCloseTo(130, 1);
    expect(dig.lines.some((l) => l.value === '13 kpl')).toBe(true);

    const forest = calculateEstimate({
      preset: getPresetById('metsa'),
      summary: { ...sampleSummary, effectiveAreaSqm: 20_000, netAreaSqm: 20_000, netAreaHa: 2 },
      params: { seedlingsPerHa: 1800 },
      unitPriceEur: 650,
      vatRatePct: DEFAULT_VAT_RATE_PCT,
    });
    expect(forest.billableQuantity).toBeCloseTo(2, 2);
  });
});
