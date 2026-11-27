import turfArea from '@turf/area';
import turfDifference from '@turf/difference';
import { featureCollection, polygon } from '@turf/helpers';
import {
  computeBounds,
  computeCentroid,
  computeRingAreaSqm,
  toClosedRing,
} from '../engine/geometry';
import type { LngLat } from '../engine/types';
import {
  fetchBuildingsFromMml,
  pickBuildingFromMml,
  pickParcelFromMml,
} from './mmlClient';
import {
  capVertices,
  extractOverpassRing,
  labelFromOsmTags,
  pickSmallestOsmCandidate,
  queryOverpassElements,
} from './overpassClient';
import { IS_MML_ENABLED } from './providers';

interface PickedBoundary {
  points: LngLat[];
  label: string;
  source: 'mml' | 'osm';
  isBuilding: boolean;
  parcelCode?: string;
}

type PickOutcome =
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

async function pickFromOsmOverpass(
  point: LngLat,
  signal?: AbortSignal
): Promise<PickOutcome> {
  const [lng, lat] = point;
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

  const result = await queryOverpassElements(query, 6500, signal);
  if (!result.ok) {
    return { status: 'error', reason: result.reason };
  }

  const candidates: Array<PickedBoundary & { areaSqm: number }> = [];
  for (const el of result.elements) {
    const ring = extractOverpassRing(el);
    if (!ring || !pointInRing(point, ring)) continue;

    const areaSqm = computeRingAreaSqm(ring);
    if (areaSqm < 5) continue;

    const tags = el.tags ?? {};
    candidates.push({
      points: capVertices(ring, 80),
      label: labelFromOsmTags(tags),
      source: 'osm',
      isBuilding: Boolean(tags.building),
      areaSqm,
    });
  }

  const best = pickSmallestOsmCandidate(candidates);
  if (!best) {
    return { status: 'not_found' };
  }

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
        const bldg = await pickBuildingFromMml(point, pointInRing, signal);
        if (bldg) return { status: 'found', boundary: bldg };
      } else {
        const mml = await pickParcelFromMml(point, pointInRing, signal);
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

  const bounds = computeBounds(areaPoints);
  if (!bounds) return [];
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;

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
  } else {
    const query = `[out:json][timeout:6];
(
  way["building"](${minLat},${minLng},${maxLat},${maxLng});
  relation["building"](${minLat},${minLng},${maxLat},${maxLng});
);
out geom;`;

    const result = await queryOverpassElements(query, 6000, signal);
    if (result.ok) {
      for (const el of result.elements) {
        const ring = extractOverpassRing(el);
        if (ring) candidateRings.push(ring);
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

    // Include a building if at least 6 m² sits inside the measured parcel.
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
      const centroid = computeCentroid(ring);
      if (centroid && pointInRing(centroid, areaPoints)) {
        buildings.push(capVertices(ring, 50));
      }
    }
  }

  return buildings;
}
