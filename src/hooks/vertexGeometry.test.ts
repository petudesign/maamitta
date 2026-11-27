import { describe, expect, it } from 'vitest';
import type { MeasurementGeometry } from '../engine/types';
import {
  deleteVertexInGeometry,
  insertVertexInGeometry,
  moveVertexInGeometry,
} from './vertexGeometry';

const baseGeom: MeasurementGeometry = {
  areaPoints: [
    [24.9, 60.1],
    [24.91, 60.1],
    [24.91, 60.11],
  ],
  cutouts: [
    [
      [24.902, 60.102],
      [24.905, 60.102],
      [24.905, 60.105],
    ],
  ],
  activeCutout: [],
  linePoints: [
    [24.9, 60.1],
    [24.92, 60.12],
  ],
};

describe('vertexGeometry reducers', () => {
  it('moves a vertex immutably', () => {
    const moved = moveVertexInGeometry(
      baseGeom,
      { collection: 'area', cutoutIndex: -1, vertexIndex: 1 },
      [24.915, 60.105]
    );
    expect(moved.areaPoints[1]).toEqual([24.915, 60.105]);
    expect(baseGeom.areaPoints[1]).toEqual([24.91, 60.1]);
  });

  it('inserts a vertex at the target index', () => {
    const inserted = insertVertexInGeometry(
      baseGeom,
      { collection: 'line', cutoutIndex: -1, vertexIndex: 1 },
      [24.91, 60.11]
    );
    expect(inserted.linePoints).toEqual([
      [24.9, 60.1],
      [24.91, 60.11],
      [24.92, 60.12],
    ]);
  });

  it('deletes a cutout entirely when it drops below 3 vertices', () => {
    const deleted = deleteVertexInGeometry(baseGeom, {
      collection: 'cutout',
      cutoutIndex: 0,
      vertexIndex: 0,
    });
    expect(deleted.cutouts).toHaveLength(0);
  });
});
