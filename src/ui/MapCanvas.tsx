import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { formatLength } from '../engine/format';
import { collectGeometryPoints, computeBounds } from '../engine/geometry';
import { snapPointWithInfo } from '../engine/shapes';
import type { DrawTool, LngLat, MeasurementGeometry } from '../engine/types';
import type { Locale } from '../i18n/types';
import { computeEdgeLabelPlacements } from '../map/edgeLabels';
import { fetchWithTimeout, safeReadJson } from '../map/http';
import { fetchImageryMeta, type ImageryMeta } from '../map/imageryMeta';
import { maplibregl } from '../map/maplibre';
import {
  attachFinlandMaskLayer,
  attachMeasurementLayers,
  attachSoilMapLayer,
  attachVectorParcelLayer,
  queryHandleAtPoint,
  SOIL_LEGEND_ITEMS,
  type VertexRef,
} from '../map/measurementLayers';
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

export type { VertexRef };

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

const VIEWPORT_STORAGE_KEY = 'maamitta:viewport:v1';
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

function loadSavedViewport(): { center: LngLat; zoom: number } | null {
  try {
    const raw = window.localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { center?: LngLat; zoom?: number };
    const [[minLng, minLat], [maxLng, maxLat]] = FINLAND_BOUNDS;
    if (
      Array.isArray(parsed.center) &&
      typeof parsed.center[0] === 'number' &&
      typeof parsed.center[1] === 'number' &&
      typeof parsed.zoom === 'number' &&
      Number.isFinite(parsed.center[0]) &&
      Number.isFinite(parsed.center[1]) &&
      Number.isFinite(parsed.zoom) &&
      parsed.center[0] >= minLng &&
      parsed.center[0] <= maxLng &&
      parsed.center[1] >= minLat &&
      parsed.center[1] <= maxLat &&
      parsed.zoom >= MIN_ZOOM &&
      parsed.zoom <= MAX_ZOOM
    ) {
      return { center: parsed.center, zoom: parsed.zoom };
    }
    return null;
  } catch {
    return null;
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
    const styleReadyRef = useRef(false);
    const [mapInitError, setMapInitError] = useState(false);
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

    useImperativeHandle(
      ref,
      () => ({
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
          const bounds = computeBounds(collectGeometryPoints(geom));
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
      }),
      []
    );

    // Initialize MapLibre once
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const savedViewport = loadSavedViewport();
      const initialBounds = computeBounds(
        collectGeometryPoints(geometryRef.current)
      );

      let map: maplibregl.Map;
      try {
        map = new maplibregl.Map({
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
      } catch (err) {
        console.error('[MapCanvas] MapLibre initialization failed:', err);
        setMapInitError(true);
        return;
      }

      map.on('error', (evt) => {
        if (import.meta.env.DEV) {
          console.warn('[MapCanvas] MapLibre error:', evt.error);
        }
      });

      map.touchZoomRotate.disableRotation();

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

      const collapseAttribution = () => {
        const attrib = containerRef.current?.querySelector(
          '.maplibregl-ctrl-attrib'
        );
        attrib?.classList.remove('maplibregl-compact-show');
      };
      map.once('load', collapseAttribution);
      map.once('idle', collapseAttribution);

      map.on('style.load', () => {
        styleReadyRef.current = true;
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

      const snapEl = document.createElement('div');
      snapEl.className = 'snap-ring';
      snapEl.style.display = 'none';
      const snapMarker = new maplibregl.Marker({
        element: snapEl,
        anchor: 'center',
      })
        .setLngLat(DEFAULT_CENTER)
        .addTo(map);

      const hideSnapRing = () => {
        snapEl.style.display = 'none';
      };

      const snapToParcels = (
        pt: LngLat,
        bypassSnap: boolean
      ): { point: LngLat; snapped: boolean } => {
        if (bypassSnap || parcelsDataRef.current.features.length === 0) {
          hideSnapRing();
          return { point: pt, snapped: false };
        }
        const metersPerPx =
          (156543.03392 * Math.cos((pt[1] * Math.PI) / 180)) /
          Math.pow(2, map.getZoom());
        const snapTolM = Math.min(4.5, Math.max(0.8, 14 * metersPerPx));
        const res = snapPointWithInfo(pt, parcelsDataRef.current, snapTolM);
        if (res.snapped) {
          snapEl.dataset.kind = res.kind ?? 'edge';
          snapEl.style.display = 'block';
          snapMarker.setLngLat(res.point);
        } else {
          hideSnapRing();
        }
        return { point: res.point, snapped: res.snapped };
      };

      const moveDrag = (lngLat: maplibregl.LngLat, bypassSnap = false) => {
        if (!dragTargetRef.current) return;
        const raw: LngLat = [lngLat.lng, lngLat.lat];
        const isCutout =
          dragTargetRef.current.collection === 'cutout' ||
          dragTargetRef.current.collection === 'activeCutout';
        const nextPt = isCutout ? raw : snapToParcels(raw, bypassSnap).point;
        onMoveVertexRef.current(dragTargetRef.current, nextPt);
      };

      const defaultCursor = () =>
        activeToolRef.current === 'pan' ? 'grab' : 'crosshair';

      const endDrag = () => {
        if (!dragTargetRef.current) return;
        dragTargetRef.current = null;
        justDraggedRef.current = true;
        hideSnapRing();
        map.dragPan.enable();
        map.getCanvas().style.cursor = defaultCursor();
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 60);
      };

      map.on('mousedown', (e) => {
        if (e.originalEvent.button !== 0) return;
        startDrag(e.point, e.lngLat, 10, () => e.preventDefault());
      });

      map.on('mousemove', (e) => {
        if (dragTargetRef.current) {
          moveDrag(e.lngLat, Boolean(e.originalEvent.altKey));
          return;
        }
        if (activeToolRef.current === 'pan') {
          hideSnapRing();
          map.getCanvas().style.cursor = 'grab';
          return;
        }
        const hit = queryHandleAtPoint(map, e.point, 10);
        if (hit) {
          hideSnapRing();
          map.getCanvas().style.cursor = 'grab';
          return;
        }
        map.getCanvas().style.cursor = defaultCursor();
        if (
          activeToolRef.current === 'area' ||
          activeToolRef.current === 'line'
        ) {
          snapToParcels(
            [e.lngLat.lng, e.lngLat.lat],
            Boolean(e.originalEvent.altKey)
          );
        } else {
          hideSnapRing();
        }
      });

      map.on('mouseout', hideSnapRing);
      map.on('mouseup', endDrag);
      window.addEventListener('mouseup', endDrag);

      map.on('touchstart', (e) => {
        if (e.points.length !== 1) return;
        startDrag(e.point, e.lngLat, 20, () => e.preventDefault());
      });

      map.on('touchmove', (e) => {
        if (!dragTargetRef.current) return;
        e.preventDefault();
        moveDrag(e.lngLat, false);
      });

      map.on('touchend', endDrag);
      map.on('touchcancel', endDrag);

      map.on('contextmenu', (e) => {
        e.preventDefault();
        if (activeToolRef.current === 'pan') return;
        const hit = queryHandleAtPoint(map, e.point, 12);
        if (hit && !hit.isMidpoint) {
          onDeleteVertexRef.current(hit.ref);
        }
      });

      map.on('click', (e) => {
        if (justDraggedRef.current) return;
        const hit = queryHandleAtPoint(map, e.point, 10);
        if (hit) return;

        let clickPt: LngLat = [e.lngLat.lng, e.lngLat.lat];
        if (
          activeToolRef.current === 'area' ||
          activeToolRef.current === 'line'
        ) {
          clickPt = snapToParcels(
            clickPt,
            Boolean(e.originalEvent.altKey)
          ).point;
        }
        hideSnapRing();

        onMapClickRef.current(clickPt, Boolean(e.originalEvent.shiftKey));
      });

      mapRef.current = map;

      return () => {
        snapMarker.remove();
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
      styleReadyRef.current = false;
      map.setStyle(buildMapStyle(baseLayer));
    }, [baseLayer]);

    // Toggle GTK Soil Map WMS overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !styleReadyRef.current) return;
      attachSoilMapLayer(map, showSoilMap);
    }, [showSoilMap]);

    // Load vector property boundaries for current viewport when zoomed in (zoom >= 14.2)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (!showParcels || !IS_MML_ENABLED || map.getZoom() < 14.2) {
        parcelsDataRef.current = EMPTY_FC;
        if (styleReadyRef.current) {
          attachVectorParcelLayer(map, baseLayerRef.current, EMPTY_FC);
        }
        return;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        try {
          const b = map.getBounds();
          const bbox = `${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`;
          const res = await fetchWithTimeout(
            `/api/mml-features/collections/PalstanSijaintitiedot/items?bbox=${bbox}&limit=1000`,
            {},
            8000,
            controller.signal
          );
          if (!res.ok || controller.signal.aborted) return;
          const fc = await safeReadJson<FeatureCollection>(res);
          if (!fc || controller.signal.aborted) return;
          parcelsDataRef.current = fc;
          if (styleReadyRef.current) {
            attachVectorParcelLayer(map, baseLayerRef.current, fc);
          }
        } catch {
          // Ignore aborted or transient network errors
        }
      }, 280);

      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [showParcels, viewportRev]);

    // Sync GeoJSON measurement geometry
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !styleReadyRef.current) return;
      attachMeasurementLayers(map, geometry, savedGeometries);
    }, [geometry, savedGeometries]);

    // Sync live edge length pills with screen-space collision avoidance
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      for (const marker of edgeMarkersRef.current) {
        marker.remove();
      }
      edgeMarkersRef.current = [];

      const placed: Array<{ x: number; y: number }> = [];
      const renderEdges = (
        pts: LngLat[],
        closed: boolean,
        kind: 'area' | 'line'
      ) => {
        const placements = computeEdgeLabelPlacements(pts, closed, {
          project: (pt) => map.project(pt),
          minDistM: 3.5,
          minPxLen: 42,
          outwardOffsetPx: 16,
          collisionWidthPx: 56,
          collisionHeightPx: 24,
          maxLabels: 28,
          placed,
        });

        for (const c of placements) {
          const el = document.createElement('div');
          el.className = 'edge-label';
          el.dataset.kind = kind;
          el.textContent = formatLength(c.distM, locale);

          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'center',
            offset: [c.offsetX, c.offsetY],
          })
            .setLngLat(c.midLngLat)
            .addTo(map);

          edgeMarkersRef.current.push(marker);
        }
      };

      renderEdges(geometry.areaPoints, true, 'area');
      renderEdges(geometry.linePoints, false, 'line');
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

    if (mapInitError) {
      return (
        <div
          className="map-stage"
          style={{ display: 'grid', placeItems: 'center', padding: 24 }}
        >
          <div className="not-found-card">
            <h2 className="not-found-title">
              {locale === 'en'
                ? 'Map could not be initialized'
                : 'Karttaa ei voitu käynnistää'}
            </h2>
            <p className="not-found-desc">
              {locale === 'en'
                ? 'WebGL is unavailable or blocked in this browser. Enable hardware acceleration and reload.'
                : 'WebGL ei ole käytettävissä tässä selaimessa. Ota laitteistokiihdytys käyttöön ja lataa sivu uudelleen.'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="map-stage">
        <div
          ref={containerRef}
          className="map-canvas"
          aria-label={locale === 'en' ? 'Measurement map' : 'Mittauskartta'}
        />
        {showCrosshair &&
          (activeTool === 'area' ||
            activeTool === 'cutout' ||
            activeTool === 'line') && (
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
