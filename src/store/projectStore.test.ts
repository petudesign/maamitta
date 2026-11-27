import { describe, expect, it } from 'vitest';
import { sanitizeProject } from './projectStore';

describe('projectStore sanitizeProject', () => {
  it('returns null for non-object payloads', () => {
    expect(sanitizeProject(null)).toBeNull();
    expect(sanitizeProject('corrupted')).toBeNull();
  });

  it('filters out corrupted coordinate tuples and invalid quote items', () => {
    const clean = sanitizeProject({
      id: 'proj_1',
      geometry: {
        areaPoints: [
          [24.9, 60.1],
          ['bad', 60.1],
          [999, 60.1],
          [24.91, 60.11],
        ],
        cutouts: [
          [[24.9, 60.1]], // < 3 points should be dropped
          [
            [24.9, 60.1],
            [24.91, 60.1],
            [24.91, 60.11],
          ],
        ],
        activeCutout: [null, [24.9, 60.1]],
        linePoints: [[Number.NaN, 60.1], [24.9, 60.1]],
      },
      quoteItems: [
        { id: 'broken' },
        {
          id: 'ok_1',
          label: '710-585-1-1',
          presetId: 'murske',
          basisValue: 500,
          basisUnit: 'm²',
          totalEur: 2500,
          geometry: { areaPoints: [[24.9, 60.1]] },
        },
      ],
    });

    expect(clean).not.toBeNull();
    expect(clean!.geometry.areaPoints).toEqual([
      [24.9, 60.1],
      [24.91, 60.11],
    ]);
    expect(clean!.geometry.cutouts).toHaveLength(1);
    expect(clean!.geometry.activeCutout).toEqual([[24.9, 60.1]]);
    expect(clean!.geometry.linePoints).toEqual([[24.9, 60.1]]);
    expect(clean!.quoteItems).toHaveLength(1);
    expect(clean!.quoteItems[0]?.label).toBe('710-585-1-1');
  });

  it('rejects unsafe logo/photo URLs (SVG, javascript:, http:) and non-finite params', () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgo=';
    const validJpeg = 'data:image/jpeg;base64,/9j/4AAQ=';

    const clean = sanitizeProject({
      id: 'proj_sec',
      params: {
        depthCm: 15,
        badNaN: Number.NaN,
        badInf: Number.POSITIVE_INFINITY,
        badStr: '100',
        constructor: 99,
      },
      company: {
        name: 'Test Oy',
        logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
      },
      sitePhotos: [
        { id: 'svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', name: 'x.svg' },
        { id: 'js', dataUrl: 'javascript:alert(1)', name: 'bad' },
        { id: 'ok1', dataUrl: validJpeg, name: 'site.jpg' },
        { id: 'ok2', dataUrl: validPng, name: 'site2.png' },
      ],
    });

    expect(clean).not.toBeNull();
    expect(clean!.company.logoDataUrl).toBeUndefined();
    expect(clean!.sitePhotos).toHaveLength(2);
    expect(clean!.sitePhotos.map((p) => p.id)).toEqual(['ok1', 'ok2']);
    expect(clean!.params).toEqual({ depthCm: 15 });

    const withValidLogo = sanitizeProject({
      company: { logoDataUrl: validPng },
      params: [1, 2, 3],
    });
    expect(withValidLogo!.company.logoDataUrl).toBe(validPng);
    expect(withValidLogo!.params).toEqual({});
  });
});
