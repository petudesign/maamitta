import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bucketAreaSqm, trackEvent } from './analytics/track';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  EMPTY_GEOMETRY,
  makeFreshProject,
  useProjectLibrary,
} from './hooks/useProjectLibrary';
import { useStatusToast } from './hooks/useStatusToast';
import {
  deleteVertexInGeometry,
  insertVertexInGeometry,
  moveVertexInGeometry,
} from './hooks/vertexGeometry';
import { calculateEstimate } from './engine/calculator';
import { summarizeGeometry } from './engine/geometry';
import {
  applyMargin,
  DEFAULT_PRICE_BOOK,
  resolvePresetDefaults,
  savePresetToPriceBook,
} from './engine/priceBook';
import { buildQuoteZoneItem } from './engine/quote';
import {
  bufferLineToCorridor,
  createCircleAtCenter,
  createRectangleAtCenter,
} from './engine/shapes';
import type {
  CompanyInfo,
  DrawTool,
  GeometrySource,
  LngLat,
  MeasurementGeometry,
  PriceBook,
  QuoteZoneItem,
  SitePhoto,
} from './engine/types';
import { getMessages, loadInitialLocale, type Locale, saveLocale } from './i18n';
import {
  fetchBuildingsInPolygon,
  pickBoundaryAtPoint,
  pointInRing,
} from './map/autoBoundary';
import {
  estimateTerrainSlope,
  formatSlopeDirection,
} from './map/elevation';
import {
  BASE_LAYERS,
  type BaseLayerId,
  FINLAND_BOUNDS,
  IS_MML_ENABLED,
} from './map/providers';
import { MAX_SITE_PHOTOS } from './export/imageCompress';
import { DEMO_YARD_GEOMETRY, DEMO_YARD_PARCEL_CODE } from './presets/demoYard';
import { getDefaultParamValues, getPresetById } from './presets/finland';
import { createProjectId, type SavedProject } from './store/projectStore';
import { priceBookRepository } from './store/priceBookStore';
import { BetaConsentBanner } from './ui/BetaConsentBanner';
import { CalculatorPanel } from './ui/CalculatorPanel';
import {
  MapCanvas,
  type MapCanvasHandle,
  type VertexRef,
} from './ui/MapCanvas';
import { ToolDock } from './ui/ToolDock';
import { TopBar } from './ui/TopBar';
import { NotFoundView } from './ui/NotFoundView';
import { QuoteItemsList } from './ui/QuoteItemsList';

export function App() {
  const [priceBook, setPriceBook] = useState<PriceBook>(() =>
    priceBookRepository.load()
  );
  const [locale, setLocale] = useState<Locale>(() => loadInitialLocale());
  const msg = useMemo(() => getMessages(locale), [locale]);

  const {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    initialProject: initial,
    storageWarning,
    setStorageWarning,
    syncActiveProject,
  } = useProjectLibrary(priceBook, locale);

  const handleChangeLocale = useCallback((next: Locale) => {
    setLocale(next);
    saveLocale(next);
    trackEvent('locale_switched', { locale: next });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === 'en'
        ? 'Maamitta — Map measurement & material calculator'
        : 'Maamitta — Karttamittaus ja materiaalilaskuri';
  }, [locale]);

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>('satellite');
  const [showParcels, setShowParcels] = useState<boolean>(IS_MML_ENABLED);
  const [showSoilMap, setShowSoilMap] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<DrawTool>('pan');
  const [showCrosshair, setShowCrosshair] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  );
  const crosshairHintShownRef = useRef(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mapLayersOpen, setMapLayersOpen] = useState(true);
  const { statusMessage, showStatus } = useStatusToast();
  const [isAutoSubtracting, setIsAutoSubtracting] = useState(false);
  const [isEstimatingSlope, setIsEstimatingSlope] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [canUndoClear, setCanUndoClear] = useState(false);
  const lastClearedRef = useRef<{
    geometry: MeasurementGeometry;
    geometrySource: GeometrySource;
    parcelCode: string | null;
    slopePct: number;
    quoteItems: QuoteZoneItem[];
  } | null>(null);
  const clearUndoTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<MeasurementGeometry[]>([]);
  const pickAbortRef = useRef<AbortController | null>(null);
  const slopeAbortRef = useRef<AbortController | null>(null);

  // Clean up timers & in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (clearUndoTimerRef.current)
        window.clearTimeout(clearUndoTimerRef.current);
      pickAbortRef.current?.abort();
      slopeAbortRef.current?.abort();
    };
  }, []);

  const [geometry, setGeometry] = useState<MeasurementGeometry>(
    initial.geometry
  );
  const [geometrySource, setGeometrySource] = useState<GeometrySource>(
    initial.geometrySource
  );
  const [parcelCode, setParcelCode] = useState<string | null>(
    initial.parcelCode
  );
  const [slopePct, setSlopePct] = useState<number>(initial.slopePct);
  const [presetId, setPresetId] = useState<string>(initial.presetId);
  const [quoteItems, setQuoteItems] = useState<QuoteZoneItem[]>(
    initial.quoteItems ?? []
  );

  const preset = useMemo(
    () => getPresetById(presetId, locale),
    [presetId, locale]
  );

  const [params, setParams] = useState<Record<string, number>>(initial.params);
  const [unitPriceEur, setUnitPriceEur] = useState<number>(
    initial.unitPriceEur
  );
  const [vatRatePct, setVatRatePct] = useState<number>(initial.vatRatePct);
  const [company, setCompany] = useState<CompanyInfo>(initial.company);
  const [siteNote, setSiteNote] = useState<string>(initial.siteNote ?? '');
  const [includeSiteNoteInPdf, setIncludeSiteNoteInPdf] = useState<boolean>(
    initial.includeSiteNoteInPdf ?? true
  );
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>(
    initial.sitePhotos ?? []
  );
  const [includeSitePhotosInPdf, setIncludeSitePhotosInPdf] = useState<boolean>(
    initial.includeSitePhotosInPdf ?? true
  );

  const mapRef = useRef<MapCanvasHandle | null>(null);

  // Keep active project synced in memory
  useEffect(() => {
    syncActiveProject({
      geometry,
      geometrySource,
      parcelCode,
      slopePct,
      presetId,
      params,
      unitPriceEur,
      vatRatePct,
      company,
      quoteItems,
      siteNote,
      includeSiteNoteInPdf,
      sitePhotos,
      includeSitePhotosInPdf,
    });
  }, [
    syncActiveProject,
    geometry,
    geometrySource,
    parcelCode,
    slopePct,
    presetId,
    params,
    unitPriceEur,
    vatRatePct,
    company,
    quoteItems,
    siteNote,
    includeSiteNoteInPdf,
    sitePhotos,
    includeSitePhotosInPdf,
  ]);

  const loadProjectIntoEditor = useCallback((proj: SavedProject) => {
    // Cancel any in-flight async requests belonging to the previous project
    pickAbortRef.current?.abort();
    slopeAbortRef.current?.abort();
    setIsAutoSubtracting(false);
    setIsEstimatingSlope(false);

    setActiveProjectId(proj.id);
    setGeometry(proj.geometry);
    setGeometrySource(proj.geometrySource);
    setParcelCode(proj.parcelCode);
    setSlopePct(proj.slopePct);
    setPresetId(proj.presetId);
    setParams(proj.params);
    setUnitPriceEur(proj.unitPriceEur);
    setVatRatePct(proj.vatRatePct);
    setCompany(proj.company);
    setQuoteItems(proj.quoteItems ?? []);
    setSiteNote(proj.siteNote ?? '');
    setIncludeSiteNoteInPdf(proj.includeSiteNoteInPdf ?? true);
    setSitePhotos(proj.sitePhotos ?? []);
    setIncludeSitePhotosInPdf(proj.includeSitePhotosInPdf ?? true);
    setStorageWarning(null);

    const focusGeom =
      proj.geometry.areaPoints.length > 0 || proj.geometry.linePoints.length > 0
        ? proj.geometry
        : proj.quoteItems?.[0]?.geometry;
    if (focusGeom) {
      mapRef.current?.fitGeometry(focusGeom, true);
    }
  }, []);

  const handleSelectProject = useCallback(
    (id: string) => {
      const target = projects.find((p) => p.id === id);
      if (target) loadProjectIntoEditor(target);
    },
    [projects, loadProjectIntoEditor]
  );

  const handleCreateProject = useCallback(() => {
    const fresh = makeFreshProject(company, locale, priceBook);
    setProjects((prev) => [fresh, ...prev]);
    loadProjectIntoEditor(fresh);
  }, [company, locale, priceBook, loadProjectIntoEditor]);

  const handleDuplicateProject = useCallback(
    (id: string) => {
      const source = projects.find((p) => p.id === id);
      if (!source) return;
      const copy: SavedProject = {
        ...source,
        id: createProjectId(),
        company: {
          ...source.company,
          projectTitle: `${source.company.projectTitle.trim() || (locale === 'en' ? 'Project' : 'Kohde')} (${locale === 'en' ? 'copy' : 'kopio'})`,
        },
        updatedAt: new Date().toISOString(),
      };
      setProjects((prev) => [copy, ...prev]);
      loadProjectIntoEditor(copy);
    },
    [projects, locale, loadProjectIntoEditor]
  );

  const handleRenameProject = useCallback(
    (id: string, title: string) => {
      if (id === activeProjectId) {
        setCompany((prev) => ({ ...prev, projectTitle: title }));
        return;
      }
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                company: { ...p.company, projectTitle: title },
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      );
    },
    [activeProjectId]
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      if (projects.length <= 1) return;
      const next = projects.filter((p) => p.id !== id);
      setProjects(next);
      if (id === activeProjectId && next[0]) {
        loadProjectIntoEditor(next[0]);
      }
    },
    [projects, activeProjectId, loadProjectIntoEditor]
  );

  const summary = useMemo(
    () => summarizeGeometry(geometry, slopePct),
    [geometry, slopePct]
  );

  const estimate = useMemo(
    () =>
      calculateEstimate({
        preset,
        summary,
        params,
        unitPriceEur,
        vatRatePct,
        marginPct: priceBook.marginPct,
        geometrySource,
        locale,
      }),
    [
      preset,
      summary,
      params,
      unitPriceEur,
      vatRatePct,
      priceBook.marginPct,
      geometrySource,
      locale,
    ]
  );

  const commitActiveCutout = useCallback(() => {
    setGeometry((prev) => {
      if (prev.activeCutout.length < 3) {
        return { ...prev, activeCutout: [] };
      }
      return {
        ...prev,
        cutouts: [...prev.cutouts, prev.activeCutout],
        activeCutout: [],
      };
    });
  }, []);

  const handleSelectTool = useCallback(
    (nextTool: DrawTool) => {
      if (activeTool === 'cutout' && nextTool !== 'cutout') {
        commitActiveCutout();
      }
      setActiveTool(nextTool);
      if (
        showCrosshair &&
        !crosshairHintShownRef.current &&
        (nextTool === 'area' || nextTool === 'cutout' || nextTool === 'line')
      ) {
        crosshairHintShownRef.current = true;
        showStatus(
          locale === 'en'
            ? 'Aim the crosshair and tap + Point — or tap directly on the map'
            : 'Kohdista tähtäin kulmaan ja paina + Piste — tai napauta suoraan karttaa',
          4200
        );
      }
    },
    [activeTool, commitActiveCutout, locale, showCrosshair, showStatus]
  );

  const pushUndoSnapshot = useCallback((snapshot: MeasurementGeometry) => {
    const stack = undoStackRef.current;
    stack.push({
      areaPoints: [...snapshot.areaPoints],
      cutouts: snapshot.cutouts.map((c) => [...c]),
      activeCutout: [...snapshot.activeCutout],
      linePoints: [...snapshot.linePoints],
    });
    if (stack.length > 30) stack.shift();
  }, []);

  const addPoint = useCallback(
    async (pt: LngLat, shiftKey = false) => {
      if (activeTool === 'pan') return;
      if (activeTool === 'pick') {
        const [[minLng, minLat], [maxLng, maxLat]] = FINLAND_BOUNDS;
        if (pt[0] < minLng || pt[0] > maxLng || pt[1] < minLat || pt[1] > maxLat) {
          showStatus(
            locale === 'en'
              ? 'Official parcel picking works in Finland — draw manually with the Area tool.'
              : 'Virallinen tonttipoiminta toimii Suomessa — voit piirtää alueen käsin Alue-työkalulla.',
            4200
          );
          return;
        }
        pickAbortRef.current?.abort();
        const controller = new AbortController();
        pickAbortRef.current = controller;

        const insideExistingArea =
          !shiftKey &&
          geometry.areaPoints.length >= 3 &&
          pointInRing(pt, geometry.areaPoints);

        showStatus(msg.status.fetchingBoundary, 0);
        let outcome;
        try {
          outcome = await pickBoundaryAtPoint(
            pt,
            insideExistingArea,
            controller.signal
          );
        } catch {
          if (!controller.signal.aborted) {
            showStatus(
              locale === 'en'
                ? 'Could not fetch boundary — try again or draw manually.'
                : 'Rajan haku epäonnistui — yritä uudelleen tai piirrä käsin.',
              3800
            );
          }
          return;
        }

        if (controller.signal.aborted) return;

        if (outcome.status === 'error') {
          showStatus(outcome.reason, 4000);
          return;
        }

        if (outcome.status === 'not_found') {
          showStatus(msg.status.notFound, 3200);
          return;
        }

        const picked = outcome.boundary;

        if (insideExistingArea && picked.isBuilding) {
          setGeometry((prev) => ({
            ...prev,
            cutouts: [...prev.cutouts, picked.points],
          }));
          showStatus(`${msg.status.subtractedPrefix} ${picked.label}`);
        } else {
          // Shift+Click archives the currently active measured zone into Selected items
          // before loading the newly clicked parcel!
          if (shiftKey && estimate.basisValue > 0) {
            setQuoteItems((prev) => [
              ...prev,
              buildQuoteZoneItem({
                existing: prev,
                parcelCode,
                locale,
                preset,
                estimate,
                geometry,
              }),
            ]);
          }

          setGeometrySource(picked.source);
          setParcelCode(picked.parcelCode ?? null);
          setGeometry((prev) => ({
            ...prev,
            areaPoints: picked.points,
            cutouts: [],
            activeCutout: [],
          }));

          // If a parcel or non-building area was picked, automatically subtract
          // any buildings inside it so gravel/mulch/lawn estimates exclude houses.
          if (!picked.isBuilding) {
            showStatus(msg.status.findingBuildingsInParcel(picked.label), 0);
            setIsAutoSubtracting(true);
            try {
              const buildings = await fetchBuildingsInPolygon(
                picked.points,
                controller.signal
              );
              if (controller.signal.aborted) return;
              if (buildings.length > 0) {
                setGeometry((prev) => ({
                  ...prev,
                  cutouts: buildings,
                }));
                showStatus(
                  msg.status.pickedWithBuildings(
                    picked.label,
                    buildings.length
                  ),
                  3600
                );
                trackEvent('parcel_picked', {
                  source: picked.source,
                  buildingsSubtracted: buildings.length,
                  shiftMulti: Boolean(shiftKey),
                });
              } else {
                showStatus(`${msg.status.pickedPrefix} ${picked.label}`, 2600);
                trackEvent('parcel_picked', {
                  source: picked.source,
                  buildingsSubtracted: 0,
                  shiftMulti: Boolean(shiftKey),
                });
              }
            } catch {
              if (!controller.signal.aborted) {
                showStatus(`${msg.status.pickedPrefix} ${picked.label}`, 2600);
              }
            } finally {
              if (!controller.signal.aborted) {
                setIsAutoSubtracting(false);
              }
            }
          } else {
            showStatus(`${msg.status.pickedPrefix} ${picked.label}`);
          }
        }
        return;
      }

      pushUndoSnapshot(geometry);
      const startingFreshFromAutoParcel =
        activeTool === 'area' && geometrySource !== 'manual';

      if (activeTool === 'area') {
        setGeometrySource('manual');
        setParcelCode(null);
      }

      setGeometry((prev) => {
        if (activeTool === 'area') {
          return startingFreshFromAutoParcel
            ? { ...prev, areaPoints: [pt], cutouts: [], activeCutout: [] }
            : { ...prev, areaPoints: [...prev.areaPoints, pt] };
        }
        if (activeTool === 'cutout') {
          return { ...prev, activeCutout: [...prev.activeCutout, pt] };
        }
        return { ...prev, linePoints: [...prev.linePoints, pt] };
      });
    },
    [
      activeTool,
      estimate,
      geometry,
      geometrySource,
      locale,
      msg.status,
      parcelCode,
      preset,
      showStatus,
    ]
  );

  const handlePlaceCrosshairPoint = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (center) {
      addPoint(center);
    }
  }, [addPoint]);

  const handleDragStart = useCallback(() => {
    pushUndoSnapshot(geometry);
  }, [geometry, pushUndoSnapshot]);

  const handleUndo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (previous) {
      setGeometry(previous);
      return;
    }

    setGeometry((prev) => {
      // 1. Prioritize the active drawing tool if it has points
      if (activeTool === 'area' && prev.areaPoints.length > 0) {
        return { ...prev, areaPoints: prev.areaPoints.slice(0, -1) };
      }
      if (activeTool === 'cutout') {
        if (prev.activeCutout.length > 0) {
          return { ...prev, activeCutout: prev.activeCutout.slice(0, -1) };
        }
        if (prev.cutouts.length > 0) {
          const last = prev.cutouts[prev.cutouts.length - 1] ?? [];
          return {
            ...prev,
            cutouts: prev.cutouts.slice(0, -1),
            activeCutout: last.slice(0, -1),
          };
        }
      }
      if (activeTool === 'line' && prev.linePoints.length > 0) {
        return { ...prev, linePoints: prev.linePoints.slice(0, -1) };
      }

      // 2. Fallback: allow Ctrl+Z / Undo from any tool (including Pick)
      if (prev.activeCutout.length > 0) {
        return { ...prev, activeCutout: prev.activeCutout.slice(0, -1) };
      }
      if (prev.cutouts.length > 0) {
        const last = prev.cutouts[prev.cutouts.length - 1] ?? [];
        return {
          ...prev,
          cutouts: prev.cutouts.slice(0, -1),
          activeCutout: last.slice(0, -1),
        };
      }
      if (prev.linePoints.length > 0) {
        return { ...prev, linePoints: prev.linePoints.slice(0, -1) };
      }
      if (prev.areaPoints.length > 0) {
        return { ...prev, areaPoints: prev.areaPoints.slice(0, -1) };
      }
      return prev;
    });
  }, [activeTool]);

  const handleClear = useCallback(() => {
    setConfirmClearOpen(false);
    const hadAnything =
      geometry.areaPoints.length > 0 ||
      geometry.cutouts.length > 0 ||
      geometry.activeCutout.length > 0 ||
      geometry.linePoints.length > 0 ||
      quoteItems.length > 0;

    if (hadAnything) {
      lastClearedRef.current = {
        geometry,
        geometrySource,
        parcelCode,
        slopePct,
        quoteItems,
      };
      setCanUndoClear(true);
      if (clearUndoTimerRef.current !== null) {
        window.clearTimeout(clearUndoTimerRef.current);
      }
      clearUndoTimerRef.current = window.setTimeout(() => {
        setCanUndoClear(false);
        lastClearedRef.current = null;
      }, 6000);
      showStatus(
        locale === 'en' ? 'All measurements cleared' : 'Kaikki mittaukset tyhjennetty',
        6000
      );
    }

    setGeometry(EMPTY_GEOMETRY);
    setGeometrySource('manual');
    setParcelCode(null);
    setSlopePct(0);
    setQuoteItems([]);
  }, [geometry, geometrySource, parcelCode, slopePct, quoteItems, locale, showStatus]);

  const handleUndoClear = useCallback(() => {
    const snap = lastClearedRef.current;
    if (!snap) return;
    if (clearUndoTimerRef.current !== null) {
      window.clearTimeout(clearUndoTimerRef.current);
      clearUndoTimerRef.current = null;
    }
    setGeometry(snap.geometry);
    setGeometrySource(snap.geometrySource);
    setParcelCode(snap.parcelCode);
    setSlopePct(snap.slopePct);
    setQuoteItems(snap.quoteItems);
    lastClearedRef.current = null;
    setCanUndoClear(false);
    showStatus(
      locale === 'en' ? 'Measurements restored' : 'Mittaukset palautettu',
      2200
    );
  }, [locale, showStatus]);

  const handleLoadDemoYard = useCallback(() => {
    const defaultPreset = getPresetById('murske', locale);
    const resolved = resolvePresetDefaults(defaultPreset, priceBook);
    setPresetId(defaultPreset.id);
    setParams(resolved.params);
    setUnitPriceEur(resolved.unitPriceEur);
    setGeometry(DEMO_YARD_GEOMETRY);
    setGeometrySource('mml');
    setParcelCode(DEMO_YARD_PARCEL_CODE);
    setSlopePct(0);
    setActiveTool('pick');
    mapRef.current?.fitGeometry(DEMO_YARD_GEOMETRY, true);
    showStatus(
      locale === 'en'
        ? 'Loaded real Helsinki parcel (building subtracted) — drag any corner to test!'
        : 'Esimerkkikohde ladattu Oulunkylästä (rakennus vähennetty) — kokeile vetää kulmia!',
      4200
    );
  }, [locale, priceBook, showStatus]);

  const handleClearCutouts = useCallback(() => {
    setGeometry((prev) => ({
      ...prev,
      cutouts: [],
      activeCutout: [],
    }));
  }, []);

  const handleAutoEstimateSlope = useCallback(async () => {
    if (geometry.areaPoints.length < 3) return;
    slopeAbortRef.current?.abort();
    const controller = new AbortController();
    slopeAbortRef.current = controller;

    setIsEstimatingSlope(true);
    showStatus(
      locale === 'en'
        ? 'Checking terrain elevation…'
        : 'Haetaan maaston korkeusprofiilia…',
      0
    );
    try {
      const res = await estimateTerrainSlope(
        geometry.areaPoints,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (!res) {
        showStatus(
          locale === 'en'
            ? 'Could not fetch elevation data — set slope manually.'
            : 'Korkeustietoa ei saatu — valitse kaltevuus käsin.'
        );
        return;
      }
      setSlopePct(res.estimatedSlopePct);
      trackEvent('slope_detected', { slopePct: res.estimatedSlopePct });
      const dirText = formatSlopeDirection(res.slopeDirection, locale);
      showStatus(
        locale === 'en'
          ? `Elevation drop ${res.dropM.toFixed(1)} m (${dirText}) → ${res.estimatedSlopePct}% slope`
          : `Korkeusero ${res.dropM.toFixed(1).replace('.', ',')} m (${dirText}) → kaltevuus ${res.estimatedSlopePct} %`,
        4200
      );
    } catch {
      if (!controller.signal.aborted) {
        showStatus(
          locale === 'en'
            ? 'Could not fetch elevation data — set slope manually.'
            : 'Korkeustietoa ei saatu — valitse kaltevuus käsin.',
          3600
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsEstimatingSlope(false);
      }
    }
  }, [geometry.areaPoints, locale, showStatus]);

  const handleAutoSubtractBuildings = useCallback(async () => {
    if (geometry.areaPoints.length < 3) return;
    pickAbortRef.current?.abort();
    const controller = new AbortController();
    pickAbortRef.current = controller;

    setIsAutoSubtracting(true);
    showStatus(msg.status.searchingBuildings, 0);
    try {
      const buildings = await fetchBuildingsInPolygon(
        geometry.areaPoints,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (buildings.length > 0) {
        setGeometry((prev) => ({
          ...prev,
          cutouts: buildings,
          activeCutout: [],
        }));
        showStatus(msg.status.buildingsSubtracted(buildings.length), 3200);
        trackEvent('buildings_subtracted', { count: buildings.length });
      } else {
        showStatus(msg.status.noBuildingsFound, 3000);
      }
    } catch {
      if (!controller.signal.aborted) {
        showStatus(
          locale === 'en'
            ? 'Building lookup failed — try again or use Cutout.'
            : 'Rakennusten haku epäonnistui — yritä uudelleen tai vähennä käsin.',
          3600
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsAutoSubtracting(false);
      }
    }
  }, [geometry.areaPoints, locale, msg.status, showStatus]);

  const handleMoveVertex = useCallback((target: VertexRef, nextPoint: LngLat) => {
    setGeometry((prev) => moveVertexInGeometry(prev, target, nextPoint));
  }, []);

  const handleInsertVertex = useCallback((target: VertexRef, point: LngLat) => {
    setGeometry((prev) => insertVertexInGeometry(prev, target, point));
  }, []);

  const handleDeleteVertex = useCallback(
    (target: VertexRef) => {
      pushUndoSnapshot(geometry);
      setGeometry((prev) => deleteVertexInGeometry(prev, target));
    },
    [geometry, pushUndoSnapshot]
  );

  const handleSelectPreset = useCallback(
    (nextId: string) => {
      const nextPreset = getPresetById(nextId);
      const resolved = resolvePresetDefaults(nextPreset, priceBook);
      setPresetId(nextPreset.id);
      setParams(resolved.params);
      setUnitPriceEur(resolved.unitPriceEur);
      trackEvent('preset_selected', { presetId: nextPreset.id });
      if (nextPreset.basis === 'line') {
        setActiveTool('line');
      } else {
        setActiveTool((curr) => (curr === 'line' ? 'area' : curr));
      }
    },
    [priceBook]
  );

  const handleChangePriceBook = useCallback((patch: Partial<PriceBook>) => {
    setPriceBook((prev) => {
      const next: PriceBook = {
        ...prev,
        ...patch,
        presets: patch.presets ?? prev.presets,
      };
      priceBookRepository.save(next);
      return next;
    });
  }, []);

  const handleSaveCurrentAsDefaults = useCallback(() => {
    const hasWaste = preset.parameters.some((p) => p.key === 'wastePct');
    const wasteVal = hasWaste ? params.wastePct : undefined;
    const nextBook = savePresetToPriceBook(
      priceBook,
      preset.id,
      unitPriceEur,
      wasteVal
    );
    const ok = priceBookRepository.save(nextBook);
    setPriceBook(nextBook);
    showStatus(
      ok
        ? locale === 'en'
          ? `Saved your default prices for ${preset.name}`
          : `Omat oletushinnat tallennettu (${preset.name})`
        : locale === 'en'
          ? 'Could not save prices — browser storage is full.'
          : 'Hintojen tallennus epäonnistui — selaimen tallennustila on täynnä.',
      3000
    );
  }, [locale, params.wastePct, preset, priceBook, showStatus, unitPriceEur]);

  const handleResetPriceBook = useCallback(() => {
    priceBookRepository.clear();
    const freshBook: PriceBook = { ...DEFAULT_PRICE_BOOK, presets: {} };
    setPriceBook(freshBook);
    const builtIn = getPresetById(preset.id, locale);
    setUnitPriceEur(builtIn.defaultUnitPriceEur);
    setParams(getDefaultParamValues(builtIn));
    showStatus(
      locale === 'en'
        ? 'Restored Maamitta default prices'
        : 'Maamitan oletushinnat palautettu',
      2800
    );
  }, [locale, preset.id, showStatus]);

  const handleLocateUser = useCallback(() => {
    if (!navigator.geolocation) {
      showStatus(
        locale === 'en'
          ? 'Geolocation is not supported in this browser.'
          : 'Selain ei tue sijaintitietoa.',
        3200
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo(pos.coords.longitude, pos.coords.latitude, 17);
      },
      () => {
        showStatus(
          locale === 'en'
            ? 'Location unavailable — check browser permissions.'
            : 'Sijaintia ei saatu — tarkista selaimen sijaintilupa.',
          3400
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [locale, showStatus]);

  const handleAddQuoteItem = useCallback(() => {
    if (estimate.basisValue <= 0) return;
    const item = buildQuoteZoneItem({
      existing: quoteItems,
      parcelCode,
      locale,
      preset,
      estimate,
      geometry,
    });
    setQuoteItems((prev) => [...prev, item]);
    setGeometry(EMPTY_GEOMETRY);
    setParcelCode(null);
    trackEvent('zone_added', {
      totalZones: quoteItems.length + 1,
      basisUnit: item.basisUnit,
    });
    showStatus(
      locale === 'en'
        ? `Added ${item.label} to quote — ready for next zone.`
        : `Lisätty ${item.label} tarjoukseen — voit mitata seuraavan alueen.`
    );
  }, [estimate, geometry, locale, parcelCode, preset, quoteItems, showStatus]);

  const handleFocusQuoteItem = useCallback(
    (id: string) => {
      const target = quoteItems.find((item) => item.id === id);
      if (!target) return;

      // Swap clicked saved item into the active editor so it highlights with edge pills
      // and updates the right panel, while archiving the current active zone back into the list.
      setQuoteItems((prev) => {
        const rest = prev.filter((item) => item.id !== id);
        if (estimate.basisValue > 0) {
          return [
            buildQuoteZoneItem({
              existing: rest,
              parcelCode,
              locale,
              preset,
              estimate,
              geometry,
            }),
            ...rest,
          ];
        }
        return rest;
      });

      setGeometry(target.geometry);
      setParcelCode(/^\d+-\d+/.test(target.label) ? target.label : null);
      setPresetId(target.presetId);
      mapRef.current?.fitGeometry(target.geometry, true);
    },
    [quoteItems, estimate, parcelCode, locale, preset, geometry]
  );

  const handleRemoveQuoteItem = useCallback((id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAddCustomQuoteItem = useCallback(
    (label: string, qty: number, unitLabel: string, unitPriceExclVat: number) => {
      const cleanLabel = label.trim();
      if (!cleanLabel || qty <= 0 || unitPriceExclVat < 0) return;
      const baseSubtotal = qty * unitPriceExclVat;
      const { totalWithMarginEur: subtotalEur } = applyMargin(
        baseSubtotal,
        priceBook.marginPct
      );
      const effectiveRate = qty > 0 ? subtotalEur / qty : unitPriceExclVat;
      const vatEur = subtotalEur * (vatRatePct / 100);
      const totalEur = subtotalEur + vatEur;
      const rateDisplay = Number(effectiveRate.toFixed(2));
      const item: QuoteZoneItem = {
        id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        label: cleanLabel,
        presetId: 'custom',
        presetName: locale === 'en' ? 'Custom' : 'Oma rivi',
        basisValue: qty,
        basisUnit: 'kpl',
        summaryText: `${qty} ${unitLabel || (locale === 'en' ? 'pcs' : 'kpl')} × ${rateDisplay} €`,
        subtotalEur,
        vatEur,
        totalEur,
        geometry: EMPTY_GEOMETRY,
      };
      setQuoteItems((prev) => [...prev, item]);
      trackEvent('zone_added', {
        totalZones: quoteItems.length + 1,
        basisUnit: 'kpl',
      });
    },
    [locale, priceBook.marginPct, quoteItems.length, vatRatePct]
  );

  const handleConvertLineToCorridor = useCallback(
    (widthM: number) => {
      if (geometry.linePoints.length < 2) return;
      const poly = bufferLineToCorridor(geometry.linePoints, widthM);
      if (poly.length < 3) return;
      const nextGeom: MeasurementGeometry = {
        areaPoints: poly,
        cutouts: [],
        activeCutout: [],
        linePoints: [],
      };
      setGeometry(nextGeom);
      setGeometrySource('manual');
      setParcelCode(null);
      setActiveTool('area');
      if (preset.basis === 'line') {
        const gravel = getPresetById('murske', locale);
        const resolved = resolvePresetDefaults(gravel, priceBook);
        setPresetId(gravel.id);
        setParams(resolved.params);
        setUnitPriceEur(resolved.unitPriceEur);
      }
      mapRef.current?.fitGeometry(nextGeom, true);
      showStatus(
        locale === 'en'
          ? `Converted line to ${widthM} m wide corridor`
          : `Linja muunnettu ${String(widthM).replace('.', ',')} m leveäksi kaistaksi`,
        3000
      );
    },
    [geometry.linePoints, locale, preset.basis, priceBook, showStatus]
  );

  const handleInsertQuickShape = useCallback(
    (kind: 'rect' | 'circle', dim1: number, dim2 = dim1) => {
      const center = mapRef.current?.getCenter();
      if (!center) return;
      const ring =
        kind === 'rect'
          ? createRectangleAtCenter(center, dim1, dim2)
          : createCircleAtCenter(center, dim1, 24);
      const nextGeom: MeasurementGeometry = {
        areaPoints: ring,
        cutouts: [],
        activeCutout: [],
        linePoints: [],
      };
      setGeometry(nextGeom);
      setGeometrySource('manual');
      setParcelCode(null);
      setActiveTool('area');
      mapRef.current?.fitGeometry(nextGeom, true);
    },
    []
  );

  const handleExportGeo = useCallback(
    async (format: 'geojson' | 'kml') => {
      try {
        const { downloadGeoJson, downloadKml } = await import(
          './export/geoExport'
        );
        const payload = {
          projectTitle: company.projectTitle,
          parcelCode,
          geometry,
          quoteItems,
        };
        if (format === 'geojson') {
          downloadGeoJson(payload);
        } else {
          downloadKml(payload);
        }
      } catch {
        showStatus(
          locale === 'en'
            ? 'Export failed — reload the page and try again.'
            : 'Vienti epäonnistui — lataa sivu uudelleen ja yritä uudelleen.',
          3800
        );
      }
    },
    [company.projectTitle, geometry, locale, parcelCode, quoteItems, showStatus]
  );

  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true);
    try {
      const [{ renderCleanPdfMapSnapshot }, { downloadPdfQuote }] =
        await Promise.all([
          import('./export/mapSnapshot'),
          import('./export/pdfQuote'),
        ]);
      const snapshot = await renderCleanPdfMapSnapshot({
        baseLayer,
        geometry,
        extraGeometries: quoteItems.map((q) => q.geometry),
        locale,
      });
      downloadPdfQuote({
        company,
        parcelCode,
        summary,
        estimate,
        quoteItems,
        siteNote,
        includeSiteNoteInPdf,
        sitePhotos,
        includeSitePhotosInPdf,
        mapSnapshotDataUrl: snapshot,
        mapAttribution: BASE_LAYERS[baseLayer].attribution,
        locale,
      });
      trackEvent('pdf_exported', {
        zoneCount: quoteItems.length + (estimate.basisValue > 0 ? 1 : 0),
        hasLogo: Boolean(company.logoDataUrl),
        areaBucket: bucketAreaSqm(summary.effectiveAreaSqm),
        presetId: preset.id,
        locale,
      });
    } catch {
      showStatus(
        locale === 'en'
          ? 'PDF export failed — try again or remove large photos.'
          : 'PDF-vienti epäonnistui — yritä uudelleen tai tarkista liitetyt kuvat.',
        4200
      );
    } finally {
      setIsExportingPdf(false);
    }
  }, [
    company,
    parcelCode,
    summary,
    estimate,
    quoteItems,
    siteNote,
    includeSiteNoteInPdf,
    sitePhotos,
    includeSitePhotosInPdf,
    baseLayer,
    geometry,
    preset.id,
    locale,
    showStatus,
  ]);

  const hasGeometry =
    geometry.areaPoints.length > 0 ||
    geometry.cutouts.length > 0 ||
    geometry.activeCutout.length > 0 ||
    geometry.linePoints.length > 0;

  const canUndo = hasGeometry;

  const handleToggleCrosshair = useCallback(
    () => setShowCrosshair((prev) => !prev),
    []
  );
  const handleEscape = useCallback(() => {
    setMobileSheetOpen(false);
    setConfirmClearOpen(false);
  }, []);

  useKeyboardShortcuts({
    showCrosshair,
    onSelectTool: handleSelectTool,
    onUndo: handleUndo,
    onToggleCrosshair: handleToggleCrosshair,
    onPlaceCrosshairPoint: handlePlaceCrosshairPoint,
    onEscape: handleEscape,
  });

  const handleFitSelection = useCallback(() => {
    const merged: MeasurementGeometry = {
      areaPoints: [
        ...geometry.areaPoints,
        ...quoteItems.flatMap((q) => q.geometry.areaPoints),
      ],
      cutouts: [
        ...geometry.cutouts,
        ...quoteItems.flatMap((q) => q.geometry.cutouts),
      ],
      activeCutout: geometry.activeCutout,
      linePoints: [
        ...geometry.linePoints,
        ...quoteItems.flatMap((q) => q.geometry.linePoints),
      ],
    };
    mapRef.current?.fitGeometry(merged, true);
  }, [geometry, quoteItems]);

  const savedGeometries = useMemo(
    () => quoteItems.map((q) => q.geometry),
    [quoteItems]
  );

  const isUnknownRoute =
    typeof window !== 'undefined' &&
    window.location.pathname !== '/' &&
    window.location.pathname !== '/index.html';

  if (isUnknownRoute) {
    return <NotFoundView locale={locale} />;
  }

  return (
    <div className="app-shell" data-base-layer={baseLayer}>
      <a href="#calculator-panel" className="skip-link">
        {locale === 'en' ? 'Skip to calculator' : 'Siirry laskuriin'}
      </a>
      <main className="map-stage">
        <MapCanvas
          ref={mapRef}
          locale={locale}
          baseLayer={baseLayer}
          showParcels={showParcels}
          showSoilMap={showSoilMap}
          geometry={geometry}
          savedGeometries={savedGeometries}
          activeTool={activeTool}
          showCrosshair={showCrosshair}
          onMapClick={addPoint}
          onDragStart={handleDragStart}
          onMoveVertex={handleMoveVertex}
          onInsertVertex={handleInsertVertex}
          onDeleteVertex={handleDeleteVertex}
        />

        <TopBar
          locale={locale}
          onChangeLocale={handleChangeLocale}
          baseLayer={baseLayer}
          showParcels={showParcels}
          showSoilMap={showSoilMap}
          showCrosshair={showCrosshair}
          hasSelection={hasGeometry || quoteItems.length > 0}
          onSelectBaseLayer={setBaseLayer}
          onToggleParcels={() => setShowParcels((prev) => !prev)}
          onToggleSoilMap={() => setShowSoilMap((prev) => !prev)}
          onToggleCrosshair={() => setShowCrosshair((prev) => !prev)}
          onSelectLocation={(lng, lat, label) => {
            mapRef.current?.flyTo(lng, lat, 18);
            setCompany((prev) => ({ ...prev, address: label }));
            trackEvent('search_selected', { locale });
          }}
          onLocateUser={handleLocateUser}
          onFitSelection={handleFitSelection}
        />

        {quoteItems.length > 0 && (
          <div className="map-layers-box">
            <button
              type="button"
              className="map-layers-pill tabular-nums"
              onClick={() => setMapLayersOpen((o) => !o)}
              aria-expanded={mapLayersOpen}
            >
              <Layers size={14} />
              <span>
                {locale === 'en'
                  ? `Selected (${quoteItems.length})`
                  : `Valitut kohteet (${quoteItems.length})`}
              </span>
              {mapLayersOpen ? (
                <ChevronUp size={14} color="var(--ink-muted)" />
              ) : (
                <ChevronDown size={14} color="var(--ink-muted)" />
              )}
            </button>

            {mapLayersOpen && (
              <QuoteItemsList
                items={quoteItems}
                locale={locale}
                onFocusItem={handleFocusQuoteItem}
                onRemoveItem={handleRemoveQuoteItem}
              />
            )}
          </div>
        )}

        <ToolDock
          locale={locale}
          activeTool={activeTool}
          summary={summary}
          statusMessage={statusMessage}
          onUndoClear={canUndoClear ? handleUndoClear : undefined}
          isConfirmingClear={confirmClearOpen}
          clearItemCount={quoteItems.length + (hasGeometry ? 1 : 0)}
          canUndo={canUndo}
          hasGeometry={hasGeometry}
          hasClearable={hasGeometry || quoteItems.length > 0}
          showCrosshair={showCrosshair}
          onSelectTool={handleSelectTool}
          onPlaceCrosshairPoint={handlePlaceCrosshairPoint}
          onUndo={handleUndo}
          onRequestClear={() => setConfirmClearOpen(true)}
          onConfirmClear={handleClear}
          onCancelClear={() => setConfirmClearOpen(false)}
          onOpenMobileSheet={() => setMobileSheetOpen(true)}
        />
      </main>

      <CalculatorPanel
        locale={locale}
        isOpenMobile={mobileSheetOpen}
        onCloseMobile={() => setMobileSheetOpen(false)}
        onLoadDemoYard={handleLoadDemoYard}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        quoteItems={quoteItems}
        onAddQuoteItem={handleAddQuoteItem}
        onAddCustomQuoteItem={handleAddCustomQuoteItem}
        onFocusQuoteItem={handleFocusQuoteItem}
        onRemoveQuoteItem={handleRemoveQuoteItem}
        onConvertLineToCorridor={handleConvertLineToCorridor}
        onInsertQuickShape={handleInsertQuickShape}
        onExportGeo={handleExportGeo}
        summary={summary}
        parcelCode={parcelCode}
        activeTool={activeTool}
        slopePct={slopePct}
        isEstimatingSlope={isEstimatingSlope}
        hasActiveCutout={geometry.activeCutout.length >= 3}
        isAutoSubtracting={isAutoSubtracting}
        onChangeSlopePct={setSlopePct}
        onAutoEstimateSlope={handleAutoEstimateSlope}
        onCommitCutout={commitActiveCutout}
        onAutoSubtractBuildings={handleAutoSubtractBuildings}
        onClearCutouts={handleClearCutouts}
        preset={preset}
        params={params}
        unitPriceEur={unitPriceEur}
        vatRatePct={vatRatePct}
        priceBook={priceBook}
        onChangePriceBook={handleChangePriceBook}
        onSaveCurrentAsDefaults={handleSaveCurrentAsDefaults}
        onResetPriceBook={handleResetPriceBook}
        estimate={estimate}
        company={company}
        siteNote={siteNote}
        includeSiteNoteInPdf={includeSiteNoteInPdf}
        sitePhotos={sitePhotos}
        includeSitePhotosInPdf={includeSitePhotosInPdf}
        storageWarning={storageWarning}
        onChangeSiteNote={setSiteNote}
        onToggleIncludeSiteNote={setIncludeSiteNoteInPdf}
        onAddSitePhotos={(added) =>
          setSitePhotos((prev) => [...prev, ...added].slice(0, MAX_SITE_PHOTOS))
        }
        onRemoveSitePhoto={(id) =>
          setSitePhotos((prev) => prev.filter((ph) => ph.id !== id))
        }
        onToggleIncludeSitePhotos={setIncludeSitePhotosInPdf}
        onSelectPreset={handleSelectPreset}
        onChangeParam={(key, value) =>
          setParams((prev) => ({ ...prev, [key]: value }))
        }
        onChangeUnitPrice={setUnitPriceEur}
        onChangeVatRate={setVatRatePct}
        onChangeCompany={(patch) =>
          setCompany((prev) => ({ ...prev, ...patch }))
        }
        isExportingPdf={isExportingPdf}
        onExportPdf={handleExportPdf}
      />

      <BetaConsentBanner locale={locale} />
    </div>
  );
}
