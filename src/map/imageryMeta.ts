import type { LngLat } from '../engine/types';
import type { Locale } from '../i18n/types';
import { fetchWithTimeout, safeReadJson } from './http';
import type { BaseLayerId } from './providers';

export interface ImageryMeta {
  label: string;
  isStale: boolean;
}

interface EsriQueryResponse {
  features?: Array<{
    attributes?: {
      SRC_DATE2?: number;
      SRC_RES?: number;
      NICE_DESC?: string;
    };
  }>;
}

export async function fetchImageryMeta(
  baseLayer: BaseLayerId,
  center: LngLat,
  locale: Locale,
  signal?: AbortSignal
): Promise<ImageryMeta | null> {
  if (baseLayer === 'mml-orto') {
    return {
      label:
        locale === 'en'
          ? 'NLS Orthophoto · 1–3 yr cycle'
          : 'MML Ortokuva · 1–3 v kuvauskierto',
      isStale: false,
    };
  }

  if (baseLayer === 'topo') {
    return {
      label:
        locale === 'en'
          ? 'Topographic map · current'
          : 'Maastokartta · ajantasainen',
      isStale: false,
    };
  }

  // ESRI World Imagery exact capture date metadata (zero-key)
  const [lng, lat] = center;
  const params = new URLSearchParams({
    geometry: `${lng.toFixed(5)},${lat.toFixed(5)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'SRC_DATE2,SRC_RES,NICE_DESC',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const res = await fetchWithTimeout(
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/0/query?${params.toString()}`,
      {},
      5000,
      signal
    );
    if (!res.ok) return null;
    const data = await safeReadJson<EsriQueryResponse>(res);
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs?.SRC_DATE2) return null;

    const captured = new Date(attrs.SRC_DATE2);
    if (Number.isNaN(captured.getTime())) return null;

    const ageYears =
      (Date.now() - captured.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const isStale = ageYears > 3;

    const month = String(captured.getMonth() + 1).padStart(2, '0');
    const year = captured.getFullYear();
    const resText =
      typeof attrs.SRC_RES === 'number' && attrs.SRC_RES > 0
        ? ` · ${attrs.SRC_RES.toFixed(1).replace('.', locale === 'en' ? '.' : ',')} m`
        : '';

    const prefix = locale === 'en' ? 'Satellite' : 'Kuvattu';
    return {
      label: `${prefix} ${month}/${year}${resText}`,
      isStale,
    };
  } catch {
    return null;
  }
}
