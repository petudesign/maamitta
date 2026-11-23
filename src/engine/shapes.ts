import type { FeatureCollection } from 'geojson';
import type { LngLat } from './types';

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLng(latDeg: number): number {
  return METERS_PER_DEG_LAT * Math.max(0.1, Math.cos((latDeg * Math.PI) / 180));
}

function toLocalMeters(pt: LngLat, origin: LngLat): [number, number] {
  const kx = metersPerDegLng(origin[1]);
  return [(pt[0] - origin[0]) * kx, (pt[1] - origin[1]) * METERS_PER_DEG_LAT];
}

function fromLocalMeters(xy: [number, number], origin: LngLat): LngLat {
  const kx = metersPerDegLng(origin[1]);
  return [origin[0] + xy[0] / kx, origin[1] + xy[1] / METERS_PER_DEG_LAT];
}

/**
 * Converts a drawn centerline (driveway, path, trench) into a clean polygonal corridor
 * of exact width `widthM` meters using miter-clamped left/right rails.
 */
export function bufferLineToCorridor(
  linePoints: LngLat[],
  widthM: number
): LngLat[] {
  if (linePoints.length < 2 || !Number.isFinite(widthM) || widthM <= 0.1) {
    return [];
  }

  const origin = linePoints[0]!;
  const pts = linePoints.map((p) => toLocalMeters(p, origin));
  const halfW = widthM / 2;
  const maxMiter = halfW * 2.2;

  // Compute unit normals for each segment
  const normals: Array<[number, number]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      normals.push([0, 1]);
    } else {
      normals.push([-dy / len, dx / len]);
    }
  }

  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    let nx: number;
    let ny: number;
    let scale = halfW;

    if (i === 0) {
      [nx, ny] = normals[0]!;
    } else if (i === pts.length - 1) {
      [nx, ny] = normals[normals.length - 1]!;
    } else {
      const n1 = normals[i - 1]!;
      const n2 = normals[i]!;
      const mx = n1[0] + n2[0];
      const my = n1[1] + n2[1];
      const mLen = Math.hypot(mx, my);
      if (mLen < 1e-4) {
        [nx, ny] = n1;
      } else {
        nx = mx / mLen;
        ny = my / mLen;
        const dot = nx * n1[0] + ny * n1[1];
        scale = Math.min(maxMiter, halfW / Math.max(0.35, dot));
      }
    }

    left.push([p[0] + nx * scale, p[1] + ny * scale]);
    right.push([p[0] - nx * scale, p[1] - ny * scale]);
  }

  return [...left, ...right.reverse()].map((xy) => fromLocalMeters(xy, origin));
}

/**
 * Generates an exact 90-degree rectangle polygon centered at `center`.
 */
export function createRectangleAtCenter(
  center: LngLat,
  widthM: number,
  heightM: number
): LngLat[] {
  const hw = Math.max(0.5, widthM) / 2;
  const hh = Math.max(0.5, heightM) / 2;
  return [
    fromLocalMeters([-hw, hh], center),
    fromLocalMeters([hw, hh], center),
    fromLocalMeters([hw, -hh], center),
    fromLocalMeters([-hw, -hh], center),
  ];
}

/**
 * Generates a regular polygon approximation of a circle centered at `center`.
 */
export function createCircleAtCenter(
  center: LngLat,
  radiusM: number,
  segments = 24
): LngLat[] {
  const r = Math.max(0.5, radiusM);
  const count = Math.max(12, Math.min(48, Math.round(segments)));
  const ring: LngLat[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ring.push(
      fromLocalMeters([Math.cos(angle) * r, Math.sin(angle) * r], center)
    );
  }
  return ring;
}

function closestPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): { pt: [number, number]; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return { pt: a, dist: Math.hypot(p[0] - a[0], p[1] - a[1]) };
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return { pt: [cx, cy], dist: Math.hypot(p[0] - cx, p[1] - cy) };
}

export interface SnapResult {
  point: LngLat;
  snapped: boolean;
  kind: 'vertex' | 'edge' | null;
}

/**
 * Snaps a coordinate to the nearest vertex or edge of visible parcel polygons
 * within `maxDistM` meters (prioritizing corners slightly over edges).
 */
export function snapPointWithInfo(
  pt: LngLat,
  fc: FeatureCollection,
  maxDistM: number
): SnapResult {
  if (!fc.features.length || maxDistM <= 0) {
    return { point: pt, snapped: false, kind: null };
  }

  const pLocal: [number, number] = [0, 0];
  let bestDist = maxDistM;
  let bestSnap: LngLat | null = null;
  let bestKind: 'vertex' | 'edge' | null = null;

  const checkRing = (coords: number[][]) => {
    for (let i = 0; i < coords.length; i++) {
      const curr = coords[i];
      if (!curr || curr.length < 2) continue;
      const aLngLat: LngLat = [curr[0]!, curr[1]!];
      const a = toLocalMeters(aLngLat, pt);

      // Slight priority to exact parcel corners
      const vDist = Math.hypot(a[0], a[1]);
      if (vDist < bestDist) {
        bestDist = vDist * 0.85;
        bestSnap = aLngLat;
        bestKind = 'vertex';
      }

      const next = coords[i + 1];
      if (next && next.length >= 2) {
        const b = toLocalMeters([next[0]!, next[1]!], pt);
        const seg = closestPointOnSegment(pLocal, a, b);
        if (seg.dist < bestDist) {
          bestDist = seg.dist;
          bestSnap = fromLocalMeters(seg.pt, pt);
          bestKind = 'edge';
        }
      }
    }
  };

  for (const f of fc.features) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) checkRing(ring);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) checkRing(ring);
      }
    } else if (geom.type === 'LineString') {
      checkRing(geom.coordinates);
    }
  }

  if (bestSnap) {
    return { point: bestSnap, snapped: true, kind: bestKind };
  }
  return { point: pt, snapped: false, kind: null };
}

export function snapPointToFeatureCollection(
  pt: LngLat,
  fc: FeatureCollection,
  maxDistM: number
): LngLat {
  return snapPointWithInfo(pt, fc, maxDistM).point;
}

function dpSimplifyOpen(
  pts: Array<[number, number]>,
  start: number,
  end: number,
  tolM: number,
  keep: Uint8Array
) {
  if (end - start <= 1) return;
  const a = pts[start]!;
  const b = pts[end]!;
  let maxDist = -1;
  let maxIdx = -1;
  for (let i = start + 1; i < end; i++) {
    const d = closestPointOnSegment(pts[i]!, a, b).dist;
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tolM && maxIdx !== -1) {
    keep[maxIdx] = 1;
    dpSimplifyOpen(pts, start, maxIdx, tolM, keep);
    dpSimplifyOpen(pts, maxIdx, end, tolM, keep);
  }
}

/**
 * Simplifies an open-list polygon ring (without duplicate closing vertex) using
 * metric Douglas–Peucker so dense road-curve vertices from MML collapse into
 * a few clean editable handles while preserving sharp parcel corners.
 */
export function simplifyRingMeters(ring: LngLat[], toleranceM = 0.35): LngLat[] {
  if (ring.length <= 4 || toleranceM <= 0) return ring;
  const origin = ring[0]!;
  const local = ring.map((pt) => toLocalMeters(pt, origin));

  // Split the closed ring at vertex 0 and its farthest vertex so true corners stay anchored
  let farIdx = 1;
  let farDist = -1;
  for (let i = 1; i < local.length; i++) {
    const d = Math.hypot(local[i]![0], local[i]![1]);
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  }

  const keep = new Uint8Array(local.length);
  keep[0] = 1;
  keep[farIdx] = 1;

  // First half: 0 .. farIdx
  dpSimplifyOpen(local, 0, farIdx, toleranceM, keep);

  // Second half: farIdx .. n-1 .. 0 (closed wrap)
  const wrapped = [...local.slice(farIdx), local[0]!];
  const keepWrap = new Uint8Array(wrapped.length);
  keepWrap[0] = 1;
  keepWrap[wrapped.length - 1] = 1;
  dpSimplifyOpen(wrapped, 0, wrapped.length - 1, toleranceM, keepWrap);
  for (let i = 1; i < wrapped.length - 1; i++) {
    if (keepWrap[i]) keep[farIdx + i] = 1;
  }

  const simplified: LngLat[] = [];
  for (let i = 0; i < ring.length; i++) {
    if (keep[i]) simplified.push(ring[i]!);
  }
  return simplified.length >= 3 ? simplified : ring;
}
