import { formatLength } from '../engine/format';
import {
  collectGeometryPoints,
  computeBounds,
  computeCentroid,
  toClosedRing,
} from '../engine/geometry';
import type { LngLat, MeasurementGeometry } from '../engine/types';
import type { Locale } from '../i18n/types';
import { computeEdgeLabelPlacements } from '../map/edgeLabels';
import { maplibregl } from '../map/maplibre';
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
 * Picks the geographic bounds to frame in the PDF aerial image.
 * Frames all zones together when they are in the same neighborhood (~2 km),
 * but avoids zooming out across cities if an unrelated distant zone is selected.
 */
function selectFramingPoints(
  geometry: MeasurementGeometry,
  extraGeometries: MeasurementGeometry[]
): LngLat[] {
  const activePts = collectGeometryPoints(geometry);
  const nonEmptyExtras = extraGeometries
    .map(collectGeometryPoints)
    .filter((pts) => pts.length >= 2);

  const anchorPts =
    activePts.length >= 2
      ? activePts
      : nonEmptyExtras[nonEmptyExtras.length - 1] ?? [];
  if (anchorPts.length < 2) return [];

  const anchorCenter = computeCentroid(anchorPts);
  if (!anchorCenter) return [];
  const [anchorLng, anchorLat] = anchorCenter;
  const maxLatDelta = 0.02; // ~2.2 km north-south
  const maxLngDelta = 0.04; // ~2.2 km east-west at 60°N

  const framed: LngLat[] = [...anchorPts];
  for (const pts of nonEmptyExtras) {
    if (pts === anchorPts) continue;
    const center = computeCentroid(pts);
    if (!center) continue;
    const [cLng, cLat] = center;
    if (
      Math.abs(cLat - anchorLat) <= maxLatDelta &&
      Math.abs(cLng - anchorLng) <= maxLngDelta
    ) {
      framed.push(...pts);
    }
  }
  return framed;
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
  const framedPts = selectFramingPoints(geometry, extraGeometries);
  if (framedPts.length < 2) return null;

  const bounds = computeBounds(framedPts);
  if (!bounds) return null;
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;

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
      const placements = computeEdgeLabelPlacements(pts, closed, {
        project: (pt) => map!.project(pt),
        minDistM: 4,
        minPxLen: 52,
        outwardOffsetPx: 0,
        collisionWidthPx: 84,
        collisionHeightPx: 32,
        maxLabels: 24,
        placed: placedPills,
      });
      for (const c of placements) {
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
