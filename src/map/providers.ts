import type { StyleSpecification } from 'maplibre-gl';

export type BaseLayerId = 'satellite' | 'mml-orto' | 'topo';

export interface MapLayerConfig {
  id: BaseLayerId;
  label: string;
  sourceLabel: string;
  tiles: string[];
  attribution: string;
  maxzoom: number;
  enabled: boolean;
}

export const IS_MML_ENABLED: boolean =
  typeof __MML_PROXY_ENABLED__ !== 'undefined' && __MML_PROXY_ENABLED__;

/**
 * On Retina / HiDPI displays (Mac, iPhone), rendering 256px raster tiles at 128 CSS px
 * loads one zoom level higher automatically — eliminating the blurry 2x upscale.
 */
const HI_DPI_TILE_SIZE =
  typeof window !== 'undefined' && window.devicePixelRatio > 1.25 ? 128 : 256;

export const BASE_LAYERS: Record<BaseLayerId, MapLayerConfig> = {
  satellite: {
    id: 'satellite',
    label: 'Satelliitti (tarkin)',
    sourceLabel: 'ESRI World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
    enabled: true,
  },
  'mml-orto': {
    id: 'mml-orto',
    label: 'Ilmakuva (MML)',
    sourceLabel: 'Maanmittauslaitos Ortokuva',
    tiles: [
      '/api/mml-wmts/ortokuva/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.jpg',
    ],
    attribution: '© Maanmittauslaitos (CC BY 4.0)',
    maxzoom: 19,
    enabled: IS_MML_ENABLED,
  },
  topo: IS_MML_ENABLED
    ? {
        id: 'topo',
        label: 'Maastokartta (MML)',
        sourceLabel: 'Maanmittauslaitos Maastokartta',
        tiles: [
          '/api/mml-wmts/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png',
        ],
        attribution: '© Maanmittauslaitos (CC BY 4.0)',
        maxzoom: 18,
        enabled: true,
      }
    : {
        id: 'topo',
        label: 'Peruskartta',
        sourceLabel: 'OpenStreetMap',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenStreetMap-tekijät',
        maxzoom: 19,
        enabled: true,
      },
};

export const ENABLED_BASE_LAYERS: MapLayerConfig[] = Object.values(
  BASE_LAYERS
).filter((layer) => layer.enabled);

/** Default starting view & geographic bounds (Finland — configurable per market) */
export const DEFAULT_CENTER: [number, number] = [24.9384, 60.1699];
export const DEFAULT_ZOOM = 16;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 20;
export const FINLAND_BOUNDS: [[number, number], [number, number]] = [
  [18.5, 59.0], // SW (Ahvenanmaa + pieni marginaali)
  [32.5, 70.6], // NE (Utsjoki + pieni marginaali)
];

export function buildMapStyle(
  baseLayer: BaseLayerId
): StyleSpecification {
  const layer = BASE_LAYERS[baseLayer]?.enabled
    ? BASE_LAYERS[baseLayer]
    : BASE_LAYERS.satellite;

  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: layer.tiles,
        tileSize: HI_DPI_TILE_SIZE,
        maxzoom: layer.maxzoom,
        attribution: layer.attribution,
      },
    },
    layers: [
      {
        id: 'base-layer',
        type: 'raster',
        source: 'base',
      },
    ],
  };
}
