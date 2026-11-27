import type {
  CompanyInfo,
  GeometrySource,
  MeasurementGeometry,
  QuoteZoneItem,
  SitePhoto,
} from '../engine/types';
import { MAX_SITE_PHOTOS } from '../export/imageCompress';

export interface SavedProject {
  id: string;
  geometry: MeasurementGeometry;
  geometrySource: GeometrySource;
  parcelCode: string | null;
  slopePct: number;
  presetId: string;
  params: Record<string, number>;
  unitPriceEur: number;
  vatRatePct: number;
  company: CompanyInfo;
  quoteItems: QuoteZoneItem[];
  siteNote: string;
  includeSiteNoteInPdf: boolean;
  sitePhotos: SitePhoto[];
  includeSitePhotosInPdf: boolean;
  updatedAt: string;
}

export interface ProjectLibraryState {
  activeProjectId: string;
  projects: SavedProject[];
}

export interface ProjectRepository {
  loadLibrary(): ProjectLibraryState | null;
  saveLibrary(state: ProjectLibraryState): boolean;
  clear(): void;
}

const LIBRARY_KEY = 'maamitta:projects:v2';
const LEGACY_KEY = 'maamitta:project:v1';

export function createProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isValidLngLat(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

function sanitizeRing(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidLngLat).map(([lng, lat]) => [lng, lat]);
}

function sanitizeGeometry(raw: unknown): MeasurementGeometry {
  if (!raw || typeof raw !== 'object') {
    return { areaPoints: [], cutouts: [], activeCutout: [], linePoints: [] };
  }
  const geom = raw as Partial<MeasurementGeometry>;
  return {
    areaPoints: sanitizeRing(geom.areaPoints),
    cutouts: Array.isArray(geom.cutouts)
      ? geom.cutouts.map(sanitizeRing).filter((r) => r.length >= 3)
      : [],
    activeCutout: sanitizeRing(geom.activeCutout),
    linePoints: sanitizeRing(geom.linePoints),
  };
}

function sanitizeQuoteItems(raw: unknown): QuoteZoneItem[] {
  if (!Array.isArray(raw)) return [];
  const valid: QuoteZoneItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Partial<QuoteZoneItem>;
    if (
      typeof q.id !== 'string' ||
      typeof q.label !== 'string' ||
      typeof q.presetId !== 'string' ||
      typeof q.basisValue !== 'number' ||
      !Number.isFinite(q.basisValue) ||
      typeof q.totalEur !== 'number' ||
      !Number.isFinite(q.totalEur)
    ) {
      continue;
    }
    valid.push({
      id: q.id,
      label: q.label,
      presetId: q.presetId,
      presetName: typeof q.presetName === 'string' ? q.presetName : q.presetId,
      basisValue: Math.max(0, q.basisValue),
      basisUnit:
        q.basisUnit === 'm' || q.basisUnit === 'kpl' ? q.basisUnit : 'm²',
      summaryText: typeof q.summaryText === 'string' ? q.summaryText : '',
      subtotalEur:
        typeof q.subtotalEur === 'number' && Number.isFinite(q.subtotalEur)
          ? q.subtotalEur
          : 0,
      vatEur:
        typeof q.vatEur === 'number' && Number.isFinite(q.vatEur) ? q.vatEur : 0,
      totalEur: q.totalEur,
      geometry: sanitizeGeometry(q.geometry),
    });
  }
  return valid;
}

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,/i;
const FORBIDDEN_PARAM_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeRasterDataUrl(v: unknown): v is string {
  return typeof v === 'string' && SAFE_RASTER_DATA_URL_RE.test(v);
}

function sanitizeParams(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_PARAM_KEYS.has(key)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) {
      clean[key] = val;
    }
  }
  return clean;
}

function sanitizeSitePhotos(raw: unknown): SitePhoto[] {
  if (!Array.isArray(raw)) return [];
  const valid: SitePhoto[] = [];
  for (const item of raw) {
    if (valid.length >= MAX_SITE_PHOTOS) break;
    if (!item || typeof item !== 'object') continue;
    const photo = item as Partial<SitePhoto>;
    if (
      typeof photo.id === 'string' &&
      photo.id &&
      isSafeRasterDataUrl(photo.dataUrl)
    ) {
      valid.push({
        id: photo.id,
        dataUrl: photo.dataUrl,
        name: typeof photo.name === 'string' ? photo.name.slice(0, 80) : 'Kuva',
      });
    }
  }
  return valid;
}

export function sanitizeProject(raw: unknown): SavedProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<SavedProject>;
  const id = typeof p.id === 'string' && p.id ? p.id : createProjectId();
  const validGeom = sanitizeGeometry(p.geometry);
  const parsedDate =
    typeof p.updatedAt === 'string' && !Number.isNaN(Date.parse(p.updatedAt))
      ? p.updatedAt
      : new Date().toISOString();

  return {
    id,
    geometry: validGeom,
    geometrySource:
      p.geometrySource === 'mml' ||
      p.geometrySource === 'osm' ||
      p.geometrySource === 'manual'
        ? p.geometrySource
        : 'manual',
    parcelCode: typeof p.parcelCode === 'string' ? p.parcelCode : null,
    slopePct: typeof p.slopePct === 'number' && Number.isFinite(p.slopePct) ? p.slopePct : 0,
    presetId: typeof p.presetId === 'string' ? p.presetId : 'murske',
    params: sanitizeParams(p.params),
    unitPriceEur:
      typeof p.unitPriceEur === 'number' && Number.isFinite(p.unitPriceEur)
        ? p.unitPriceEur
        : 28,
    vatRatePct:
      typeof p.vatRatePct === 'number' && Number.isFinite(p.vatRatePct)
        ? p.vatRatePct
        : 25.5,
    company: {
      name: typeof p.company?.name === 'string' ? p.company.name : '',
      contact: typeof p.company?.contact === 'string' ? p.company.contact : '',
      projectTitle:
        typeof p.company?.projectTitle === 'string'
          ? p.company.projectTitle
          : 'Pihan mittaus- ja materiaaliarvio',
      address: typeof p.company?.address === 'string' ? p.company.address : '',
      logoDataUrl: isSafeRasterDataUrl(p.company?.logoDataUrl)
        ? p.company.logoDataUrl
        : undefined,
    },
    quoteItems: sanitizeQuoteItems(p.quoteItems),
    siteNote: typeof p.siteNote === 'string' ? p.siteNote.slice(0, 1200) : '',
    includeSiteNoteInPdf:
      typeof p.includeSiteNoteInPdf === 'boolean' ? p.includeSiteNoteInPdf : true,
    sitePhotos: sanitizeSitePhotos(p.sitePhotos),
    includeSitePhotosInPdf:
      typeof p.includeSitePhotosInPdf === 'boolean'
        ? p.includeSitePhotosInPdf
        : true,
    updatedAt: parsedDate,
  };
}

/**
 * LocalStorage implementation for multi-project persistence.
 * Swap this class for a SupabaseRepository once user accounts are enabled.
 */
class LocalStorageProjectRepository implements ProjectRepository {
  loadLibrary(): ProjectLibraryState | null {
    try {
      const rawV2 = window.localStorage.getItem(LIBRARY_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2) as ProjectLibraryState;
        if (parsed && Array.isArray(parsed.projects)) {
          const valid = parsed.projects
            .map(sanitizeProject)
            .filter((item): item is SavedProject => item !== null);
          if (valid.length > 0) {
            const activeId = valid.some((p) => p.id === parsed.activeProjectId)
              ? parsed.activeProjectId
              : valid[0]!.id;
            return { activeProjectId: activeId, projects: valid };
          }
        }
      }

      // Seamless one-time migration from v1 single-project storage
      const rawV1 = window.localStorage.getItem(LEGACY_KEY);
      if (rawV1) {
        const migrated = sanitizeProject(JSON.parse(rawV1));
        if (migrated) {
          return { activeProjectId: migrated.id, projects: [migrated] };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  saveLibrary(state: ProjectLibraryState): boolean {
    try {
      window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(state));
      return true;
    } catch {
      // QuotaExceededError or private browsing mode
      return false;
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(LIBRARY_KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Ignore storage access errors
    }
  }
}

export const projectRepository: ProjectRepository =
  new LocalStorageProjectRepository();
