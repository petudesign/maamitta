import type { Feature, FeatureCollection } from 'geojson';
import { toClosedRing } from '../engine/geometry';
import type { MeasurementGeometry, QuoteZoneItem } from '../engine/types';

export interface GeoExportPayload {
  projectTitle: string;
  parcelCode: string | null;
  geometry: MeasurementGeometry;
  quoteItems: QuoteZoneItem[];
}

export function buildGeoJsonExport(
  payload: GeoExportPayload
): FeatureCollection {
  const features: Feature[] = [];

  const pushGeometry = (
    geom: MeasurementGeometry,
    props: Record<string, string | number | null>
  ) => {
    const outer = toClosedRing(geom.areaPoints);
    if (outer) {
      const holes = geom.cutouts
        .map((c) => toClosedRing(c))
        .filter((r): r is [number, number][] => Boolean(r));
      features.push({
        type: 'Feature',
        properties: { ...props, kind: 'area' },
        geometry: {
          type: 'Polygon',
          coordinates: [outer, ...holes],
        },
      });
    }
    if (geom.linePoints.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { ...props, kind: 'line' },
        geometry: {
          type: 'LineString',
          coordinates: geom.linePoints,
        },
      });
    }
  };

  pushGeometry(payload.geometry, {
    name: payload.parcelCode || payload.projectTitle || 'Maamitta',
    parcelCode: payload.parcelCode,
  });

  for (const item of payload.quoteItems) {
    pushGeometry(item.geometry, {
      name: item.label,
      preset: item.presetName,
      basisValue: item.basisValue,
      basisUnit: item.basisUnit,
      totalEur: Number(item.totalEur.toFixed(2)),
    });
  }

  return { type: 'FeatureCollection', features };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function ringToKmlCoords(ring: number[][]): string {
  return ring.map((c) => `${c[0]},${c[1]},0`).join(' ');
}

export function buildKmlExport(payload: GeoExportPayload): string {
  const fc = buildGeoJsonExport(payload);
  const placemarks: string[] = [];

  for (const f of fc.features) {
    const name = escapeXml(String(f.properties?.name ?? 'Maamitta'));
    if (f.geometry.type === 'Polygon') {
      const outer = f.geometry.coordinates[0];
      if (!outer) continue;
      const inners = f.geometry.coordinates
        .slice(1)
        .map(
          (hole) =>
            `<innerBoundaryIs><LinearRing><coordinates>${ringToKmlCoords(hole)}</coordinates></LinearRing></innerBoundaryIs>`
        )
        .join('');
      placemarks.push(
        `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${ringToKmlCoords(outer)}</coordinates></LinearRing></outerBoundaryIs>${inners}</Polygon></Placemark>`
      );
    } else if (f.geometry.type === 'LineString') {
      placemarks.push(
        `<Placemark><name>${name}</name><LineString><coordinates>${ringToKmlCoords(f.geometry.coordinates)}</coordinates></LineString></Placemark>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(payload.projectTitle || 'Maamitta')}</name>${placemarks.join('')}</Document></kml>`;
}

function triggerFileDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGeoJson(payload: GeoExportPayload): void {
  const fc = buildGeoJsonExport(payload);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(
    JSON.stringify(fc, null, 2),
    `maamitta-${dateStr}.geojson`,
    'application/geo+json'
  );
}

export function downloadKml(payload: GeoExportPayload): void {
  const kml = buildKmlExport(payload);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(
    kml,
    `maamitta-${dateStr}.kml`,
    'application/vnd.google-earth.kml+xml'
  );
}
