import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PRICE_BOOK,
  resolvePresetDefaults,
} from '../engine/priceBook';
import type {
  CompanyInfo,
  GeometrySource,
  MeasurementGeometry,
  PriceBook,
  QuoteZoneItem,
  SitePhoto,
} from '../engine/types';
import type { Locale } from '../i18n';
import { DEFAULT_VAT_RATE_PCT, getPresetById } from '../presets/finland';
import {
  createProjectId,
  projectRepository,
  type SavedProject,
} from '../store/projectStore';

export const EMPTY_GEOMETRY: MeasurementGeometry = {
  areaPoints: [],
  cutouts: [],
  activeCutout: [],
  linePoints: [],
};

const DEFAULT_COMPANY: CompanyInfo = {
  name: '',
  contact: '',
  projectTitle: 'Pihan mittaus- ja materiaaliarvio',
  address: '',
};

export function makeFreshProject(
  companySeed?: Partial<CompanyInfo>,
  locale: Locale = 'fi',
  priceBook: PriceBook = DEFAULT_PRICE_BOOK
): SavedProject {
  const defaultPreset = getPresetById('murske', locale);
  const resolved = resolvePresetDefaults(defaultPreset, priceBook);
  return {
    id: createProjectId(),
    geometry: EMPTY_GEOMETRY,
    geometrySource: 'manual',
    parcelCode: null,
    slopePct: 0,
    presetId: defaultPreset.id,
    params: resolved.params,
    unitPriceEur: resolved.unitPriceEur,
    vatRatePct: DEFAULT_VAT_RATE_PCT,
    company: {
      ...DEFAULT_COMPANY,
      projectTitle:
        locale === 'en'
          ? 'Site measurement & material estimate'
          : DEFAULT_COMPANY.projectTitle,
      name: companySeed?.name ?? '',
      contact: companySeed?.contact ?? '',
      logoDataUrl: companySeed?.logoDataUrl,
    },
    quoteItems: [],
    siteNote: '',
    includeSiteNoteInPdf: true,
    sitePhotos: [],
    includeSitePhotosInPdf: true,
    updatedAt: new Date().toISOString(),
  };
}

export interface ActiveProjectSnapshot {
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
}

export function useProjectLibrary(
  priceBook: PriceBook,
  locale: Locale
) {
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const initialLib = useMemo(() => {
    const loaded = projectRepository.loadLibrary();
    if (loaded) return loaded;
    const first = makeFreshProject(undefined, 'fi', priceBook);
    return { activeProjectId: first.id, projects: [first] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [projects, setProjects] = useState<SavedProject[]>(initialLib.projects);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    initialLib.activeProjectId
  );

  const initialProject = useMemo(
    () =>
      initialLib.projects.find((p) => p.id === initialLib.activeProjectId) ??
      initialLib.projects[0]!,
    [initialLib]
  );

  const latestLibraryRef = useRef({ activeProjectId, projects });

  // Debounced localStorage persistence (avoids 60fps serialization during vertex drag)
  useEffect(() => {
    latestLibraryRef.current = { activeProjectId, projects };
    const timer = window.setTimeout(() => {
      const ok = projectRepository.saveLibrary(latestLibraryRef.current);
      if (!ok) {
        setStorageWarning(
          locale === 'en'
            ? 'Browser storage is full — remove a site photo or old project to save changes.'
            : 'Selaimen tallennustila on täynnä — poista kuva tai vanha kohde tallentaaksesi muutokset.'
        );
      } else {
        setStorageWarning(null);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, projects, locale]);

  // Flush pending project edits on tab close / reload
  useEffect(() => {
    const flush = () => projectRepository.saveLibrary(latestLibraryRef.current);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  const syncActiveProject = useCallback(
    (snapshot: ActiveProjectSnapshot) => {
      const updatedAt = new Date().toISOString();
      setProjects((prev) =>
        prev.map((p) =>
          p.id === activeProjectId ? { ...p, ...snapshot, updatedAt } : p
        )
      );
    },
    [activeProjectId]
  );

  return {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    initialProject,
    storageWarning,
    setStorageWarning,
    syncActiveProject,
  };
}
