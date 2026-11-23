import turfArea from '@turf/area';
import turfDifference from '@turf/difference';
import { featureCollection, polygon } from '@turf/helpers';
import { computeRingAreaSqm, toClosedRing } from '../engine/geometry';
import { simplifyRingMeters } from '../engine/shapes';
import type { LngLat } from '../engine/types';
import { IS_MML_ENABLED } from './providers';

export interface PickedBoundary {
  points: LngLat[];
  label: string;
  source: 'mml' | 'osm';
  isBuilding: boolean;
  parcelCode?: string;
}

export type PickOutcome =
  | { status: 'found'; boundary: PickedBoundary }
  | { status: 'not_found' }
  | { status: 'error'; reason: string };

/** Ray-casting point-in-polygon check (WGS84). */
export function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (
      xi === undefined ||
      yi === undefined ||
      xj === undefined ||
      yj === undefined
    ) {
      continue;
    }
    const intersects =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function stripClosingVertex(coords: LngLat[]): LngLat[] {
  if (coords.length < 4) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return coords.slice(0, -1);
  }
  return coords;
}

/** Keeps editable polygons snappy by capping excessive vertex density (e.g. huge forests). */
function capVertices(ring: LngLat[], maxVertices = 80): LngLat[] {
  if (ring.length <= maxVertices) return ring;
  const step = ring.length / maxVertices;
  const reduced: LngLat[] = [];
  for (let i = 0; i < maxVertices; i++) {
    const pt = ring[Math.floor(i * step)];
    if (pt) reduced.push(pt);
  }
  return reduced;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

interface GeoJsonFeatureCollection {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

async function pickFromMmlParcels(
  point: LngLat,
  signal?: AbortSignal
): Promise<PickedBoundary | null> {
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

  const data = (await res.json()) as GeoJsonFeatureCollection;
  const features = data.features ?? [];

  for (const feat of features) {
    if (!feat.geometry) continue;
    let outerRing: LngLat[] | null = null;
    if (feat.geometry.type === 'Polygon') {
      const rings = feat.geometry.coordinates as LngLat[][];
      outerRing = rings[0] ? stripClosingVertex(rings[0]) : null;
    } else if (feat.geometry.type === 'MultiPolygon') {
      const polys = feat.geometry.coordinates as LngLat[][][];
      for (const poly of polys) {
        const candidate = poly[0] ? stripClosingVertex(poly[0]) : null;
        if (candidate && pointInRing(point, candidate)) {
          outerRing = candidate;
          break;
        }
      }
    }

    if (outerRing && outerRing.length >= 3 && pointInRing(point, outerRing)) {
      const formattedCode =
        typeof feat.properties?.kiinteistotunnuksenEsitysmuoto === 'string'
          ? feat.properties.kiinteistotunnuksenEsitysmuoto
          : typeof feat.properties?.kiinteistotunnus === 'string'
            ? feat.properties.kiinteistotunnus
            : undefined;
      return {
        points: capVertices(simplifyRingMeters(outerRing, 0.35), 80),
        label: formattedCode ? `${formattedCode} (MML)` : 'Kiinteistöpalsta (MML)',
        source: 'mml',
        isBuilding: false,
        parcelCode: formattedCode,
      };
    }
  }

  return null;
}

interface OverpassGeomNode {
  lon: number;
  lat: number;
}

interface OverpassMember {
  role?: string;
  geometry?: OverpassGeomNode[];
}

interface OverpassElement {
  type: 'way' | 'relation';
  tags?: Record<string, string>;
  geometry?: OverpassGeomNode[];
  members?: OverpassMember[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/** Stitches outer way segments of an OSM multipolygon relation into a closed ring. */
function stitchRelationOuterRing(members: OverpassMember[]): LngLat[] | null {
  const outerSegments: LngLat[][] = members
    .filter((m) => (m.role === 'outer' || !m.role) && m.geometry && m.geometry.length >= 2)
    .map((m) => m.geometry!.map((g): LngLat => [g.lon, g.lat]));

  if (outerSegments.length === 0) return null;

  const ring: LngLat[] = [...outerSegments[0]!];
  const remaining = outerSegments.slice(1);

  let guard = remaining.length * 2 + 2;
  while (remaining.length > 0 && guard-- > 0) {
    const tail = ring[ring.length - 1];
    if (!tail) break;
    const idx = remaining.findIndex((seg) => {
      const s = seg[0];
      const e = seg[seg.length - 1];
      return (
        (s && s[0] === tail[0] && s[1] === tail[1]) ||
        (e && e[0] === tail[0] && e[1] === tail[1])
      );
    });
    if (idx === -1) break;
    const seg = remaining.splice(idx, 1)[0]!;
    const first = seg[0];
    if (first && first[0] === tail[0] && first[1] === tail[1]) {
      ring.push(...seg.slice(1));
    } else {
      ring.push(...[...seg].reverse().slice(1));
    }
  }

  const cleaned = stripClosingVertex(ring);
  return cleaned.length >= 3 ? cleaned : null;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function labelFromTags(tags: Record<string, string>): string {
  if (tags.name) return `${tags.name} (OSM)`;
  if (tags.building) return 'Rakennus (OSM)';
  if (tags.amenity === 'parking') return 'Pysäköintialue (OSM)';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'Metsäalue (OSM)';
  if (tags.landuse === 'farmland' || tags.landuse === 'meadow') return 'Pelto / niitty (OSM)';
  if (tags.leisure) return `Alue: ${tags.leisure} (OSM)`;
  if (tags.landuse) return `Alue: ${tags.landuse} (OSM)`;
  return 'Alue (OSM)';
}

async function pickFromOsmOverpass(
  point: LngLat,
  signal?: AbortSignal
): Promise<PickOutcome> {
  const [lng, lat] = point;

  // Fast point-based query: checks buildings (both ways and multipolygon relations)
  // plus enclosing landuse/forest/parking areas containing this exact point.
  const query = `[out:json][timeout:6];
is_in(${lat},${lng})->.a;
(
  way(pivot.a)["building"];
  relation(pivot.a)["building"];
  way(pivot.a)["amenity"="parking"];
  way(pivot.a)["leisure"];
  way(pivot.a)["landuse"~"^(forest|meadow|farmland|grass|residential|industrial|commercial|retail|allotments)$"];
  way(pivot.a)["natural"~"^(wood|grassland|heath|scrub)$"];
  way(around:12,${lat},${lng})["building"];
);
out geom;`;

  let response: Response | null = null;
  let lastError = 'Karttapalvelu ei vastannut ajoissa.';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) {
      return { status: 'error', reason: 'Haku keskeytettiin.' };
    }
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        6500,
        signal
      );
      if (res.ok) {
        response = res;
        break;
      }
      lastError =
        res.status === 429 || res.status === 504
          ? 'OSM-karttapalvelu on hetkellisesti ruuhkautunut — yritä hetken päästä.'
          : `Karttapalvelu palautti virheen (${res.status}).`;
    } catch (err) {
      if (signal?.aborted) {
        return { status: 'error', reason: 'Haku keskeytettiin.' };
      }
      lastError =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Haku aikakatkaistiin (6 s) — kokeile uudelleen tai piirrä käsin.'
          : 'Yhteys karttapalveluun epäonnistui.';
    }
  }

  if (!response) {
    return { status: 'error', reason: lastError };
  }

  const data = (await response.json()) as OverpassResponse;
  const elements = data.elements ?? [];
  const candidates: Array<PickedBoundary & { areaSqm: number }> = [];

  for (const el of elements) {
    let ring: LngLat[] | null = null;

    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const raw: LngLat[] = el.geometry.map((g) => [g.lon, g.lat]);
      const first = raw[0];
      const last = raw[raw.length - 1];
      if (first && last && first[0] === last[0] && first[1] === last[1]) {
        ring = stripClosingVertex(raw);
      }
    } else if (el.type === 'relation' && el.members) {
      ring = stitchRelationOuterRing(el.members);
    }

    if (!ring || ring.length < 3) continue;
    if (!pointInRing(point, ring)) continue;

    const areaSqm = computeRingAreaSqm(ring);
    if (areaSqm < 5) continue;

    const tags = el.tags ?? {};
    candidates.push({
      points: capVertices(ring, 80),
      label: labelFromTags(tags),
      source: 'osm',
      isBuilding: Boolean(tags.building),
      areaSqm,
    });
  }

  if (candidates.length === 0) {
    return { status: 'not_found' };
  }

  // Pick the tightest containing polygon (building over block, small clearing over huge forest)
  candidates.sort((a, b) => a.areaSqm - b.areaSqm);
  const best = candidates[0]!;
  return {
    status: 'found',
    boundary: {
      points: best.points,
      label: best.label,
      source: best.source,
      isBuilding: best.isBuilding,
    },
  };
}

function to2DRing(raw: unknown): LngLat[] | null {
  if (!Array.isArray(raw)) return null;
  const pts: LngLat[] = [];
  for (const item of raw) {
    if (
      Array.isArray(item) &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number'
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

async function fetchBuildingsFromMml(
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
  const data = (await res.json()) as GeoJsonFeatureCollection;
  const rings: LngLat[][] = [];
  for (const feat of data.features ?? []) {
    rings.push(...extractOuterRings(feat.geometry));
  }
  return rings;
}

async function pickBuildingFromMml(
  point: LngLat,
  signal?: AbortSignal
): Promise<PickedBoundary | null> {
  if (!IS_MML_ENABLED) return null;
  const delta = 0.00025;
  const rings = await fetchBuildingsFromMml(
    [point[0] - delta, point[1] - delta, point[0] + delta, point[1] + delta],
    signal
  );
  for (const ring of rings) {
    if (pointInRing(point, ring)) {
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

/**
 * Automatically fetches a real polygon boundary at the clicked point.
 * Uses official MML parcels & buildings when MML_API_KEY is enabled, and OpenStreetMap
 * Overpass (ways + multipolygon relations) as a zero-key global fallback.
 */
export async function pickBoundaryAtPoint(
  point: LngLat,
  preferBuilding: boolean,
  signal?: AbortSignal
): Promise<PickOutcome> {
  if (IS_MML_ENABLED) {
    try {
      if (preferBuilding) {
        const bldg = await pickBuildingFromMml(point, signal);
        if (bldg) return { status: 'found', boundary: bldg };
      } else {
        const mml = await pickFromMmlParcels(point, signal);
        if (mml) return { status: 'found', boundary: mml };
      }
    } catch {
      // Fall through to OSM
    }
  }

  return pickFromOsmOverpass(point, signal);
}

/**
 * Fetches all building footprints intersecting a given polygon (e.g. a picked parcel or drawn yard)
 * so houses, garages, and sheds can be automatically subtracted from net yard area.
 * Uses official MML Maastotietokanta buildings when MML_API_KEY is enabled (fast & 100% coverage in Finland).
 */
export async function fetchBuildingsInPolygon(
  areaPoints: LngLat[],
  signal?: AbortSignal
): Promise<LngLat[][]> {
  if (areaPoints.length < 3) return [];

  // Skip auto-fetching on huge rural forest/farm parcels (> 5 ha) to keep it fast
  if (computeRingAreaSqm(areaPoints) > 50_000) return [];

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of areaPoints) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  let candidateRings: LngLat[][] = [];

  if (IS_MML_ENABLED) {
    try {
      candidateRings = await fetchBuildingsFromMml(
        [minLng, minLat, maxLng, maxLat],
        signal
      );
    } catch {
      if (signal?.aborted) return [];
    }
  }

  // Fallback to OSM Overpass only if MML is not enabled
  if (!IS_MML_ENABLED) {
    const query = `[out:json][timeout:6];
(
  way["building"](${minLat},${minLng},${maxLat},${maxLng});
  relation["building"](${minLat},${minLng},${maxLat},${maxLng});
);
out geom;`;

    let response: Response | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (signal?.aborted) return [];
      try {
        const res = await fetchWithTimeout(
          endpoint,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
          },
          6000,
          signal
        );
        if (res.ok) {
          response = res;
          break;
        }
      } catch {
        if (signal?.aborted) return [];
      }
    }

    if (response) {
      const data = (await response.json()) as OverpassResponse;
      for (const el of data.elements ?? []) {
        if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
          const raw: LngLat[] = el.geometry.map((g) => [g.lon, g.lat]);
          const first = raw[0];
          const last = raw[raw.length - 1];
          if (first && last && first[0] === last[0] && first[1] === last[1]) {
            const ring = stripClosingVertex(raw);
            if (ring.length >= 3) candidateRings.push(ring);
          }
        } else if (el.type === 'relation' && el.members) {
          const ring = stitchRelationOuterRing(el.members);
          if (ring) candidateRings.push(ring);
        }
      }
    }
  }

  const buildings: LngLat[][] = [];
  const parcelRing = toClosedRing(areaPoints);
  if (!parcelRing) return [];

  const parcelPoly = polygon([parcelRing]);
  const parcelArea = turfArea(parcelPoly);

  for (const ring of candidateRings) {
    const bldgRing = toClosedRing(ring);
    if (!bldgRing) continue;

    // Exact geometric overlap: include a building if at least 6 m² of it actually
    // sits inside the measured parcel. This cleanly excludes wall-to-wall neighbors
    // touching only the border (~0 m² overlap) while catching L/C-shaped and
    // multi-lot buildings whose centroid may fall outside the parcel.
    try {
      const remaining = turfDifference(
        featureCollection([parcelPoly, polygon([bldgRing])])
      );
      const remainingArea = remaining ? turfArea(remaining) : 0;
      const overlapSqm = parcelArea - remainingArea;
      if (overlapSqm >= 6) {
        buildings.push(capVertices(ring, 50));
      }
    } catch {
      // Fallback for invalid/self-intersecting geometries
      let cx = 0;
      let cy = 0;
      for (const [x, y] of ring) {
        cx += x;
        cy += y;
      }
      if (pointInRing([cx / ring.length, cy / ring.length], areaPoints)) {
        buildings.push(capVertices(ring, 50));
      }
    }
  }

  return buildings;
}
