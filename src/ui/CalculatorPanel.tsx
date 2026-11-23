import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CopyPlus,
  ExternalLink,
  FileDown,
  FolderOpen,
  HelpCircle,
  ImagePlus,
  Layers,
  MessageSquare,
  Pencil,
  Plus,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatArea,
  formatEur,
  formatLength,
  formatNumber,
} from '../engine/format';
import { summarizeGeometry } from '../engine/geometry';
import type {
  CalculationResult,
  CompanyInfo,
  DrawTool,
  MaterialPreset,
  MeasurementSummary,
  QuoteZoneItem,
} from '../engine/types';
import { getMessages, type Locale } from '../i18n';
import { getPresets } from '../presets/finland';
import type { SavedProject } from '../store/projectStore';
import { QuoteItemsList } from './QuoteItemsList';

interface CalculatorPanelProps {
  locale: Locale;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onLoadDemoYard: () => void;
  projects: SavedProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, title: string) => void;
  onDeleteProject: (id: string) => void;
  quoteItems: QuoteZoneItem[];
  onAddQuoteItem: () => void;
  onAddCustomQuoteItem: (
    label: string,
    qty: number,
    unitLabel: string,
    unitPriceExclVat: number
  ) => void;
  onFocusQuoteItem: (id: string) => void;
  onRemoveQuoteItem: (id: string) => void;
  onConvertLineToCorridor: (widthM: number) => void;
  onInsertQuickShape: (kind: 'rect' | 'circle', dim1: number, dim2?: number) => void;
  onExportGeo: (format: 'geojson' | 'kml') => void;
  summary: MeasurementSummary;
  parcelCode: string | null;
  activeTool: DrawTool;
  slopePct: number;
  isEstimatingSlope: boolean;
  hasActiveCutout: boolean;
  isAutoSubtracting: boolean;
  onChangeSlopePct: (slope: number) => void;
  onAutoEstimateSlope: () => void;
  onCommitCutout: () => void;
  onAutoSubtractBuildings: () => void;
  onClearCutouts: () => void;
  preset: MaterialPreset;
  params: Record<string, number>;
  unitPriceEur: number;
  vatRatePct: number;
  estimate: CalculationResult;
  company: CompanyInfo;
  onSelectPreset: (presetId: string) => void;
  onChangeParam: (key: string, value: number) => void;
  onChangeUnitPrice: (price: number) => void;
  onChangeVatRate: (vat: number) => void;
  onChangeCompany: (patch: Partial<CompanyInfo>) => void;
  isExportingPdf: boolean;
  onExportPdf: () => void;
}

export function CalculatorPanel({
  locale,
  isOpenMobile,
  onCloseMobile,
  onLoadDemoYard,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  quoteItems,
  onAddQuoteItem,
  onAddCustomQuoteItem,
  onFocusQuoteItem,
  onRemoveQuoteItem,
  onConvertLineToCorridor,
  onInsertQuickShape,
  onExportGeo,
  summary,
  parcelCode,
  activeTool,
  slopePct,
  isEstimatingSlope,
  hasActiveCutout,
  isAutoSubtracting,
  onChangeSlopePct,
  onAutoEstimateSlope,
  onCommitCutout,
  onAutoSubtractBuildings,
  onClearCutouts,
  preset,
  params,
  unitPriceEur,
  vatRatePct,
  estimate,
  company,
  onSelectPreset,
  onChangeParam,
  onChangeUnitPrice,
  onChangeVatRate,
  onChangeCompany,
  isExportingPdf,
  onExportPdf,
}: CalculatorPanelProps) {
  const t = getMessages(locale).panel;
  const presets = getPresets(locale);
  const hasRelevantMeasure = estimate.basisValue > 0;
  const hasExportableContent = hasRelevantMeasure || quoteItems.length > 0;
  const [copiedParcel, setCopiedParcel] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [layersSectionOpen, setLayersSectionOpen] = useState(true);
  const [quickShapeOpen, setQuickShapeOpen] = useState(false);
  const [rectW, setRectW] = useState(10);
  const [rectH, setRectH] = useState(5);
  const [circleR, setCircleR] = useState(3);
  const [corridorWidthM, setCorridorWidthM] = useState(3.5);
  const [customRowOpen, setCustomRowOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('h');
  const [customPrice, setCustomPrice] = useState(85);
  const projectSwitcherRef = useRef<HTMLDivElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const summaryCopyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (summaryCopyTimerRef.current !== null) {
        window.clearTimeout(summaryCopyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!projectsOpen && !helpOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        projectsOpen &&
        projectSwitcherRef.current &&
        !projectSwitcherRef.current.contains(target)
      ) {
        setProjectsOpen(false);
      }
      if (helpOpen && helpRef.current && !helpRef.current.contains(target)) {
        setHelpOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProjectsOpen(false);
        setHelpOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectsOpen, helpOpen]);

  const projectAreas = useMemo(() => {
    const map = new Map<string, number>();
    for (const proj of projects) {
      map.set(
        proj.id,
        summarizeGeometry(proj.geometry, proj.slopePct).effectiveAreaSqm
      );
    }
    return map;
  }, [projects]);

  const handleCopySummary = async () => {
    if (!hasExportableContent) return;
    const lines: string[] = [];
    const title = company.projectTitle.trim() || 'Maamitta';
    lines.push(title);
    if (company.address.trim()) lines.push(company.address.trim());
    if (parcelCode) {
      lines.push(
        `${locale === 'en' ? 'Parcel' : 'Kiinteistötunnus'}: ${parcelCode}`
      );
    }

    if (hasRelevantMeasure) {
      const measureText =
        preset.basis === 'area'
          ? formatArea(summary.effectiveAreaSqm, locale)
          : formatLength(summary.lineLengthM, locale);
      const keyMetrics = estimate.lines
        .map((l) => `${l.label}: ${l.value}`)
        .join(' · ');
      lines.push(
        `${preset.name} (${measureText}) — ${keyMetrics}`
      );
      lines.push(
        `${locale === 'en' ? 'Estimate (incl. VAT)' : 'Arvio (sis. ALV)'}: ${formatEur(estimate.totalEur, locale)}`
      );
    }

    if (quoteItems.length > 0) {
      lines.push('');
      lines.push(
        locale === 'en'
          ? `Selected items (${quoteItems.length}):`
          : `Valitut kohteet (${quoteItems.length}):`
      );
      for (const item of quoteItems) {
        const m =
          item.basisUnit === 'm²'
            ? formatArea(item.basisValue, locale)
            : formatLength(item.basisValue, locale);
        lines.push(
          `- ${item.label}: ${m} · ${formatEur(item.totalEur, locale)}`
        );
      }
      const grandTotal =
        quoteItems.reduce((acc, q) => acc + q.totalEur, 0) +
        (hasRelevantMeasure ? estimate.totalEur : 0);
      lines.push(
        `${locale === 'en' ? 'Grand total' : 'Yhteensä'}: ${formatEur(grandTotal, locale)}`
      );
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      if (summaryCopyTimerRef.current !== null) {
        window.clearTimeout(summaryCopyTimerRef.current);
      }
      summaryCopyTimerRef.current = window.setTimeout(() => {
        setCopiedSummary(false);
        summaryCopyTimerRef.current = null;
      }, 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleCopyParcel = async () => {
    if (!parcelCode) return;
    try {
      await navigator.clipboard.writeText(parcelCode);
      setCopiedParcel(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedParcel(false);
        copyTimerRef.current = null;
      }, 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 320;
        const maxH = 120;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        onChangeCompany({ logoDataUrl: canvas.toDataURL('image/png') });
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <aside
      id="calculator-panel"
      className="panel"
      data-open={isOpenMobile}
      aria-label={t.heading}
    >
      <div className="panel-header">
        <div>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 650,
              letterSpacing: '-0.015em',
            }}
          >
            {t.heading}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
            {activeTool === 'pan' &&
              (locale === 'en'
                ? 'Pan & zoom freely · choose Pick or Area to measure'
                : 'Tutki karttaa vapaasti · valitse Poimi tai Alue mitataksesi')}
            {activeTool === 'pick' &&
              (locale === 'en'
                ? 'Click to pick · Shift+Click to add multiple parcels'
                : 'Klikkaa poimiaksesi · Shift+klikkaus valitsee useamman')}
            {activeTool === 'area' && t.hintArea}
            {activeTool === 'cutout' && t.hintCutout}
            {activeTool === 'line' && t.hintLine}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="project-switcher" ref={helpRef}>
            <button
              type="button"
              className="project-trigger-btn"
              onClick={() => {
                setHelpOpen((h) => !h);
                setProjectsOpen(false);
              }}
              aria-expanded={helpOpen}
              aria-label={locale === 'en' ? 'Quick guide' : 'Pikaohje'}
              data-tooltip={
                helpOpen
                  ? undefined
                  : locale === 'en'
                    ? 'Quick guide'
                    : 'Pikaohje'
              }
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
            >
              <HelpCircle size={18} strokeWidth={1.9} />
            </button>
            {helpOpen && (
              <div className="help-popover">
                <div className="popover-heading">
                  {locale === 'en' ? 'Quick guide' : 'Pikaohje'}
                </div>
                <ul className="help-list">
                  <li>
                    <strong>{locale === 'en' ? 'Pick:' : 'Poimi:'}</strong>{' '}
                    {locale === 'en'
                      ? 'Click any Finnish parcel to auto-select its boundary and subtract buildings.'
                      : 'Klikkaa tonttia kartalla — rajat ja rakennusten vähennys haetaan automaattisesti.'}
                  </li>
                  <li>
                    <strong>Shift + {locale === 'en' ? 'click:' : 'klikkaus:'}</strong>{' '}
                    {locale === 'en'
                      ? 'Select multiple parcels into the same quote.'
                      : 'Valitse useampi tontti samaan tarjoukseen.'}
                  </li>
                  <li>
                    <strong>{locale === 'en' ? 'Edit corners:' : 'Muokkaa kulmia:'}</strong>{' '}
                    {locale === 'en'
                      ? 'Drag blue dots to move, drag small white dots to add, right-click to delete.'
                      : 'Vedä sinisiä pisteitä siirtääksesi, pieniä valkoisia lisätäksesi, oikea klikkaus poistaa.'}
                  </li>
                  <li>
                    <strong>{locale === 'en' ? 'Shortcuts:' : 'Pikanäppäimet:'}</strong>{' '}
                    <code>P</code> {locale === 'en' ? 'Pick' : 'Poimi'} ·{' '}
                    <code>A</code> {locale === 'en' ? 'Area' : 'Alue'} ·{' '}
                    <code>V</code> {locale === 'en' ? 'Cut' : 'Vähennä'} ·{' '}
                    <code>L</code> {locale === 'en' ? 'Line' : 'Linja'} ·{' '}
                    <code>⌘Z</code>
                  </li>
                </ul>
                <div className="help-footer">
                  <span className="help-privacy">
                    {locale === 'en'
                      ? 'No cookies · projects stay in your browser.'
                      : 'Ei evästeitä · tiedot tallentuvat vain selaimellesi.'}
                  </span>
                  <a
                    className="help-feedback-link"
                    href="mailto:?subject=Maamitta%20palaute"
                  >
                    <MessageSquare size={12} />
                    {locale === 'en' ? 'Send feedback' : 'Anna palautetta'}
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="project-switcher" ref={projectSwitcherRef}>
            <button
              type="button"
              className="project-trigger-btn"
              onClick={() => setProjectsOpen((p) => !p)}
              aria-expanded={projectsOpen}
              aria-label={
                locale === 'en'
                  ? `Saved projects (${projects.length})`
                  : `Tallennetut projektit (${projects.length})`
              }
              data-tooltip={
                projectsOpen
                  ? undefined
                  : locale === 'en'
                    ? 'Saved projects'
                    : 'Tallennetut projektit'
              }
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
            >
              <FolderOpen size={19} strokeWidth={1.9} />
              <span className="project-count-badge">{projects.length}</span>
            </button>
            {projectsOpen && (
              <div className="project-popover">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span className="popover-heading">
                    {locale === 'en' ? 'Saved projects' : 'Tallennetut kohteet'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ minHeight: 28, padding: '0 9px', fontSize: 12 }}
                    onClick={() => {
                      onCreateProject();
                      setProjectsOpen(false);
                    }}
                  >
                    <Plus size={13} />
                    {locale === 'en' ? 'New' : 'Uusi'}
                  </button>
                </div>
                {projects.map((proj) => {
                  const projArea = projectAreas.get(proj.id) ?? 0;
                  const metaParts = [
                    projArea > 0 ? formatArea(projArea, locale) : null,
                    proj.parcelCode || proj.company.address.trim() || null,
                  ].filter(Boolean);

                  return (
                    <div
                      key={proj.id}
                      className="project-list-item"
                      data-active={proj.id === activeProjectId}
                      onClick={() => {
                        onSelectProject(proj.id);
                        setProjectsOpen(false);
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {proj.company.projectTitle.trim() ||
                            (locale === 'en'
                              ? 'Untitled project'
                              : 'Nimetön kohde')}
                        </div>
                        <div className="project-item-sub tabular-nums">
                          {metaParts.join(' · ') ||
                            new Intl.DateTimeFormat(
                              locale === 'en' ? 'en-GB' : 'fi-FI'
                            ).format(new Date(proj.updatedAt))}
                        </div>
                      </div>
                      <div className="project-item-actions">
                        <button
                          type="button"
                          className="project-item-action"
                          title={locale === 'en' ? 'Rename' : 'Nimeä uudelleen'}
                          aria-label={
                            locale === 'en' ? 'Rename' : 'Nimeä uudelleen'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextTitle = window.prompt(
                              locale === 'en'
                                ? 'Project name:'
                                : 'Kohteen nimi:',
                              proj.company.projectTitle
                            );
                            if (nextTitle !== null && nextTitle.trim()) {
                              onRenameProject(proj.id, nextTitle.trim());
                            }
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="project-item-action"
                          title={
                            locale === 'en'
                              ? 'Duplicate project'
                              : 'Monista kohde'
                          }
                          aria-label={
                            locale === 'en'
                              ? 'Duplicate project'
                              : 'Monista kohde'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateProject(proj.id);
                          }}
                        >
                          <CopyPlus size={13} />
                        </button>
                        {projects.length > 1 &&
                          (pendingDeleteProjectId === proj.id ? (
                            <button
                              type="button"
                              className="project-delete-confirm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteProjectId(null);
                                onDeleteProject(proj.id);
                              }}
                            >
                              {locale === 'en' ? 'Delete?' : 'Poista?'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="project-item-action"
                              title={locale === 'en' ? 'Delete' : 'Poista'}
                              aria-label={locale === 'en' ? 'Delete' : 'Poista'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteProjectId(proj.id);
                                window.setTimeout(
                                  () =>
                                    setPendingDeleteProjectId((curr) =>
                                      curr === proj.id ? null : curr
                                    ),
                                  4000
                                );
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-icon mobile-close-btn"
            onClick={onCloseMobile}
            aria-label={t.close}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="panel-body">
        {/* Measurement summary */}
        <section className="card">
          <div className="card-title">
            <span>{t.measurementsTitle}</span>
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {summary.grossAreaSqm > 0 && summary.cutoutAreaSqm === 0 && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                  disabled={isAutoSubtracting}
                  onClick={onAutoSubtractBuildings}
                >
                  <Building2 size={14} />
                  {isAutoSubtracting
                    ? t.searchingBuildingsBtn
                    : t.subtractBuildings}
                </button>
              )}
              {summary.cutoutAreaSqm > 0 && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                  onClick={onClearCutouts}
                >
                  <X size={14} />
                  {t.clearCutouts}
                </button>
              )}
              {hasActiveCutout && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                  onClick={onCommitCutout}
                >
                  <PlusCircle size={14} />
                  {t.newCutout}
                </button>
              )}
            </div>
          </div>

          {parcelCode && (
            <div className="parcel-bar">
              <div className="parcel-code-wrap">
                <span className="parcel-code-label">{t.parcelCode}</span>
                <span className="parcel-code-val tabular-nums">
                  {parcelCode}
                </span>
              </div>
              <div className="parcel-actions">
                <button
                  type="button"
                  className="parcel-action-btn"
                  onClick={handleCopyParcel}
                >
                  {copiedParcel ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedParcel ? t.copied : t.copy}</span>
                </button>
                <a
                  className="parcel-action-btn"
                  href="https://www.maanmittauslaitos.fi/asioi-verkossa/asiointipalvelu"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>MML</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          <div className="metrics-grid tabular-nums">
            <div className="metric-box">
              <span className="metric-box-label">
                {slopePct > 0 ? t.netAreaSloped(slopePct) : t.netArea}
              </span>
              <span className="metric-box-value">
                {formatArea(summary.effectiveAreaSqm, locale)}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-box-label">{t.perimeter}</span>
              <span className="metric-box-value">
                {formatLength(summary.perimeterM, locale)}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-box-label">{t.cutout}</span>
              <span
                className="metric-box-value"
                style={{
                  color:
                    summary.cutoutAreaSqm > 0
                      ? 'var(--geo-cutout)'
                      : 'var(--ink-primary)',
                }}
              >
                {summary.cutoutAreaSqm > 0
                  ? `−${formatArea(summary.cutoutAreaSqm, locale)}`
                  : '0 m²'}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-box-label">{t.line}</span>
              <span
                className="metric-box-value"
                style={{
                  color:
                    summary.lineLengthM > 0
                      ? 'var(--geo-line)'
                      : 'var(--ink-primary)',
                }}
              >
                {formatLength(summary.lineLengthM, locale)}
              </span>
            </div>
          </div>

          {summary.lineLengthM > 0 && (
            <div className="corridor-bar">
              <div className="corridor-bar-top">
                <span>
                  {locale === 'en'
                    ? 'Convert line to driveway / corridor'
                    : 'Muunna linja pihatieksi / kaistaksi'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1.2, 3.5, 4.0].map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="parcel-action-btn tabular-nums"
                      style={{
                        height: 24,
                        fontSize: 11,
                        background:
                          corridorWidthM === w
                            ? 'var(--surface-selected)'
                            : undefined,
                        color: corridorWidthM === w ? '#fff' : undefined,
                      }}
                      onClick={() => setCorridorWidthM(w)}
                    >
                      {formatNumber(w, 1, locale)} m
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-subtle"
                style={{ minHeight: 34, fontSize: 12.5, width: '100%' }}
                onClick={() => onConvertLineToCorridor(corridorWidthM)}
              >
                {locale === 'en'
                  ? `Create ${formatNumber(corridorWidthM, 1, locale)} m wide area`
                  : `Luo ${formatNumber(corridorWidthM, 1, locale)} m leveä alue`}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="parcel-action-btn"
              style={{ alignSelf: 'flex-start', height: 28, fontSize: 11.5 }}
              onClick={() => setQuickShapeOpen((o) => !o)}
            >
              <Plus size={12} />
              <span>
                {locale === 'en'
                  ? 'Quick shape (rect / circle)'
                  : 'Pikamuoto (suorakulmio / ympyrä)'}
              </span>
            </button>
            {quickShapeOpen && (
              <div className="quick-shape-box">
                <div className="quick-shape-row">
                  <span className="quick-shape-label">
                    {locale === 'en' ? 'Rectangle (m)' : 'Suorakulmio (m)'}
                  </span>
                  <div className="quick-shape-inputs">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={rectW}
                      onChange={(e) => setRectW(Number(e.target.value) || 1)}
                      aria-label="Width"
                    />
                    <span>×</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={rectH}
                      onChange={(e) => setRectH(Number(e.target.value) || 1)}
                      aria-label="Height"
                    />
                    <button
                      type="button"
                      className="parcel-action-btn"
                      onClick={() => {
                        onInsertQuickShape('rect', rectW, rectH);
                        setQuickShapeOpen(false);
                      }}
                    >
                      {locale === 'en' ? 'Place' : 'Aseta'}
                    </button>
                  </div>
                </div>
                <div className="quick-shape-row">
                  <span className="quick-shape-label">
                    {locale === 'en' ? 'Circle radius (m)' : 'Ympyrän säde (m)'}
                  </span>
                  <div className="quick-shape-inputs">
                    <input
                      type="number"
                      min={0.5}
                      max={200}
                      step={0.5}
                      value={circleR}
                      onChange={(e) => setCircleR(Number(e.target.value) || 1)}
                      aria-label="Radius"
                    />
                    <button
                      type="button"
                      className="parcel-action-btn"
                      onClick={() => {
                        onInsertQuickShape('circle', circleR);
                        setQuickShapeOpen(false);
                      }}
                    >
                      {locale === 'en' ? 'Place' : 'Aseta'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {summary.grossAreaSqm > 0 && (
            <div className="slope-row">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--ink-secondary)',
                }}
              >
                <span>{t.slopeLabel}</span>
                <button
                  type="button"
                  className="parcel-action-btn"
                  style={{ height: 26, fontSize: 11.5 }}
                  disabled={isEstimatingSlope}
                  onClick={onAutoEstimateSlope}
                >
                  {isEstimatingSlope
                    ? locale === 'en'
                      ? 'Checking…'
                      : 'Haetaan…'
                    : locale === 'en'
                      ? 'Auto-detect'
                      : 'Tunnista korkeus'}
                </button>
              </div>
              <div className="slope-chips">
                {[0, 10, 20, 30].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="slope-chip tabular-nums"
                    data-active={slopePct === val}
                    onClick={() => onChangeSlopePct(val)}
                  >
                    {val} %
                  </button>
                ))}
              </div>
              {slopePct > 0 && (
                <div
                  className="tabular-nums"
                  style={{ fontSize: 11.5, color: 'var(--accent-primary)', fontWeight: 600 }}
                >
                  {slopePct} % ·{' '}
                  {t.slopeExtra(
                    formatNumber((summary.slopeFactor - 1) * 100, 1, locale)
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Material preset selector */}
        <section className="card">
          <div className="card-title">
            <span>{t.presetTitle}</span>
          </div>
          <div className="preset-grid">
            {presets.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={
                  presets.length % 2 === 1 && idx === presets.length - 1
                    ? 'preset-btn preset-btn-wide'
                    : 'preset-btn'
                }
                data-active={preset.id === item.id}
                onClick={() => onSelectPreset(item.id)}
              >
                <span className="preset-name">{item.name}</span>
                <span className="preset-desc">{item.shortDesc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Parameters */}
        <section className="card">
          <div className="card-title">
            <span>{t.paramsTitle}</span>
          </div>
          <div className="field-grid">
            {preset.parameters.map((param) => (
              <div key={param.key} className="field">
                <label htmlFor={`param-${param.key}`}>
                  {param.label} ({param.unit})
                </label>
                <input
                  id={`param-${param.key}`}
                  type="number"
                  inputMode="decimal"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={params[param.key] ?? param.defaultValue}
                  onChange={(e) =>
                    onChangeParam(param.key, Number(e.target.value))
                  }
                />
              </div>
            ))}

            <div className="field">
              <label htmlFor="unit-price">{preset.unitPriceLabel}</label>
              <input
                id="unit-price"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={unitPriceEur}
                onChange={(e) => onChangeUnitPrice(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="vat-rate">{t.vatLabel}</label>
              <input
                id="vat-rate"
                type="number"
                inputMode="decimal"
                min={0}
                max={50}
                step={0.5}
                value={vatRatePct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChangeVatRate(
                    Number.isFinite(val) ? Math.min(50, Math.max(0, val)) : 0
                  );
                }}
              />
            </div>
          </div>
        </section>

        {/* Estimate results */}
        <section className="card">
          <div className="card-title">
            <span>{t.estimateTitle}</span>
            <span>{preset.basis === 'area' ? t.basisArea : t.basisLine}</span>
          </div>

          {!hasRelevantMeasure ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  fontSize: 13.5,
                  color: 'var(--ink-secondary)',
                  lineHeight: 1.45,
                }}
              >
                {preset.basis === 'area' ? t.emptyAreaHint : t.emptyLineHint}
              </div>
              {preset.basis === 'area' && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ minHeight: 38, fontSize: 13, alignSelf: 'flex-start', padding: '0 12px' }}
                  onClick={onLoadDemoYard}
                >
                  <Sparkles size={14} />
                  {locale === 'en'
                    ? 'Try demo yard'
                    : 'Kokeile esimerkkipihaa'}
                </button>
              )}
            </div>
          ) : (
            <div className="result-list tabular-nums">
              {estimate.lines.map((row) => (
                <div key={row.label} className="result-row">
                  <span className="result-row-label">{row.label}</span>
                  <span className="result-row-val">{row.value}</span>
                </div>
              ))}
              <div className="result-row" style={{ marginTop: 4 }}>
                <span className="result-row-label">{t.subtotalLabel}</span>
                <span className="result-row-val">
                  {formatEur(estimate.subtotalEur, locale)}
                </span>
              </div>
              <div className="result-row">
                <span className="result-row-label">
                  {t.vatRowLabel(
                    formatNumber(estimate.vatRatePct, 1, locale)
                  )}
                </span>
                <span className="result-row-val">
                  {formatEur(estimate.vatEur, locale)}
                </span>
              </div>
              <div className="result-total">
                <span style={{ fontWeight: 650, fontSize: 14.5 }}>
                  {t.totalLabel}
                </span>
                <span className="result-total-price">
                  {formatEur(estimate.totalEur, locale)}
                </span>
              </div>

              <div className="result-meta">
                <div className="result-range">
                  {t.rangeLabel(
                    formatEur(estimate.totalMinEur, locale),
                    formatEur(estimate.totalMaxEur, locale)
                  )}
                </div>
                <span
                  className="accuracy-badge"
                  data-source={estimate.accuracy.source}
                >
                  <ShieldCheck size={14} />
                  {estimate.accuracy.label}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{
                    flex: 1,
                    minHeight: 40,
                    padding: '0 12px',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                  }}
                  onClick={onAddQuoteItem}
                >
                  <Plus size={15} />
                  {locale === 'en' ? 'Add to quote' : 'Lisää tarjoukseen'}
                </button>
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{
                    minHeight: 40,
                    padding: '0 18px',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => setCustomRowOpen((o) => !o)}
                >
                  <Plus size={15} />
                  {locale === 'en' ? 'Labor / fee' : 'Työ / lisäkulu'}
                </button>
              </div>

              {customRowOpen && (
                <div className="custom-row-box">
                  <input
                    type="text"
                    className="custom-row-input"
                    placeholder={
                      locale === 'en'
                        ? 'e.g. Excavator work / delivery'
                        : 'esim. Kaivinkonetyö / kuljetus'
                    }
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                  />
                  <div className="custom-row-grid">
                    <label className="custom-row-field">
                      <span>{locale === 'en' ? 'Qty' : 'Määrä'}</span>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        className="custom-row-input tabular-nums"
                        value={customQty}
                        onChange={(e) =>
                          setCustomQty(Math.max(0.5, Number(e.target.value) || 1))
                        }
                      />
                    </label>
                    <label className="custom-row-field">
                      <span>{locale === 'en' ? 'Unit' : 'Yksikkö'}</span>
                      <input
                        type="text"
                        className="custom-row-input"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="h / kpl"
                      />
                    </label>
                    <label className="custom-row-field">
                      <span>{locale === 'en' ? 'Price (excl. VAT)' : 'Hinta (alv 0 %)'}</span>
                      <div className="custom-row-price-wrap">
                        <input
                          type="number"
                          min={0}
                          step={5}
                          className="custom-row-input tabular-nums"
                          style={{ paddingRight: 44 }}
                          value={customPrice}
                          onChange={(e) =>
                            setCustomPrice(Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                        <span className="custom-row-suffix">
                          €/{customUnit.trim() || (locale === 'en' ? 'pc' : 'kpl')}
                        </span>
                      </div>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ minHeight: 34, padding: '0 12px', fontSize: 12.5, alignSelf: 'end' }}
                      disabled={!customLabel.trim()}
                      onClick={() => {
                        onAddCustomQuoteItem(
                          customLabel,
                          customQty,
                          customUnit,
                          customPrice
                        );
                        setCustomLabel('');
                        setCustomRowOpen(false);
                      }}
                    >
                      {locale === 'en' ? 'Add' : 'Lisää'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {quoteItems.length > 0 && (
          <section className="card">
            <button
              type="button"
              onClick={() => setLayersSectionOpen((o) => !o)}
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span
                className="card-title"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Layers size={13} />
                {locale === 'en'
                  ? `Selected items (${quoteItems.length})`
                  : `Valitut kohteet (${quoteItems.length})`}
              </span>
              {layersSectionOpen ? (
                <ChevronUp size={15} color="var(--ink-muted)" />
              ) : (
                <ChevronDown size={15} color="var(--ink-muted)" />
              )}
            </button>
            {layersSectionOpen && (
              <QuoteItemsList
                items={quoteItems}
                locale={locale}
                inset
                onFocusItem={onFocusQuoteItem}
                onRemoveItem={onRemoveQuoteItem}
              />
            )}
          </section>
        )}

        {/* Quote metadata */}
        <section className="card">
          <div className="card-title">
            <span>{t.quoteInfoTitle}</span>
          </div>
          <div className="field-grid">
            <div className="field field-full">
              <label htmlFor="project-title">{t.projectTitleLabel}</label>
              <input
                id="project-title"
                type="text"
                placeholder={t.projectTitlePlaceholder}
                value={company.projectTitle}
                onChange={(e) =>
                  onChangeCompany({ projectTitle: e.target.value })
                }
              />
            </div>
            <div className="field field-full">
              <label htmlFor="project-address">{t.addressLabel}</label>
              <input
                id="project-address"
                type="text"
                placeholder={t.addressPlaceholder}
                value={company.address}
                onChange={(e) => onChangeCompany({ address: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="company-name">{t.companyLabel}</label>
              <input
                id="company-name"
                type="text"
                placeholder={t.companyPlaceholder}
                value={company.name}
                onChange={(e) => onChangeCompany({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="company-contact">{t.contactLabel}</label>
              <input
                id="company-contact"
                type="text"
                placeholder={t.contactPlaceholder}
                value={company.contact}
                onChange={(e) => onChangeCompany({ contact: e.target.value })}
              />
            </div>
            <div className="field field-full">
              <label>{t.logoLabel}</label>
              <div className="logo-upload-row">
                {company.logoDataUrl ? (
                  <>
                    <img
                      src={company.logoDataUrl}
                      alt="Logo"
                      className="logo-preview"
                    />
                    <button
                      type="button"
                      className="btn btn-subtle"
                      style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }}
                      onClick={() => onChangeCompany({ logoDataUrl: undefined })}
                    >
                      <Trash2 size={14} />
                      {t.removeLogo}
                    </button>
                  </>
                ) : (
                  <label
                    className="btn btn-subtle"
                    style={{
                      minHeight: 38,
                      padding: '0 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <ImagePlus size={15} />
                    <span>{t.addLogo}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>
            <div
              className="field field-full"
              style={{
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--ink-secondary)', fontWeight: 550 }}>
                {locale === 'en' ? 'CAD / GIS export' : 'CAD / GIS -vienti'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="parcel-action-btn"
                  disabled={!hasExportableContent}
                  onClick={() => onExportGeo('geojson')}
                >
                  GeoJSON
                </button>
                <button
                  type="button"
                  className="parcel-action-btn"
                  disabled={!hasExportableContent}
                  onClick={() => onExportGeo('kml')}
                >
                  KML
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="panel-footer">
        <button
          type="button"
          className="btn btn-subtle"
          style={{ padding: '0 13px', flexShrink: 0 }}
          disabled={!hasExportableContent}
          onClick={handleCopySummary}
          aria-label={
            locale === 'en'
              ? 'Copy text summary'
              : 'Kopioi tekstimuotoinen yhteenveto'
          }
          data-tooltip={
            copiedSummary
              ? locale === 'en'
                ? 'Copied!'
                : 'Kopioitu!'
              : locale === 'en'
                ? 'Copy summary (WhatsApp / SMS)'
                : 'Kopioi yhteenveto (WhatsApp / SMS)'
          }
          data-tooltip-pos="top"
          data-tooltip-align="left"
        >
          {copiedSummary ? <Check size={16} /> : <Copy size={16} />}
          <span>
            {copiedSummary
              ? locale === 'en'
                ? 'Copied'
                : 'Kopioitu'
              : locale === 'en'
                ? 'Copy'
                : 'Kopioi'}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!hasExportableContent || isExportingPdf}
          onClick={onExportPdf}
        >
          <FileDown size={17} />
          {isExportingPdf ? t.exportingPdf : t.exportPdf}
        </button>
      </div>
    </aside>
  );
}
