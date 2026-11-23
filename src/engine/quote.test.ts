import { describe, expect, it } from 'vitest';
import { computeQuoteTotals, nextUniqueZoneLabel } from './quote';
import type { QuoteZoneItem } from './types';

function mockItem(overrides: Partial<QuoteZoneItem>): QuoteZoneItem {
  return {
    id: 'item_1',
    label: 'Kohde 1',
    presetId: 'murske',
    presetName: 'Murske / sora',
    basisValue: 100,
    basisUnit: 'm²',
    summaryText: '',
    subtotalEur: 100,
    vatEur: 25.5,
    totalEur: 125.5,
    geometry: { areaPoints: [], cutouts: [], activeCutout: [], linePoints: [] },
    ...overrides,
  };
}

describe('quote helpers', () => {
  it('prefers parcelCode when available', () => {
    const existing = [mockItem({ label: 'Kohde 1' })];
    expect(nextUniqueZoneLabel(existing, '710-585-1-1', 'fi')).toBe(
      '710-585-1-1'
    );
  });

  it('picks the lowest unused fallback index without collisions', () => {
    const existing = [
      mockItem({ label: 'Kohde 1' }),
      mockItem({ label: 'Kohde 3' }),
    ];
    expect(nextUniqueZoneLabel(existing, null, 'fi')).toBe('Kohde 2');
    expect(nextUniqueZoneLabel([], null, 'en')).toBe('Zone 1');
  });

  it('computes combined area, line length, and total EUR in one pass', () => {
    const totals = computeQuoteTotals([
      mockItem({ basisUnit: 'm²', basisValue: 250, totalEur: 1000 }),
      mockItem({ basisUnit: 'm²', basisValue: 750, totalEur: 2500 }),
      mockItem({ basisUnit: 'm', basisValue: 45, totalEur: 500 }),
    ]);
    expect(totals.areaSqm).toBe(1000);
    expect(totals.lineM).toBe(45);
    expect(totals.totalEur).toBe(4000);
  });
});
