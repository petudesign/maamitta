import { computeCentroid, computeLineLengthM } from '../engine/geometry';
import type { LngLat } from '../engine/types';
import type { Locale } from '../i18n/types';
import { fetchWithTimeout, safeReadJson } from './http';

export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface ElevationSummary {
  minM: number;
  maxM: number;
  dropM: number;
  estimatedSlopePct: number;
  slopeDirection: CompassDirection;
}

const DIRECTION_LABELS_FI: Record<CompassDirection, string> = {
  N: 'pohjoiseen',
  NE: 'koilliseen',
  E: 'itään',
  SE: 'kaakkoon',
  S: 'etelään',
  SW: 'lounaaseen',
  W: 'länteen',
  NW: 'luoteeseen',
};

export function formatSlopeDirection(
  dir: CompassDirection,
  locale: Locale
): string {
  return locale === 'en' ? `slopes ${dir}` : `laskee ${DIRECTION_LABELS_FI[dir]}`;
}

function bearingToCompass(from: LngLat, to: LngLat): CompassDirection {
  const dx = (to[0] - from[0]) * Math.cos((((from[1] + to[1]) / 2) * Math.PI) / 180);
  const dy = to[1] - from[1];
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const dirs: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8]!;
}

interface OpenMeteoElevationResponse {
  elevation?: number[];
}

/**
 * Samples terrain elevation across a measured polygon (corners + centroid)
 * via the Copernicus/Nordic DEM endpoint on Open-Meteo (zero-key, fast, CORS-enabled)
 * and estimates average terrain slope percentage for 3D area correction.
 */
export async function estimateTerrainSlope(
  areaPoints: LngLat[],
  externalSignal?: AbortSignal
): Promise<ElevationSummary | null> {
  if (areaPoints.length < 3) return null;

  // Sample up to 8 evenly spaced boundary vertices + centroid
  const samplePts: LngLat[] = [];
  const step = Math.max(1, Math.floor(areaPoints.length / 8));
  for (let i = 0; i < areaPoints.length && samplePts.length < 8; i += step) {
    const pt = areaPoints[i];
    if (pt) samplePts.push(pt);
  }

  const centroid = computeCentroid(areaPoints);
  if (centroid) samplePts.push(centroid);

  const lats = samplePts.map((p) => p[1].toFixed(6)).join(',');
  const lngs = samplePts.map((p) => p[0].toFixed(6)).join(',');

  try {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
      {},
      5000,
      externalSignal
    );
    if (!res.ok) return null;
    const data = await safeReadJson<OpenMeteoElevationResponse>(res);
    const rawElevations = data?.elevation ?? [];

    // Pair elevation with its exact coordinate BEFORE filtering non-finite values
    const pairs: Array<{ elev: number; pt: LngLat }> = [];
    for (let i = 0; i < samplePts.length; i++) {
      const elev = rawElevations[i];
      const pt = samplePts[i];
      if (typeof elev === 'number' && Number.isFinite(elev) && pt) {
        pairs.push({ elev, pt });
      }
    }
    if (pairs.length < 2) return null;

    let minPair = pairs[0]!;
    let maxPair = pairs[0]!;
    for (let i = 1; i < pairs.length; i++) {
      const curr = pairs[i]!;
      if (curr.elev < minPair.elev) minPair = curr;
      if (curr.elev > maxPair.elev) maxPair = curr;
    }

    const dropM = Math.max(0, maxPair.elev - minPair.elev);
    const spanM = Math.max(5, computeLineLengthM([minPair.pt, maxPair.pt]));
    const rawSlopePct = Math.round((dropM / spanM) * 100);
    const estimatedSlopePct = Math.max(0, Math.min(45, rawSlopePct));

    return {
      minM: minPair.elev,
      maxM: maxPair.elev,
      dropM,
      estimatedSlopePct,
      slopeDirection: bearingToCompass(maxPair.pt, minPair.pt),
    };
  } catch {
    return null;
  }
}
