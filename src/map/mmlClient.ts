import { simplifyRingMeters } from '../engine/shapes';
import type { LngLat } from '../engine/types';
import { fetchWithTimeout, safeReadJson } from './http';
import { capVertices, stripClosingVertex } from './overpassClient';
import { IS_MML_ENABLED } from './providers';

interface GeoJsonFeatureCollection {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

function to2DRing(raw: unknown): LngLat[] | null {
  if (!Array.isArray(raw)) return null;
  const pts: LngLat[] = [];
  for (const item of raw) {
    if (
      Array.isArray(item) &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number' &&
      Number.isFinite(item[0]) &&
      Number.isFinite(item[1])
    ) {
      pts.push([item[0], item[1]]);
    }
  }
  const cleaned = stripClosingVertex(pts);
  return cleaned.length >= 3 ? cleaned : null;
}

function extractOuterRings(geometry?: {
  type: string;
  coordinates: unknown;
}): LngLat[][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const outer = to2DRing(geometry.coordinates[0]);
    return outer ? [outer] : [];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const rings: LngLat[][] = [];
    for (const poly of geometry.coordinates) {
      if (Array.isArray(poly)) {
        const outer = to2DRing(poly[0]);
        if (outer) rings.push(outer);
      }
    }
    return rings;
  }
  return [];
}

export async function fetchBuildingsFromMml(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<LngLat[][]> {
  if (!IS_MML_ENABLED) return [];
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const res = await fetchWithTimeout(
    `/api/mml-maasto/collections/rakennus/items?bbox=${minLng},${minLat},${maxLng},${maxLat}&limit=50`,
    {},
    6000,
    signal
  );
  if (!res.ok) return [];
  const data = await safeReadJson<GeoJsonFeatureCollection>(res);
  const rings: LngLat[][] = [];
  for (const feat of data?.features ?? []) {
    rings.push(...extractOuterRings(feat.geometry));
  }
  return rings;
}

export async function pickParcelFromMml(
  point: LngLat,
  pointInRingFn: (pt: LngLat, ring: LngLat[]) => boolean,
  signal?: AbortSignal
): Promise<{
  points: LngLat[];
  label: string;
  source: 'mml';
  isBuilding: false;
  parcelCode?: string;
} | null> {
  if (!IS_MML_ENABLED) return null;

  const delta = 0.00015;
  const bbox = `${point[0] - delta},${point[1] - delta},${point[0] + delta},${point[1] + delta}`;
  const res = await fetchWithTimeout(
    `/api/mml-features/collections/PalstanSijaintitiedot/items?bbox=${bbox}&limit=8`,
    {},
    6000,
    signal
  );
  if (!res.ok) return null;

  const data = await safeReadJson<GeoJsonFeatureCollection>(res);
  for (const feat of data?.features ?? []) {
    const rings = extractOuterRings(feat.geometry);
    const matchingRing = rings.find((ring) => pointInRingFn(point, ring));
    if (matchingRing) {
      const formattedCode =
        typeof feat.properties?.kiinteistotunnuksenEsitysmuoto === 'string'
          ? feat.properties.kiinteistotunnuksenEsitysmuoto
          : typeof feat.properties?.kiinteistotunnus === 'string'
            ? feat.properties.kiinteistotunnus
            : undefined;
      return {
        points: capVertices(simplifyRingMeters(matchingRing, 0.35), 80),
        label: formattedCode ? `${formattedCode} (MML)` : 'Kiinteistöpalsta (MML)',
        source: 'mml',
        isBuilding: false,
        parcelCode: formattedCode,
      };
    }
  }

  return null;
}

export async function pickBuildingFromMml(
  point: LngLat,
  pointInRingFn: (pt: LngLat, ring: LngLat[]) => boolean,
  signal?: AbortSignal
): Promise<{
  points: LngLat[];
  label: string;
  source: 'mml';
  isBuilding: true;
} | null> {
  if (!IS_MML_ENABLED) return null;
  const delta = 0.00025;
  const rings = await fetchBuildingsFromMml(
    [point[0] - delta, point[1] - delta, point[0] + delta, point[1] + delta],
    signal
  );
  for (const ring of rings) {
    if (pointInRingFn(point, ring)) {
      return {
        points: capVertices(ring, 50),
        label: 'Rakennus (MML)',
        source: 'mml',
        isBuilding: true,
      };
    }
  }
  return null;
}
