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
});
