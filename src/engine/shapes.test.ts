import { describe, expect, it } from 'vitest';
import { summarizeGeometry } from './geometry';
import {
  bufferLineToCorridor,
  createCircleAtCenter,
  createRectangleAtCenter,
  snapPointToFeatureCollection,
} from './shapes';

const areaOf = (pts: [number, number][]) =>
  summarizeGeometry({
    areaPoints: pts,
    cutouts: [],
    activeCutout: [],
    linePoints: [],
  }).netAreaSqm;

describe('shapes & corridor helpers', () => {
  it('buffers a 20m straight line by 4m width into an ~80 m² corridor', () => {
    const start: [number, number] = [24.9384, 60.1699];
    const end: [number, number] = [
      24.9384 + 20 / (111_320 * Math.cos((60.1699 * Math.PI) / 180)),
      60.1699,
    ];
    const poly = bufferLineToCorridor([start, end], 4);
    expect(poly).toHaveLength(4);
    const area = areaOf(poly);
    expect(area).toBeGreaterThan(78);
    expect(area).toBeLessThan(82);
  });

  it('creates an exact 10x5 m rectangle (~50 m²)', () => {
    const rect = createRectangleAtCenter([24.9384, 60.1699], 10, 5);
    expect(rect).toHaveLength(4);
    const area = areaOf(rect);
    expect(area).toBeGreaterThan(49);
    expect(area).toBeLessThan(51);
  });

  it('creates a circle with radius 5m (~78 m²)', () => {
    const circle = createCircleAtCenter([24.9384, 60.1699], 5, 32);
    expect(circle).toHaveLength(32);
    const area = areaOf(circle);
    expect(area).toBeGreaterThan(75);
    expect(area).toBeLessThan(80);
  });

  it('snaps a nearby click to a visible parcel corner', () => {
    const corner: [number, number] = [24.9384, 60.1699];
    const nearClick: [number, number] = [24.938395, 60.169898]; // ~0.4 m outside corner
    const snapped = snapPointToFeatureCollection(
      nearClick,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  corner,
                  [24.939, 60.1699],
                  [24.939, 60.1704],
                  corner,
                ],
              ],
            },
          },
        ],
      },
      3
    );
    expect(snapped).toEqual(corner);
  });
});
