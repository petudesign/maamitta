import type { Feature, FeatureCollection, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { formatLength } from '../engine/format';
import { computeLineLengthM, toClosedRing } from '../engine/geometry';
import { snapPointToFeatureCollection } from '../engine/shapes';
import type { DrawTool, LngLat, MeasurementGeometry } from '../engine/types';
import type { Locale } from '../i18n/types';
import { FINLAND_MASK_GEOJSON } from '../map/finlandMask';
import { fetchImageryMeta, type ImageryMeta } from '../map/imageryMeta';
import {
  type BaseLayerId,
  buildMapStyle,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FINLAND_BOUNDS,
  IS_MML_ENABLED,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../map/providers';

export type VertexCollection = 'area' | 'cutout' | 'activeCutout' | 'line';

export interface VertexRef {
  collection: VertexCollection;
  cutoutIndex: number;
  vertexIndex: number;
}

export interface MapCanvasHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitGeometry: (geometry: MeasurementGeometry, animate?: boolean) => void;
  getCenter: () => LngLat | null;
}

interface MapCanvasProps {
  locale: Locale;
  baseLayer: BaseLayerId;
  showParcels: boolean;
  showSoilMap?: boolean;
  geometry: MeasurementGeometry;
  savedGeometries?: MeasurementGeometry[];
  activeTool: DrawTool;
  showCrosshair: boolean;
  onMapClick: (point: LngLat, shiftKey: boolean) => void;
  onDragStart?: () => void;
  onMoveVertex: (target: VertexRef, nextPoint: LngLat) => void;
  onInsertVertex: (target: VertexRef, point: LngLat) => void;
  onDeleteVertex: (target: VertexRef) => void;
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
const VIEWPORT_STORAGE_KEY = 'maamitta:viewport:v1';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

function loadSavedViewport(): { center: LngLat; zoom: number } | null {
  try {
    const raw = window.localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { center?: LngLat; zoom?: number };
    if (
      Array.isArray(parsed.center) &&
      typeof parsed.center[0] === 'number' &&
      typeof parsed.center[1] === 'number' &&
      typeof parsed.zoom === 'number'
    ) {
      return { center: parsed.center, zoom: parsed.zoom };
    }
    return null;
  } catch {
    return null;
  }
}

function collectBounds(
  geom: MeasurementGeometry
): [[number, number], [number, number]] | null {
  const pts: LngLat[] = [
    ...geom.areaPoints,
    ...geom.linePoints,
    ...geom.activeCutout,
    ...geom.cutouts.flat(),
  ];
  if (pts.length === 0) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

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

function buildMeasurementGeoJson(
  geometry: MeasurementGeometry,
  savedGeometries: MeasurementGeometry[] = []
): FeatureCollection {
  const features: Feature[] = [];

  // Previously selected / archived zones (Shift+Click multi-select & quote rows)
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

  // Primary area polygon + outline
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

  // Cutout polygons
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

  // Line measurement
  if (geometry.linePoints.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: geometry.linePoints },
    });
  }

  // Vertices + Midpoints for interactive editing
  pushRingVerticesAndMidpoints(
    features,
    geometry.areaPoints,
    'area',
    -1,
    'vertex-area',
    true
  );

  geometry.cutouts.forEach((cutout, idx) => {
    pushRingVerticesAndMidpoints(
      features,
      cutout,
      'cutout',
      idx,
      'vertex-cutout',
      true
    );
  });

  if (geometry.activeCutout.length > 0) {
    pushRingVerticesAndMidpoints(
      features,
      geometry.activeCutout,
      'activeCutout',
      -1,
      'vertex-cutout',
      true
    );
  }

  pushRingVerticesAndMidpoints(
    features,
    geometry.linePoints,
    'line',
    -1,
    'vertex-line',
    false
  );

  return { type: 'FeatureCollection', features };
}

function attachFinlandMaskLayer(map: maplibregl.Map) {
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
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          0.6,
          9,
          0.42,
          13,
          0.22,
        ],
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

function attachVectorParcelLayer(
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

  map.addSource(PARCELS_SOURCE_ID, {
    type: 'geojson',
    data,
  });

  const beforeId = map.getLayer('maamitta-area-fill')
    ? 'maamitta-area-fill'
    : undefined;

  // High-contrast casing underneath ensures WCAG AAA legibility on both white roofs & dark forest
  map.addLayer(
    {
      id: PARCELS_CASING_LAYER_ID,
      type: 'line',
      source: PARCELS_SOURCE_ID,
      paint: {
        'line-color': casingColor,
        'line-width': 3.2,
        'line-opacity': 0.85,
      },
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

function attachMeasurementLayers(
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

  // Saved multi-select zones rendered softly beneath the active zone
  map.addLayer({
    id: 'maamitta-saved-area-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-area'],
    paint: {
      'fill-color': '#0B6EFD',
      'fill-opacity': 0.14,
    },
  });

  map.addLayer({
    id: 'maamitta-saved-area-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-area'],
    paint: {
      'line-color': '#0B6EFD',
      'line-width': 2.2,
      'line-opacity': 0.85,
    },
  });

  map.addLayer({
    id: 'maamitta-saved-cutout-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-cutout'],
    paint: {
      'fill-color': '#F59E0B',
      'fill-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'maamitta-saved-line',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'saved-line'],
    paint: {
      'line-color': '#9333EA',
      'line-width': 2.5,
      'line-opacity': 0.85,
    },
  });

  map.addLayer({
    id: 'maamitta-area-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'area-poly'],
    paint: {
      'fill-color': '#0B6EFD',
      'fill-opacity': 0.22,
    },
  });

  map.addLayer({
    id: 'maamitta-area-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['in', ['get', 'kind'], ['literal', ['area-poly', 'area-draft']]],
    paint: {
      'line-color': '#0B6EFD',
      'line-width': 3.5,
    },
  });

  map.addLayer({
    id: 'maamitta-cutout-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'cutout-poly'],
    paint: {
      'fill-color': '#F59E0B',
      'fill-opacity': 0.4,
    },
  });

  map.addLayer({
    id: 'maamitta-cutout-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: [
      'in',
      ['get', 'kind'],
      ['literal', ['cutout-poly', 'cutout-draft']],
    ],
    paint: {
      'line-color': '#F59E0B',
      'line-width': 2.5,
      'line-dasharray': [3, 2],
    },
  });

  map.addLayer({
    id: 'maamitta-line',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'line'],
    paint: {
      'line-color': '#9333EA',
      'line-width': 3.5,
    },
  });

  // Subtle midpoint handles (drag to add a new corner on any edge)
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

  // Draggable vertices
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

function queryHandleAtPoint(
  map: maplibregl.Map,
  point: maplibregl.Point,
  hitRadiusPx: number
): { isMidpoint: boolean; ref: VertexRef } | null {
  if (!map.getLayer(VERTEX_LAYER_ID)) return null;

  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [point.x - hitRadiusPx, point.y - hitRadiusPx],
    [point.x + hitRadiusPx, point.y + hitRadiusPx],
  ];

  // Prioritize existing vertices over midpoints
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

/**
 * True once the style JSON is parsed and layers/sources can be added.
 * Unlike map.isStyleLoaded(), this does NOT wait for every raster tile to finish,
 * so geometry and parcel updates aren't silently dropped while slow tiles load.
 */
function isStyleReady(map: maplibregl.Map): boolean {
  return Boolean(
    (map as unknown as { style?: { _loaded?: boolean } }).style?._loaded
  );
}

const GTK_SOIL_WMS_TILE =
  '/api/gtk-wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&STYLES=&LAYERS=maapera_200k_maalajit,maapera_50k_pohjamaalajit,maapera_20k_pohjamaalajit&SRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX={bbox-epsg-3857}';

const SOIL_LEGEND_ITEMS = [
  { color: '#f28482', fi: 'Kallio', en: 'Bedrock' },
  { color: '#f2d59b', fi: 'Moreeni', en: 'Till' },
  { color: '#74b777', fi: 'Sora / hiekka', en: 'Gravel / sand' },
  { color: '#e3c0f5', fi: 'Hieta / hiesu', en: 'Silt' },
  { color: '#a8d5f7', fi: 'Savi', en: 'Clay' },
  { color: '#b5b5b5', fi: 'Turve', en: 'Peat' },
] as const;

function attachSoilMapLayer(map: maplibregl.Map, visible: boolean) {
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
        paint: {
          'raster-opacity': 0.48,
        },
      },
      beforeId
    );
  } else {
    map.setLayoutProperty(SOIL_LAYER_ID, 'visibility', 'visible');
  }
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  function MapCanvas(
    {
      locale,
      baseLayer,
      showParcels,
      showSoilMap = false,
      geometry,
      savedGeometries = [],
      activeTool,
      showCrosshair,
      onMapClick,
      onDragStart,
      onMoveVertex,
      onInsertVertex,
      onDeleteVertex,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const onMapClickRef = useRef(onMapClick);
    const onDragStartRef = useRef(onDragStart);
    const onMoveVertexRef = useRef(onMoveVertex);
    const onInsertVertexRef = useRef(onInsertVertex);
    const onDeleteVertexRef = useRef(onDeleteVertex);
    const geometryRef = useRef(geometry);
    const savedGeometriesRef = useRef(savedGeometries);
    const parcelsDataRef = useRef<FeatureCollection>(EMPTY_FC);
    const baseLayerRef = useRef(baseLayer);
    const showSoilMapRef = useRef(showSoilMap);
    const activeToolRef = useRef(activeTool);
    const dragTargetRef = useRef<VertexRef | null>(null);
    const justDraggedRef = useRef(false);
    const edgeMarkersRef = useRef<maplibregl.Marker[]>([]);
    const isInitialStyleRef = useRef(true);
    const [imageryMeta, setImageryMeta] = useState<ImageryMeta | null>(null);
    const [viewportRev, setViewportRev] = useState(0);

    onMapClickRef.current = onMapClick;
    onDragStartRef.current = onDragStart;
    onMoveVertexRef.current = onMoveVertex;
    onInsertVertexRef.current = onInsertVertex;
    onDeleteVertexRef.current = onDeleteVertex;
    geometryRef.current = geometry;
    savedGeometriesRef.current = savedGeometries;
    baseLayerRef.current = baseLayer;
    showSoilMapRef.current = showSoilMap;
    activeToolRef.current = activeTool;

    useImperativeHandle(ref, () => ({
      flyTo(lng: number, lat: number, zoom = 17) {
        mapRef.current?.flyTo({
          center: [lng, lat],
          zoom,
          duration: 700,
        });
      },
      fitGeometry(geom: MeasurementGeometry, animate = true) {
        const map = mapRef.current;
        if (!map) return;
        const bounds = collectBounds(geom);
        if (!bounds) return;
        map.fitBounds(bounds, {
          padding: 80,
          maxZoom: 18,
          duration: animate ? 650 : 0,
        });
      },
      getCenter(): LngLat | null {
        const center = mapRef.current?.getCenter();
        if (!center) return null;
        return [center.lng, center.lat];
      },
    }), []);

    // Initialize MapLibre once
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const savedViewport = loadSavedViewport();
      const initialBounds = collectBounds(geometryRef.current);

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(baseLayer),
        center: savedViewport?.center ?? DEFAULT_CENTER,
        zoom: savedViewport?.zoom ?? DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: FINLAND_BOUNDS,
        maxPitch: 0,
        boxZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });

      map.touchZoomRotate.disableRotation();

      // If a saved project geometry exists on reload, frame it immediately instead of jumping to Helsinki
      if (initialBounds) {
        map.fitBounds(initialBounds, {
          padding: 80,
          maxZoom: 18,
          animate: false,
        });
      }

      map.on('moveend', () => {
        setViewportRev((r) => r + 1);
        try {
          const c = map.getCenter();
          window.localStorage.setItem(
            VIEWPORT_STORAGE_KEY,
            JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() })
          );
        } catch {
          // Ignore storage errors
        }
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'bottom-right'
      );

      // Keep compact attribution collapsed to the neat (i) button after load
      const collapseAttribution = () => {
        const attrib = containerRef.current?.querySelector(
          '.maplibregl-ctrl-attrib'
        );
        attrib?.classList.remove('maplibregl-compact-show');
      };
      map.once('load', collapseAttribution);
      map.once('idle', collapseAttribution);

      map.on('style.load', () => {
        attachMeasurementLayers(
          map,
          geometryRef.current,
          savedGeometriesRef.current
        );
        attachSoilMapLayer(map, showSoilMapRef.current);
        attachFinlandMaskLayer(map);
        attachVectorParcelLayer(
          map,
          baseLayerRef.current,
          parcelsDataRef.current
        );
      });

      const startDrag = (
        point: maplibregl.Point,
        lngLat: maplibregl.LngLat,
        hitRadiusPx: number,
        preventDefault: () => void
      ) => {
        // Never grab polygon handles in Hand/Pan free-roam mode
        if (activeToolRef.current === 'pan') return;
        const hit = queryHandleAtPoint(map, point, hitRadiusPx);
        if (!hit) return;
        preventDefault();

        onDragStartRef.current?.();
        if (hit.isMidpoint) {
          onInsertVertexRef.current(hit.ref, [lngLat.lng, lngLat.lat]);
        }
        dragTargetRef.current = hit.ref;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
      };

      const moveDrag = (lngLat: maplibregl.LngLat) => {
        if (!dragTargetRef.current) return;
        onMoveVertexRef.current(dragTargetRef.current, [
          lngLat.lng,
          lngLat.lat,
        ]);
      };

      const defaultCursor = () =>
        activeToolRef.current === 'pan' ? 'grab' : 'crosshair';

      const endDrag = () => {
        if (!dragTargetRef.current) return;
        dragTargetRef.current = null;
        justDraggedRef.current = true;
        map.dragPan.enable();
        map.getCanvas().style.cursor = defaultCursor();
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 60);
      };

      // Mouse drag
      map.on('mousedown', (e) => {
        if (e.originalEvent.button !== 0) return;
        startDrag(e.point, e.lngLat, 10, () => e.preventDefault());
      });

      map.on('mousemove', (e) => {
        if (dragTargetRef.current) {
          moveDrag(e.lngLat);
          return;
        }
        if (activeToolRef.current === 'pan') {
          map.getCanvas().style.cursor = 'grab';
          return;
        }
        const hit = queryHandleAtPoint(map, e.point, 10);
        map.getCanvas().style.cursor = hit ? 'grab' : defaultCursor();
      });

      map.on('mouseup', endDrag);
      window.addEventListener('mouseup', endDrag);

      // Touch drag (generous 20px hit radius for fingers)
      map.on('touchstart', (e) => {
        if (e.points.length !== 1) return;
        startDrag(e.point, e.lngLat, 20, () => e.preventDefault());
      });

      map.on('touchmove', (e) => {
        if (!dragTargetRef.current) return;
        e.preventDefault();
        moveDrag(e.lngLat);
      });

      map.on('touchend', endDrag);
      map.on('touchcancel', endDrag);

      // Right-click on a vertex deletes it (and never tilts the flat 2D map)
      map.on('contextmenu', (e) => {
        e.preventDefault();
        if (activeToolRef.current === 'pan') return;
        const hit = queryHandleAtPoint(map, e.point, 12);
        if (hit && !hit.isMidpoint) {
          onDeleteVertexRef.current(hit.ref);
        }
      });

      // Normal click adds a new point (or Shift+Click multi-picks in Pick mode)
      map.on('click', (e) => {
        if (justDraggedRef.current) return;
        const hit = queryHandleAtPoint(map, e.point, 10);
        if (hit) return;

        let clickPt: LngLat = [e.lngLat.lng, e.lngLat.lat];
        // Snap manual drawing clicks to nearby visible MML parcel boundaries (~12px tolerance)
        if (
          activeToolRef.current !== 'pick' &&
          parcelsDataRef.current.features.length > 0
        ) {
          const metersPerPx =
            (156543.03392 * Math.cos((e.lngLat.lat * Math.PI) / 180)) /
            Math.pow(2, map.getZoom());
          const snapTolM = Math.min(4, Math.max(0.8, 12 * metersPerPx));
          clickPt = snapPointToFeatureCollection(
            clickPt,
            parcelsDataRef.current,
            snapTolM
          );
        }

        onMapClickRef.current(clickPt, Boolean(e.originalEvent.shiftKey));
      });

      mapRef.current = map;

      return () => {
        window.removeEventListener('mouseup', endDrag);
        for (const m of edgeMarkersRef.current) m.remove();
        edgeMarkersRef.current = [];
        map.remove();
        mapRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switch base map cleanly (skip redundant initial mount call)
    useEffect(() => {
      if (isInitialStyleRef.current) {
        isInitialStyleRef.current = false;
        return;
      }
      const map = mapRef.current;
      if (!map) return;
      map.setStyle(buildMapStyle(baseLayer));
    }, [baseLayer]);

    // Toggle GTK Soil Map WMS overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isStyleReady(map)) return;
      attachSoilMapLayer(map, showSoilMap);
    }, [showSoilMap]);

    // Load crisp vector property boundaries for the current viewport when zoomed in (zoom >= 14.5)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (!showParcels || !IS_MML_ENABLED) {
        parcelsDataRef.current = EMPTY_FC;
        if (isStyleReady(map)) {
          attachVectorParcelLayer(map, baseLayer, EMPTY_FC);
        }
        return;
      }

      if (map.getZoom() < 14.2) {
        parcelsDataRef.current = EMPTY_FC;
        if (isStyleReady(map)) {
          attachVectorParcelLayer(map, baseLayer, EMPTY_FC);
        }
        return;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        try {
          const b = map.getBounds();
          const bbox = `${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`;
          const res = await fetch(
            `/api/mml-features/collections/PalstanSijaintitiedot/items?bbox=${bbox}&limit=1000`,
            { signal: controller.signal }
          );
          if (!res.ok || controller.signal.aborted) return;
          const fc = (await res.json()) as FeatureCollection;
          if (controller.signal.aborted) return;
          parcelsDataRef.current = fc;
          if (isStyleReady(map)) {
            attachVectorParcelLayer(map, baseLayer, fc);
          }
        } catch {
          // Ignore aborted or transient network errors
        }
      }, 280);

      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [showParcels, baseLayer, viewportRev]);

    // Sync GeoJSON measurement geometry
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (isStyleReady(map)) {
        attachMeasurementLayers(map, geometry, savedGeometries);
      }
    }, [geometry, savedGeometries]);

    // Sync live edge length pills with screen-space collision avoidance
    // (works on both simple yards and 100+ vertex MML shoreline parcels)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      for (const marker of edgeMarkersRef.current) {
        marker.remove();
      }
      edgeMarkersRef.current = [];

      const placed: Array<{ x: number; y: number }> = [];

      const addEdgeLabels = (
        pts: LngLat[],
        closed: boolean,
        kind: 'area' | 'line'
      ) => {
        const edgeCount = closed
          ? pts.length >= 3
            ? pts.length
            : pts.length - 1
          : pts.length - 1;
        if (edgeCount <= 0) return;

        type Candidate = {
          midLngLat: LngLat;
          x: number;
          y: number;
          pxLen: number;
          distM: number;
        };

        const candidates: Candidate[] = [];
        for (let i = 0; i < edgeCount; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          if (!a || !b) continue;
          const distM = computeLineLengthM([a, b]);
          if (distM < 3.5) continue;

          const pa = map.project(a);
          const pb = map.project(b);
          const pxLen = Math.hypot(pa.x - pb.x, pa.y - pb.y);
          // Require enough screen space along the edge so labels stay legible
          if (pxLen < 42) continue;

          candidates.push({
            midLngLat: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
            x: (pa.x + pb.x) / 2,
            y: (pa.y + pb.y) / 2,
            pxLen,
            distM,
          });
        }

        // Prioritize the longest visible edges first so key boundaries always show
        candidates.sort((c1, c2) => c2.pxLen - c1.pxLen);

        let added = 0;
        for (const c of candidates) {
          if (added >= 28) break;
          const collides = placed.some(
            (p) => Math.abs(p.x - c.x) < 56 && Math.abs(p.y - c.y) < 24
          );
          if (collides) continue;

          placed.push({ x: c.x, y: c.y });
          added += 1;

          const el = document.createElement('div');
          el.className = 'edge-label';
          el.dataset.kind = kind;
          el.textContent = formatLength(c.distM, locale);

          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'center',
          })
            .setLngLat(c.midLngLat)
            .addTo(map);

          edgeMarkersRef.current.push(marker);
        }
      };

      addEdgeLabels(geometry.areaPoints, true, 'area');
      addEdgeLabels(geometry.linePoints, false, 'line');
    }, [geometry, locale, viewportRev]);

    // Fetch satellite/orthophoto capture date for current view center
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        const c = map.getCenter();
        const meta = await fetchImageryMeta(
          baseLayer,
          [c.lng, c.lat],
          locale,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setImageryMeta(meta);
        }
      }, 450);
      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [baseLayer, locale, viewportRev]);

    // Cursor hint on desktop
    useEffect(() => {
      const canvas = mapRef.current?.getCanvas();
      if (!canvas) return;
      canvas.style.cursor = activeTool === 'pan' ? 'grab' : 'crosshair';
    }, [activeTool]);

    return (
      <div className="map-stage">
        <div
          ref={containerRef}
          className="map-canvas"
          aria-label={locale === 'en' ? 'Measurement map' : 'Mittauskartta'}
        />
        {showCrosshair && (
          <div className="crosshair" aria-hidden="true">
            <span className="crosshair-dot" />
          </div>
        )}
        {showSoilMap && (
          <div
            className="soil-legend"
            aria-label={
              locale === 'en' ? 'GTK soil map legend' : 'GTK maaperäkartan selite'
            }
          >
            {SOIL_LEGEND_ITEMS.map((item) => (
              <span key={item.en} className="soil-legend-item">
                <span
                  className="soil-swatch"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                <span>{locale === 'en' ? item.en : item.fi}</span>
              </span>
            ))}
          </div>
        )}
        {imageryMeta && (
          <div
            className="imagery-badge"
            data-stale={imageryMeta.isStale}
            aria-live="polite"
          >
            <span className="imagery-dot" aria-hidden="true" />
            <span>{imageryMeta.label}</span>
          </div>
        )}
      </div>
    );
  }
);
