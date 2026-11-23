import turfArea from '@turf/area';
import turfDifference from '@turf/difference';
import { featureCollection, lineString, polygon } from '@turf/helpers';
import turfLength from '@turf/length';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { getMessages, type Locale } from '../i18n';
import type {
  AccuracyMeta,
  GeometrySource,
  LngLat,
  MeasurementGeometry,
  MeasurementSummary,
} from './types';

/** Closes a ring if it has at least 3 distinct vertices. */
export function toClosedRing(points: LngLat[]): LngLat[] | null {
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  if (first[0] === last[0] && first[1] === last[1]) {
    return points.length >= 4 ? points : null;
  }
  return [...points, first];
}

/** Computes geodesic area (m²) of an unclosed polygon ring. */
export function computeRingAreaSqm(points: LngLat[]): number {
  const ring = toClosedRing(points);
  if (!ring) return 0;
  try {
    return turfArea(polygon([ring]));
  } catch {
    return 0;
  }
}

/** Computes geodesic perimeter (m) of an unclosed polygon ring. */
export function computeRingPerimeterM(points: LngLat[]): number {
  const ring = toClosedRing(points);
  if (!ring) return 0;
  try {
    return turfLength(lineString(ring), { units: 'meters' });
  } catch {
    return 0;
  }
}

/** Computes geodesic length (m) of a polyline. */
export function computeLineLengthM(points: LngLat[]): number {
  if (points.length < 2) return 0;
  try {
    return turfLength(lineString(points), { units: 'meters' });
  } catch {
    return 0;
  }
}

/**
 * Computes 3D surface area multiplier from terrain slope percentage.
 * Example: 20 % slope -> sqrt(1 + 0.20^2) ≈ 1.0198 (+2.0 % surface area).
 */
export function computeSlopeFactor(slopePct: number): number {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(slopePct) ? slopePct : 0));
  const ratio = clamped / 100;
  return Math.sqrt(1 + ratio * ratio);
}

/** Returns user-facing accuracy metadata based on the geometry data source. */
export function getAccuracyMeta(
  source: GeometrySource,
  locale: Locale = 'fi'
): AccuracyMeta {
  const msg = getMessages(locale).accuracy;
  switch (source) {
    case 'mml':
      return {
        source: 'mml',
        label: msg.mml,
        marginPct: 2,
      };
    case 'osm':
      return {
        source: 'osm',
        label: msg.osm,
        marginPct: 3,
      };
    default:
      return {
        source: 'manual',
        label: msg.manual,
        marginPct: 4,
      };
  }
}

/**
 * Computes net area after subtracting overlapping cutouts from the primary polygon,
 * plus optional 3D slope surface correction.
 */
export function summarizeGeometry(
  geometry: MeasurementGeometry,
  slopePct = 0
): MeasurementSummary {
  const mainRing = toClosedRing(geometry.areaPoints);
  const grossAreaSqm = mainRing ? computeRingAreaSqm(geometry.areaPoints) : 0;
  const perimeterM = mainRing ? computeRingPerimeterM(geometry.areaPoints) : 0;
  const lineLengthM = computeLineLengthM(geometry.linePoints);

  let netAreaSqm = grossAreaSqm;

  if (mainRing && grossAreaSqm > 0) {
    const allCutouts = [...geometry.cutouts, geometry.activeCutout].filter(
      (c) => c.length >= 3
    );

    let current: Feature<Polygon | MultiPolygon> | null = polygon([mainRing]);
    let runningArea = grossAreaSqm;
    let hadFallback = false;

    for (const cutoutPoints of allCutouts) {
      const cutoutRing = toClosedRing(cutoutPoints);
      if (!cutoutRing) continue;

      if (current) {
        try {
          const diff = turfDifference(
            featureCollection([current, polygon([cutoutRing])])
          );
          current = diff;
          runningArea = diff ? turfArea(diff) : 0;
          if (!diff) break;
          continue;
        } catch {
          hadFallback = true;
          current = null;
        }
      }

      // Fallback if an earlier cutout was self-intersecting: subtract safely from runningArea
      const fallbackCut = computeRingAreaSqm(cutoutPoints);
      runningArea = Math.max(0, runningArea - fallbackCut);
    }

    netAreaSqm = hadFallback || !current ? runningArea : turfArea(current);
  }

  const cutoutAreaSqm = Math.max(0, grossAreaSqm - netAreaSqm);
  const safeSlopePct = Math.max(0, Math.min(100, Number.isFinite(slopePct) ? slopePct : 0));
  const slopeFactor = computeSlopeFactor(safeSlopePct);
  const effectiveAreaSqm = netAreaSqm * slopeFactor;

  return {
    grossAreaSqm,
    cutoutAreaSqm,
    netAreaSqm,
    effectiveAreaSqm,
    netAreaHa: effectiveAreaSqm / 10_000,
    perimeterM,
    lineLengthM,
    slopePct: safeSlopePct,
    slopeFactor,
  };
}
