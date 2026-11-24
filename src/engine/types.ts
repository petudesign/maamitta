/** Longitude, Latitude pair in WGS84 (EPSG:4326) */
export type LngLat = [number, number];

export type DrawTool = 'pan' | 'pick' | 'area' | 'cutout' | 'line';

export type GeometrySource = 'mml' | 'osm' | 'manual';

export interface MeasurementGeometry {
  /** Primary measured polygon vertices (unclosed ring) */
  areaPoints: LngLat[];
  /** Subtracted polygon cutouts (e.g. house footprint, terrace) */
  cutouts: LngLat[][];
  /** Currently active cutout being drawn */
  activeCutout: LngLat[];
  /** Linear measurement vertices (e.g. fence, trench, cable) */
  linePoints: LngLat[];
}

export interface MeasurementSummary {
  grossAreaSqm: number;
  cutoutAreaSqm: number;
  /** 2D horizontal net area (m²) */
  netAreaSqm: number;
  /** Slope-adjusted 3D surface net area (m²) */
  effectiveAreaSqm: number;
  netAreaHa: number;
  perimeterM: number;
  lineLengthM: number;
  slopePct: number;
  slopeFactor: number;
}

export interface AccuracyMeta {
  source: GeometrySource;
  label: string;
  marginPct: number;
}

export type PresetBasis = 'area' | 'line';

export interface PresetParameter {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export interface MaterialPreset {
  id: string;
  name: string;
  shortDesc: string;
  basis: PresetBasis;
  parameters: PresetParameter[];
  /** Default unit price in EUR (excl. VAT) */
  defaultUnitPriceEur: number;
  unitPriceLabel: string;
}

export interface CalculationLine {
  label: string;
  value: string;
}

export interface CalculationResult {
  presetId: string;
  presetName: string;
  basisValue: number;
  basisUnit: 'm²' | 'm';
  billableQuantity: number;
  billableUnit: string;
  lines: CalculationLine[];
  /** Raw cost subtotal before optional contractor margin (excl. VAT) */
  baseSubtotalEur: number;
  /** Optional contractor margin % (0–30), folded into subtotalEur for client quotes */
  marginPct: number;
  /** EUR amount contributed by contractor margin */
  marginEur: number;
  /** Client-facing subtotal excl. VAT (includes margin when > 0) */
  subtotalEur: number;
  vatRatePct: number;
  vatEur: number;
  totalEur: number;
  totalMinEur: number;
  totalMaxEur: number;
  accuracy: AccuracyMeta;
}

export interface PresetPriceOverride {
  /** Custom default unit price in EUR (excl. VAT) */
  unitPriceEur?: number;
  /** Custom default waste percentage (for presets supporting wastePct) */
  wastePct?: number;
}

export interface PriceBook {
  /** Saved per-preset default unit prices and waste percentages */
  presets: Record<string, PresetPriceOverride>;
  /** Saved default hourly labour rate in EUR (excl. VAT) */
  hourlyRateEur: number;
  /** Optional contractor margin percentage (0–30%) */
  marginPct: number;
}

export interface SitePhoto {
  id: string;
  dataUrl: string;
  name: string;
}

export interface QuoteZoneItem {
  id: string;
  label: string;
  presetId: string;
  presetName: string;
  basisValue: number;
  basisUnit: 'm²' | 'm' | 'kpl';
  summaryText: string;
  subtotalEur: number;
  vatEur: number;
  totalEur: number;
  geometry: MeasurementGeometry;
}

export interface CompanyInfo {
  name: string;
  contact: string;
  projectTitle: string;
  address: string;
  /** Optional resized PNG/JPEG data URL for user/company branding in PDF quotes */
  logoDataUrl?: string;
}
