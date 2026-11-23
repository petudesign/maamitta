import { describe, expect, it } from 'vitest';
import { buildGeoJsonExport, buildKmlExport } from './geoExport';

describe('geoExport (GeoJSON & KML)', () => {
  const payload = {
    projectTitle: 'Testipiha & <Kiveys>',
    parcelCode: '049-012-0045-0001',
    geometry: {
      areaPoints: [
        [24.9, 60.1] as [number, number],
        [24.901, 60.1] as [number, number],
        [24.901, 60.101] as [number, number],
      ],
      cutouts: [],
      activeCutout: [],
      linePoints: [
        [24.9, 60.1] as [number, number],
        [24.902, 60.1] as [number, number],
      ],
    },
    quoteItems: [],
  };

  it('builds a valid GeoJSON FeatureCollection with polygon and line', () => {
    const fc = buildGeoJsonExport(payload);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]?.geometry.type).toBe('Polygon');
    expect(fc.features[1]?.geometry.type).toBe('LineString');
  });

  it('escapes XML entities in KML export', () => {
    const kml = buildKmlExport(payload);
    expect(kml).toContain('Testipiha &amp; &lt;Kiveys&gt;');
    expect(kml).toContain('<Polygon>');
    expect(kml).toContain('<LineString>');
  });
});
