import maplibregl from 'maplibre-gl';
import { formatLength } from '../engine/format';
import { computeLineLengthM, toClosedRing } from '../engine/geometry';
import type { LngLat, MeasurementGeometry } from '../engine/types';
import type { Locale } from '../i18n/types';
import { type BaseLayerId, buildMapStyle } from '../map/providers';

interface SnapshotOptions {
  baseLayer: BaseLayerId;
  geometry: MeasurementGeometry;
  extraGeometries?: MeasurementGeometry[];
  locale?: Locale;
  widthPx?: number;
  heightPx?: number;
}

function drawRoundedPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bgColor: string
) {
  ctx.font =
    '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 8;
  const pillW = metrics.width + padX * 2;
  const pillH = 22;
  const rx = x - pillW / 2;
  const ry = y - pillH / 2;
  const r = 6;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.lineTo(rx + pillW - r, ry);
  ctx.quadraticCurveTo(rx + pillW, ry, rx + pillW, ry + r);
  ctx.lineTo(rx + pillW, ry + pillH - r);
  ctx.quadraticCurveTo(rx + pillW, ry + pillH, rx + pillW - r, ry + pillH);
  ctx.lineTo(rx + r, ry + pillH);
  ctx.quadraticCurveTo(rx, ry + pillH, rx, ry + pillH - r);
  ctx.lineTo(rx, ry + r);
  ctx.quadraticCurveTo(rx, ry, rx + r, ry);
  ctx.closePath();

  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/**
 * Renders a clean, client-ready aerial snapshot completely offscreen so the user's
 * live map never jumps or flickers. Excludes neighboring red parcel lines and edit
 * handles, and bakes crisp edge meter labels directly onto the image.
 */
export async function renderCleanPdfMapSnapshot(
  options: SnapshotOptions
): Promise<string | null> {
  const {
    baseLayer,
    geometry,
    extraGeometries = [],
    locale = 'fi',
    widthPx = 1200,
    heightPx = 566,
  } = options;

  const allGeoms = [...extraGeometries, geometry];
  const allPts: LngLat[] = allGeoms.flatMap((g) => [
    ...g.areaPoints,
    ...g.linePoints,
    ...g.activeCutout,
    ...g.cutouts.flat(),
  ]);
  if (allPts.length < 2) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of allPts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${widthPx}px`;
  container.style.height = `${heightPx}px`;
  container.style.pointerEvents = 'none';
  container.style.visibility = 'hidden';
  document.body.appendChild(container);

  let map: maplibregl.Map | null = null;

  try {
    // Always omit parcel boundary overlay in client PDFs for a clean aerial view
    map = new maplibregl.Map({
      container,
      style: buildMapStyle(baseLayer),
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Map style load timed out'));
        }
      }, 4500);
      map!.once('style.load', () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve();
        }
      });
      map!.once('error', () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('Map style failed to load'));
        }
      });
    });

    // Attach clean geometry for all selected zones (no vertex/midpoint handles)
    const features: GeoJSON.Feature[] = [];
    for (const g of allGeoms) {
      const areaRing = toClosedRing(g.areaPoints);
      if (areaRing) {
        features.push({
          type: 'Feature',
          properties: { kind: 'area' },
          geometry: { type: 'Polygon', coordinates: [areaRing] },
        });
      }
      for (const cutout of [...g.cutouts, g.activeCutout]) {
        const ring = toClosedRing(cutout);
        if (ring) {
          features.push({
            type: 'Feature',
            properties: { kind: 'cutout' },
            geometry: { type: 'Polygon', coordinates: [ring] },
          });
        }
      }
      if (g.linePoints.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { kind: 'line' },
          geometry: { type: 'LineString', coordinates: g.linePoints },
        });
      }
    }

    map.addSource('pdf-geom', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    map.addLayer({
      id: 'pdf-area-fill',
      type: 'fill',
      source: 'pdf-geom',
      filter: ['==', ['get', 'kind'], 'area'],
      paint: { 'fill-color': '#0B6EFD', 'fill-opacity': 0.2 },
    });

    map.addLayer({
      id: 'pdf-area-line',
      type: 'line',
      source: 'pdf-geom',
      filter: ['==', ['get', 'kind'], 'area'],
      paint: { 'line-color': '#0B6EFD', 'line-width': 3.5 },
    });

    map.addLayer({
      id: 'pdf-cutout-fill',
      type: 'fill',
      source: 'pdf-geom',
      filter: ['==', ['get', 'kind'], 'cutout'],
      paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.42 },
    });

    map.addLayer({
      id: 'pdf-cutout-line',
      type: 'line',
      source: 'pdf-geom',
      filter: ['==', ['get', 'kind'], 'cutout'],
      paint: {
        'line-color': '#F59E0B',
        'line-width': 2.5,
        'line-dasharray': [3, 2],
      },
    });

    map.addLayer({
      id: 'pdf-line',
      type: 'line',
      source: 'pdf-geom',
      filter: ['==', ['get', 'kind'], 'line'],
      paint: { 'line-color': '#9333EA', 'line-width': 4 },
    });

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 72, maxZoom: 19, animate: false }
    );

    // Wait for tiles to finish rendering (max 3.5 s)
    await new Promise<void>((resolve) => {
      let doneFlag = false;
      const finish = () => {
        if (doneFlag) return;
        doneFlag = true;
        map?.off('idle', finish);
        window.requestAnimationFrame(() => resolve());
      };
      map!.once('idle', finish);
      window.setTimeout(finish, 3500);
    });

    const glCanvas = map.getCanvas();
    const outCanvas = document.createElement('canvas');
    outCanvas.width = widthPx;
    outCanvas.height = heightPx;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return glCanvas.toDataURL('image/jpeg', 0.92);

    ctx.drawImage(glCanvas, 0, 0, widthPx, heightPx);

    // Draw crisp meter pills on visible edges with collision avoidance
    const placedPills: Array<{ x: number; y: number }> = [];
    const drawEdges = (pts: LngLat[], closed: boolean, bgColor: string) => {
      const edgeCount = closed
        ? pts.length >= 3
          ? pts.length
          : pts.length - 1
        : pts.length - 1;
      if (edgeCount <= 0) return;

      const candidates: Array<{
        x: number;
        y: number;
        pxLen: number;
        distM: number;
      }> = [];
      for (let i = 0; i < edgeCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        const distM = computeLineLengthM([a, b]);
        if (distM < 4) continue;
        const pa = map!.project(a);
        const pb = map!.project(b);
        const pxLen = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (pxLen < 52) continue;
        candidates.push({
          x: (pa.x + pb.x) / 2,
          y: (pa.y + pb.y) / 2,
          pxLen,
          distM,
        });
      }

      candidates.sort((c1, c2) => c2.pxLen - c1.pxLen);
      let drawn = 0;
      for (const c of candidates) {
        if (drawn >= 24) break;
        if (
          placedPills.some(
            (p) => Math.abs(p.x - c.x) < 84 && Math.abs(p.y - c.y) < 32
          )
        ) {
          continue;
        }
        placedPills.push({ x: c.x, y: c.y });
        drawn += 1;
        drawRoundedPill(ctx, c.x, c.y, formatLength(c.distM, locale), bgColor);
      }
    };

    drawEdges(geometry.areaPoints, true, 'rgba(20, 26, 24, 0.88)');
    drawEdges(geometry.linePoints, false, 'rgba(147, 51, 234, 0.92)');

    return outCanvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  } finally {
    map?.remove();
    container.remove();
  }
}
