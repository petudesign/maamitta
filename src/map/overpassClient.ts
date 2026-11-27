import { computeRingAreaSqm } from '../engine/geometry';
import type { LngLat } from '../engine/types';
import { fetchWithTimeout, safeReadJson } from './http';

interface OverpassGeomNode {
  lon: number;
  lat: number;
}

interface OverpassMember {
  role?: string;
  geometry?: OverpassGeomNode[];
}

export interface OverpassElement {
  type: 'way' | 'relation';
  tags?: Record<string, string>;
  geometry?: OverpassGeomNode[];
  members?: OverpassMember[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export function stripClosingVertex(coords: LngLat[]): LngLat[] {
  if (coords.length < 4) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return coords.slice(0, -1);
  }
  return coords;
}

/** Keeps editable polygons snappy by capping excessive vertex density (e.g. huge forests). */
export function capVertices(ring: LngLat[], maxVertices = 80): LngLat[] {
  if (ring.length <= maxVertices) return ring;
  const step = ring.length / maxVertices;
  const reduced: LngLat[] = [];
  for (let i = 0; i < maxVertices; i++) {
    const pt = ring[Math.floor(i * step)];
    if (pt) reduced.push(pt);
  }
  return reduced;
}

/** Stitches outer way segments of an OSM multipolygon relation into a closed ring. */
function stitchRelationOuterRing(members: OverpassMember[]): LngLat[] | null {
  const outerSegments: LngLat[][] = members
    .filter(
      (m) =>
        (m.role === 'outer' || !m.role) && m.geometry && m.geometry.length >= 2
    )
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

/** Extracts an unclosed outer polygon ring from an Overpass way or relation element. */
export function extractOverpassRing(el: OverpassElement): LngLat[] | null {
  if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
    const raw: LngLat[] = el.geometry.map((g) => [g.lon, g.lat]);
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (first && last && first[0] === last[0] && first[1] === last[1]) {
      const ring = stripClosingVertex(raw);
      return ring.length >= 3 ? ring : null;
    }
    return null;
  }
  if (el.type === 'relation' && el.members) {
    return stitchRelationOuterRing(el.members);
  }
  return null;
}

export async function queryOverpassElements(
  query: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<
  | { ok: true; elements: OverpassElement[] }
  | { ok: false; reason: string }
> {
  let lastError = 'Karttapalvelu ei vastannut ajoissa.';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) {
      return { ok: false, reason: 'Haku keskeytettiin.' };
    }
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        timeoutMs,
        signal
      );
      if (res.ok) {
        const data = await safeReadJson<OverpassResponse>(res);
        if (data) {
          return { ok: true, elements: data.elements ?? [] };
        }
        lastError = 'OSM-karttapalvelu palautti virheellisen vastauksen.';
        continue;
      }
      lastError =
        res.status === 429 || res.status === 504
          ? 'OSM-karttapalvelu on hetkellisesti ruuhkautunut — yritä hetken päästä.'
          : `Karttapalvelu palautti virheen (${res.status}).`;
    } catch (err) {
      if (signal?.aborted) {
        return { ok: false, reason: 'Haku keskeytettiin.' };
      }
      lastError =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Haku aikakatkaistiin (6 s) — kokeile uudelleen tai piirrä käsin.'
          : 'Yhteys karttapalveluun epäonnistui.';
    }
  }

  return { ok: false, reason: lastError };
}

export function labelFromOsmTags(tags: Record<string, string>): string {
  if (tags.name) return `${tags.name} (OSM)`;
  if (tags.building) return 'Rakennus (OSM)';
  if (tags.amenity === 'parking') return 'Pysäköintialue (OSM)';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'Metsäalue (OSM)';
  if (tags.landuse === 'farmland' || tags.landuse === 'meadow') return 'Pelto / niitty (OSM)';
  if (tags.leisure) return `Alue: ${tags.leisure} (OSM)`;
  if (tags.landuse) return `Alue: ${tags.landuse} (OSM)`;
  return 'Alue (OSM)';
}

export function pickSmallestOsmCandidate<
  T extends { points: LngLat[]; areaSqm: number },
>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.areaSqm - b.areaSqm);
  return candidates[0] ?? null;
}

export { computeRingAreaSqm };
