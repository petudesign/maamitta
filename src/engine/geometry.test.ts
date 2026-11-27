import { describe, expect, it } from 'vitest';
import {
  collectGeometryPoints,
  computeBounds,
  computeCentroid,
  computeLineLengthM,
  summarizeGeometry,
} from './geometry';
import type { LngLat } from './types';

// ~100 m x 100 m square near Helsinki (60.17°N)
const square100m: LngLat[] = [
  [24.94, 60.17],
  [24.941805, 60.17],
  [24.941805, 60.170898],
  [24.94, 60.170898],
];

// ~25 m x 25 m cutout inside the square
const innerCutout: LngLat[] = [
  [24.9405, 60.1702],
  [24.94095, 60.1702],
  [24.94095, 60.170425],
  [24.9405, 60.170425],
];

describe('geometry engine', () => {
  it('computes geodesic area and perimeter accurately near 60°N', () => {
    const summary = summarizeGeometry({
      areaPoints: square100m,
      cutouts: [],
      activeCutout: [],
      linePoints: [],
    });

    expect(summary.grossAreaSqm).toBeGreaterThan(9_800);
    expect(summary.grossAreaSqm).toBeLessThan(10_200);
    expect(summary.netAreaSqm).toBeCloseTo(summary.grossAreaSqm, 4);
    expect(summary.perimeterM).toBeGreaterThan(395);
    expect(summary.perimeterM).toBeLessThan(405);
  });

  it('subtracts interior cutouts from net area without going negative', () => {
    const summary = summarizeGeometry({
      areaPoints: square100m,
      cutouts: [innerCutout],
      activeCutout: [],
      linePoints: [],
    });

    expect(summary.cutoutAreaSqm).toBeGreaterThan(550);
    expect(summary.cutoutAreaSqm).toBeLessThan(700);
    expect(summary.netAreaSqm).toBeCloseTo(
      summary.grossAreaSqm - summary.cutoutAreaSqm,
      2
    );
  });

  it('computes line length in meters', () => {
    const lengthM = computeLineLengthM([
      [24.94, 60.17],
      [24.941805, 60.17],
    ]);

    expect(lengthM).toBeGreaterThan(98);
    expect(lengthM).toBeLessThan(102);
  });

  it('applies 3D slope surface correction accurately', () => {
    const flat = summarizeGeometry(
      {
        areaPoints: square100m,
        cutouts: [],
        activeCutout: [],
        linePoints: [],
      },
      0
    );
    const sloped = summarizeGeometry(
      {
        areaPoints: square100m,
        cutouts: [],
        activeCutout: [],
        linePoints: [],
      },
      30
    );

    // 30% slope -> sqrt(1 + 0.09) ≈ 1.04403
    expect(sloped.slopeFactor).toBeCloseTo(1.04403, 4);
    expect(sloped.effectiveAreaSqm).toBeCloseTo(
      flat.netAreaSqm * Math.sqrt(1.09),
      2
    );
  });

  it('computes centroid, bounds, and collects all geometry points', () => {
    expect(computeCentroid([])).toBeNull();
    expect(computeBounds([])).toBeNull();

    const centroid = computeCentroid(square100m);
    expect(centroid).not.toBeNull();
    expect(centroid![0]).toBeCloseTo(24.9409025, 5);
    expect(centroid![1]).toBeCloseTo(60.170449, 5);

    const bounds = computeBounds(square100m);
    expect(bounds).toEqual([
      [24.94, 60.17],
      [24.941805, 60.170898],
    ]);

    const pts = collectGeometryPoints({
      areaPoints: square100m,
      cutouts: [innerCutout],
      activeCutout: [],
      linePoints: [[24.95, 60.18]],
    });
    expect(pts).toHaveLength(9);
  });
});
