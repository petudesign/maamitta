import { computeLineLengthM } from '../engine/geometry';
import type { LngLat } from '../engine/types';

export interface EdgeLabelPlacement {
  midLngLat: LngLat;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  distM: number;
}

export interface EdgeLabelOptions {
  project: (pt: LngLat) => { x: number; y: number };
  minDistM: number;
  minPxLen: number;
  outwardOffsetPx: number;
  collisionWidthPx: number;
  collisionHeightPx: number;
  maxLabels: number;
  placed: Array<{ x: number; y: number }>;
}

/**
 * Computes non-overlapping screen-space placements for edge length pills,
 * prioritizing the longest visible edges first.
 */
export function computeEdgeLabelPlacements(
  pts: LngLat[],
  closed: boolean,
  options: EdgeLabelOptions
): EdgeLabelPlacement[] {
  const edgeCount = closed
    ? pts.length >= 3
      ? pts.length
      : pts.length - 1
    : pts.length - 1;
  if (edgeCount <= 0) return [];

  let cx = 0;
  let cy = 0;
  if (closed && pts.length >= 3 && options.outwardOffsetPx > 0) {
    for (const p of pts) {
      const sp = options.project(p);
      cx += sp.x;
      cy += sp.y;
    }
    cx /= pts.length;
    cy /= pts.length;
  }

  const candidates: Array<EdgeLabelPlacement & { pxLen: number }> = [];
  for (let i = 0; i < edgeCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const distM = computeLineLengthM([a, b]);
    if (distM < options.minDistM) continue;

    const pa = options.project(a);
    const pb = options.project(b);
    const pxLen = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (pxLen < options.minPxLen) continue;

    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2;

    let offsetX = 0;
    let offsetY = 0;
    if (options.outwardOffsetPx > 0) {
      let nx = -(pb.y - pa.y) / pxLen;
      let ny = (pb.x - pa.x) / pxLen;
      if (closed && pts.length >= 3) {
        const dot = (midX - cx) * nx + (midY - cy) * ny;
        if (dot < 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      offsetX = Math.round(nx * options.outwardOffsetPx);
      offsetY = Math.round(ny * options.outwardOffsetPx);
    }

    candidates.push({
      midLngLat: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      x: midX + offsetX,
      y: midY + offsetY,
      offsetX,
      offsetY,
      pxLen,
      distM,
    });
  }

  candidates.sort((c1, c2) => c2.pxLen - c1.pxLen);

  const accepted: EdgeLabelPlacement[] = [];
  for (const c of candidates) {
    if (accepted.length >= options.maxLabels) break;
    const collides = options.placed.some(
      (p) =>
        Math.abs(p.x - c.x) < options.collisionWidthPx &&
        Math.abs(p.y - c.y) < options.collisionHeightPx
    );
    if (collides) continue;

    options.placed.push({ x: c.x, y: c.y });
    accepted.push({
      midLngLat: c.midLngLat,
      x: c.x,
      y: c.y,
      offsetX: c.offsetX,
      offsetY: c.offsetY,
      distM: c.distM,
    });
  }

  return accepted;
}
