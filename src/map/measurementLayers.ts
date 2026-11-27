import type { Feature, FeatureCollection, Point } from 'geojson';
import type * as maplibregl from 'maplibre-gl';
import { toClosedRing } from '../engine/geometry';
import type { LngLat, MeasurementGeometry } from '../engine/types';
import { FINLAND_MASK_GEOJSON } from './finlandMask';
import type { BaseLayerId } from './providers';

export type VertexCollection = 'area' | 'cutout' | 'activeCutout' | 'line';

export interface VertexRef {
  collection: VertexCollection;
  cutoutIndex: number;
  vertexIndex: number;
}

const SOURCE_ID = 'maamitta-measurements';
const MASK_SOURCE_ID = 'maamitta-finland-mask';
const SOIL_SOURCE_ID = 'maamitta-gtk-soil';
const SOIL_LAYER_ID = 'maamitta-gtk-soil-layer';
const PARCELS_SOURCE_ID = 'maamitta-vector-parcels';
const PARCELS_CASING_LAYER_ID = 'maamitta-vector-parcels-casing';
const PARCELS_LINE_LAYER_ID = 'maamitta-vector-parcels-line';
const VERTEX_LAYER_ID = 'maamitta-vertices';
const MIDPOINT_LAYER_ID = 'maamitta-midpoints';

const GTK_SOIL_WMS_TILE =
  '/api/gtk-wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&STYLES=&LAYERS=maapera_200k_maalajit,maapera_50k_pohjamaalajit,maapera_20k_pohjamaalajit&SRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX={bbox-epsg-3857}';

export const SOIL_LEGEND_ITEMS = [
  { color: '#f28482', fi: 'Kallio', en: 'Bedrock' },
  { color: '#f2d59b', fi: 'Moreeni', en: 'Till' },
  { color: '#74b777', fi: 'Sora / hiekka', en: 'Gravel / sand' },
  { color: '#e3c0f5', fi: 'Hieta / hiesu', en: 'Silt' },
  { color: '#a8d5f7', fi: 'Savi', en: 'Clay' },
  { color: '#b5b5b5', fi: 'Turve', en: 'Peat' },
] as const;

function pushRingVerticesAndMidpoints(
  features: Feature[],
  pts: LngLat[],
  collection: VertexCollection,
  cutoutIndex: number,
  vertexKind: string,
  closed: boolean
) {
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    if (!pt) continue;
    const f: Feature<Point> = {
      type: 'Feature',
      properties: {
        kind: vertexKind,
        collection,
        cutoutIndex,
        vertexIndex: i,
      },
      geometry: { type: 'Point', coordinates: pt },
    };
    features.push(f);
  }

  const edgeCount = closed
    ? pts.length >= 3
      ? pts.length
      : pts.length - 1
    : pts.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const mf: Feature<Point> = {
      type: 'Feature',
      properties: {
        kind: 'midpoint',
        collection,
        cutoutIndex,
        vertexIndex: i + 1,
      },
      geometry: { type: 'Point', coordinates: mid },
    };
    features.push(mf);
  }
}

export function buildMeasurementGeoJson(
  geometry: MeasurementGeometry,
  savedGeometries: MeasurementGeometry[] = []
): FeatureCollection {
  const features: Feature[] = [];

  for (const saved of savedGeometries) {
    const savedArea = toClosedRing(saved.areaPoints);
    if (savedArea) {
      features.push({
        type: 'Feature',
        properties: { kind: 'saved-area' },
        geometry: { type: 'Polygon', coordinates: [savedArea] },
      });
    }
    for (const c of saved.cutouts) {
      const cRing = toClosedRing(c);
      if (cRing) {
        features.push({
          type: 'Feature',
          properties: { kind: 'saved-cutout' },
          geometry: { type: 'Polygon', coordinates: [cRing] },
        });
      }
    }
    if (saved.linePoints.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { kind: 'saved-line' },
        geometry: { type: 'LineString', coordinates: saved.linePoints },
      });
    }
  }

  const areaRing = toClosedRing(geometry.areaPoints);
  if (areaRing) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area-poly' },
      geometry: { type: 'Polygon', coordinates: [areaRing] },
    });
  } else if (geometry.areaPoints.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area-draft' },
      geometry: { type: 'LineString', coordinates: geometry.areaPoints },
    });
  }

  const allCutouts = [...geometry.cutouts, geometry.activeCutout];
  for (const cutout of allCutouts) {
    const ring = toClosedRing(cutout);
    if (ring) {
      features.push({
        type: 'Feature',
        properties: { kind: 'cutout-poly' },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    } else if (cutout.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { kind: 'cutout-draft' },
        geometry: { type: 'LineString', coordinates: cutout },
      });
    }
  }

  if (geometry.linePoints.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: geometry.linePoints },
    });
  }

  pushRingVerticesAndMidpoints(features, geometry.areaPoints, 'area', -1, 'vertex-area', true);

  geometry.cutouts.forEach((cutout, idx) => {
    pushRingVerticesAndMidpoints(features, cutout, 'cutout', idx, 'vertex-cutout', true);
  });

  if (geometry.activeCutout.length > 0) {
    pushRingVerticesAndMidpoints(features, geometry.activeCutout, 'activeCutout', -1, 'vertex-cutout', true);
  }

  pushRingVerticesAndMidpoints(features, geometry.linePoints, 'line', -1, 'vertex-line', false);

  return { type: 'FeatureCollection', features };
}

export function attachFinlandMaskLayer(map: maplibregl.Map) {
  if (map.getSource(MASK_SOURCE_ID)) return;

  map.addSource(MASK_SOURCE_ID, {
    type: 'geojson',
    data: FINLAND_MASK_GEOJSON,
  });

  const beforeId = map.getLayer(PARCELS_CASING_LAYER_ID)
    ? PARCELS_CASING_LAYER_ID
    : map.getLayer('maamitta-area-fill')
      ? 'maamitta-area-fill'
      : undefined;

  map.addLayer(
    {
      id: 'maamitta-outside-dim',
      type: 'fill',
      source: MASK_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'outside-mask'],
      paint: {
        'fill-color': '#0E1412',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 0.42, 13, 0.22],
      },
    },
    beforeId
  );

  map.addLayer(
    {
      id: 'maamitta-finland-border',
      type: 'line',
      source: MASK_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'finland-border'],
      maxzoom: 12,
      paint: {
        'line-color': '#7DD3FC',
        'line-width': 1.5,
        'line-opacity': 0.7,
      },
    },
    beforeId
  );
}

export function attachVectorParcelLayer(
  map: maplibregl.Map,
  baseLayer: BaseLayerId,
  data: FeatureCollection
) {
  const isAerial = baseLayer === 'satellite' || baseLayer === 'mml-orto';
  const lineColor = isAerial ? '#7DD3FC' : '#0369A1';
  const casingColor = isAerial
    ? 'rgba(12, 18, 16, 0.78)'
    : 'rgba(255, 255, 255, 0.85)';

  if (map.getSource(PARCELS_SOURCE_ID)) {
    const src = map.getSource(PARCELS_SOURCE_ID) as maplibregl.GeoJSONSource;
    src.setData(data);
    if (map.getLayer(PARCELS_CASING_LAYER_ID)) {
      map.setPaintProperty(PARCELS_CASING_LAYER_ID, 'line-color', casingColor);
    }
    if (map.getLayer(PARCELS_LINE_LAYER_ID)) {
      map.setPaintProperty(PARCELS_LINE_LAYER_ID, 'line-color', lineColor);
    }
    return;
  }

  map.addSource(PARCELS_SOURCE_ID, { type: 'geojson', data });

  const beforeId = map.getLayer('maamitta-area-fill')
    ? 'maamitta-area-fill'
    : undefined;

  map.addLayer(
    {
      id: PARCELS_CASING_LAYER_ID,
      type: 'line',
      source: PARCELS_SOURCE_ID,
      paint: { 'line-color': casingColor, 'line-width': 3.2, 'line-opacity': 0.85 },
    },
    beforeId
  );

  map.addLayer(
    {
      id: PARCELS_LINE_LAYER_ID,
      type: 'line',
      source: PARCELS_SOURCE_ID,
      paint: {
        'line-color': lineColor,
        'line-width': 1.6,
        'line-dasharray': [4, 2.5],
        'line-opacity': 0.95,
      },
    },
    beforeId
  );
}

export function attachMeasurementLayers(
  map: maplibregl.Map,
  geometry: MeasurementGeometry,
  savedGeometries: MeasurementGeometry[] = []
) {
  if (map.getSource(SOURCE_ID)) {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    src.setData(buildMeasurementGeoJson(geometry, savedGeometries));
    return;
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: buildMeasurementGeoJson(geometry, savedGeometries),
  });

  map.addLayer({
    id: 'maamitta-saved-area-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-area'],
    paint: { 'fill-color': '#0B6EFD', 'fill-opacity': 0.14 },
  });

  map.addLayer({
    id: 'maamitta-saved-area-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-area'],
    paint: { 'line-color': '#0B6EFD', 'line-width': 2.2, 'line-opacity': 0.85 },
  });

  map.addLayer({
    id: 'maamitta-saved-cutout-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-cutout'],
    paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.3 },
  });

  map.addLayer({
    id: 'maamitta-saved-line',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-line'],
    paint: { 'line-color': '#9333EA', 'line-width': 2.5, 'line-opacity': 0.85 },
  });

  map.addLayer({
    id: 'maamitta-area-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'area-poly'],
    paint: { 'fill-color': '#0B6EFD', 'fill-opacity': 0.22 },
  });

  map.addLayer({
    id: 'maamitta-area-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['in', ['get', 'kind'], ['literal', ['area-poly', 'area-draft']]],
    paint: { 'line-color': '#0B6EFD', 'line-width': 3.5 },
  });

  map.addLayer({
    id: 'maamitta-cutout-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'cutout-poly'],
    paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.4 },
  });

  map.addLayer({
    id: 'maamitta-cutout-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['in', ['get', 'kind'], ['literal', ['cutout-poly', 'cutout-draft']]],
    paint: { 'line-color': '#F59E0B', 'line-width': 2.5, 'line-dasharray': [3, 2] },
  });

  map.addLayer({
    id: 'maamitta-line',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'line'],
    paint: { 'line-color': '#9333EA', 'line-width': 3.5 },
  });

  map.addLayer({
    id: MIDPOINT_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'midpoint'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#FFFFFF',
      'circle-opacity': 0.85,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#141A18',
      'circle-stroke-opacity': 0.55,
    },
  });

  map.addLayer({
    id: VERTEX_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: [
      'in',
      ['get', 'kind'],
      ['literal', ['vertex-area', 'vertex-cutout', 'vertex-line']],
    ],
    paint: {
      'circle-radius': 6.5,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#FFFFFF',
      'circle-color': [
        'match',
        ['get', 'kind'],
        'vertex-area',
        '#0B6EFD',
        'vertex-cutout',
        '#D97706',
        'vertex-line',
        '#9333EA',
        '#184E3B',
      ],
    },
  });
}

export function attachSoilMapLayer(map: maplibregl.Map, visible: boolean) {
  if (!visible) {
    if (map.getLayer(SOIL_LAYER_ID)) {
      map.setLayoutProperty(SOIL_LAYER_ID, 'visibility', 'none');
    }
    return;
  }

  if (!map.getSource(SOIL_SOURCE_ID)) {
    map.addSource(SOIL_SOURCE_ID, {
      type: 'raster',
      tiles: [GTK_SOIL_WMS_TILE],
      tileSize: 512,
      minzoom: 8,
      maxzoom: 15,
      attribution: '© GTK Maaperäkartta (CC BY 4.0)',
    });
  }

  if (!map.getLayer(SOIL_LAYER_ID)) {
    const beforeId = map.getLayer('maamitta-saved-area-fill')
      ? 'maamitta-saved-area-fill'
      : undefined;
    map.addLayer(
      {
        id: SOIL_LAYER_ID,
        type: 'raster',
        source: SOIL_SOURCE_ID,
        paint: { 'raster-opacity': 0.48 },
      },
      beforeId
    );
  } else {
    map.setLayoutProperty(SOIL_LAYER_ID, 'visibility', 'visible');
  }
}

export function queryHandleAtPoint(
  map: maplibregl.Map,
  point: maplibregl.Point,
  hitRadiusPx: number
): { isMidpoint: boolean; ref: VertexRef } | null {
  if (!map.getLayer(VERTEX_LAYER_ID)) return null;

  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [point.x - hitRadiusPx, point.y - hitRadiusPx],
    [point.x + hitRadiusPx, point.y + hitRadiusPx],
  ];

  const vertexHits = map.queryRenderedFeatures(bbox, {
    layers: [VERTEX_LAYER_ID],
  });
  const hit = vertexHits[0];
  if (hit?.properties) {
    return {
      isMidpoint: false,
      ref: {
        collection: hit.properties.collection as VertexCollection,
        cutoutIndex: Number(hit.properties.cutoutIndex),
        vertexIndex: Number(hit.properties.vertexIndex),
      },
    };
  }

  if (map.getLayer(MIDPOINT_LAYER_ID)) {
    const midHits = map.queryRenderedFeatures(bbox, {
      layers: [MIDPOINT_LAYER_ID],
    });
    const mid = midHits[0];
    if (mid?.properties) {
      return {
        isMidpoint: true,
        ref: {
          collection: mid.properties.collection as VertexCollection,
          cutoutIndex: Number(mid.properties.cutoutIndex),
          vertexIndex: Number(mid.properties.vertexIndex),
        },
      };
    }
  }

  return null;
}
