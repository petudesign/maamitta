import type { LngLat, MeasurementGeometry } from '../engine/types';
import type { VertexRef } from '../map/measurementLayers';

export function moveVertexInGeometry(
  prev: MeasurementGeometry,
  target: VertexRef,
  nextPoint: LngLat
): MeasurementGeometry {
  if (target.collection === 'area') {
    const next = [...prev.areaPoints];
    if (target.vertexIndex >= 0 && target.vertexIndex < next.length) {
      next[target.vertexIndex] = nextPoint;
    }
    return { ...prev, areaPoints: next };
  }
  if (target.collection === 'activeCutout') {
    const next = [...prev.activeCutout];
    if (target.vertexIndex >= 0 && target.vertexIndex < next.length) {
      next[target.vertexIndex] = nextPoint;
    }
    return { ...prev, activeCutout: next };
  }
  if (target.collection === 'cutout') {
    const nextCutouts = prev.cutouts.map((ring, idx) => {
      if (idx !== target.cutoutIndex) return ring;
      const next = [...ring];
      if (target.vertexIndex >= 0 && target.vertexIndex < next.length) {
        next[target.vertexIndex] = nextPoint;
      }
      return next;
    });
    return { ...prev, cutouts: nextCutouts };
  }
  const next = [...prev.linePoints];
  if (target.vertexIndex >= 0 && target.vertexIndex < next.length) {
    next[target.vertexIndex] = nextPoint;
  }
  return { ...prev, linePoints: next };
}

export function insertVertexInGeometry(
  prev: MeasurementGeometry,
  target: VertexRef,
  point: LngLat
): MeasurementGeometry {
  if (target.collection === 'area') {
    const next = [...prev.areaPoints];
    next.splice(target.vertexIndex, 0, point);
    return { ...prev, areaPoints: next };
  }
  if (target.collection === 'activeCutout') {
    const next = [...prev.activeCutout];
    next.splice(target.vertexIndex, 0, point);
    return { ...prev, activeCutout: next };
  }
  if (target.collection === 'cutout') {
    const nextCutouts = prev.cutouts.map((ring, idx) => {
      if (idx !== target.cutoutIndex) return ring;
      const next = [...ring];
      next.splice(target.vertexIndex, 0, point);
      return next;
    });
    return { ...prev, cutouts: nextCutouts };
  }
  const next = [...prev.linePoints];
  next.splice(target.vertexIndex, 0, point);
  return { ...prev, linePoints: next };
}

export function deleteVertexInGeometry(
  prev: MeasurementGeometry,
  target: VertexRef
): MeasurementGeometry {
  if (target.collection === 'area') {
    return {
      ...prev,
      areaPoints: prev.areaPoints.filter((_, i) => i !== target.vertexIndex),
    };
  }
  if (target.collection === 'activeCutout') {
    return {
      ...prev,
      activeCutout: prev.activeCutout.filter(
        (_, i) => i !== target.vertexIndex
      ),
    };
  }
  if (target.collection === 'cutout') {
    const nextCutouts = prev.cutouts
      .map((ring, idx) =>
        idx === target.cutoutIndex
          ? ring.filter((_, i) => i !== target.vertexIndex)
          : ring
      )
      .filter((ring) => ring.length >= 3);
    return { ...prev, cutouts: nextCutouts };
  }
  return {
    ...prev,
    linePoints: prev.linePoints.filter((_, i) => i !== target.vertexIndex),
  };
}
