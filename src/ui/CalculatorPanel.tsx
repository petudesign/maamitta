import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileDown,
  Layers,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../analytics/track';
import {
  formatArea,
  formatEur,
  formatLength,
  formatNumber,
} from '../engine/format';
import type {
  CalculationResult,
  CompanyInfo,
  DrawTool,
  MaterialPreset,
  MeasurementSummary,
  PriceBook,
  QuoteZoneItem,
  SitePhoto,
} from '../engine/types';
import { getMessages, type Locale } from '../i18n';
import type { SavedProject } from '../store/projectStore';
import { QuoteItemsList } from './QuoteItemsList';
import { EstimateCard } from './panel/EstimateCard';
import { MeasurementCard } from './panel/MeasurementCard';
import { PanelHeader } from './panel/PanelHeader';
import { PresetParamsCard } from './panel/PresetParamsCard';
import { QuoteInfoCard } from './panel/QuoteInfoCard';
import { SiteNotesPhotosCard } from './panel/SiteNotesPhotosCard';
import { useMobileSheetDrag } from './panel/useMobileSheetDrag';

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
  onInsertQuickShape: (
    kind: 'rect' | 'circle',
    dim1: number,
    dim2?: number
  ) => void;
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
  priceBook: PriceBook;
  onChangePriceBook: (patch: Partial<PriceBook>) => void;
  onSaveCurrentAsDefaults: () => void;
  onResetPriceBook: () => void;
  estimate: CalculationResult;
  company: CompanyInfo;
  siteNote: string;
  includeSiteNoteInPdf: boolean;
  sitePhotos: SitePhoto[];
  includeSitePhotosInPdf: boolean;
  storageWarning: string | null;
  onChangeSiteNote: (note: string) => void;
  onToggleIncludeSiteNote: (include: boolean) => void;
  onAddSitePhotos: (photos: SitePhoto[]) => void;
  onRemoveSitePhoto: (id: string) => void;
  onToggleIncludeSitePhotos: (include: boolean) => void;
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
  priceBook,
  onChangePriceBook,
  onSaveCurrentAsDefaults,
  onResetPriceBook,
  estimate,
  company,
  siteNote,
  includeSiteNoteInPdf,
  sitePhotos,
  includeSitePhotosInPdf,
  storageWarning,
  onChangeSiteNote,
  onToggleIncludeSiteNote,
  onAddSitePhotos,
  onRemoveSitePhoto,
  onToggleIncludeSitePhotos,
  onSelectPreset,
  onChangeParam,
  onChangeUnitPrice,
  onChangeVatRate,
  onChangeCompany,
  isExportingPdf,
  onExportPdf,
}: CalculatorPanelProps) {
  const t = getMessages(locale).panel;
  const hasRelevantMeasure = estimate.basisValue > 0;
  const hasExportableContent = hasRelevantMeasure || quoteItems.length > 0;
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [layersSectionOpen, setLayersSectionOpen] = useState(true);
  const [isTouchUi, setIsTouchUi] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse), (max-width: 900px)').matches
      : false
  );
  const panelRef = useRef<HTMLElement | null>(null);
  const summaryCopyTimerRef = useRef<number | null>(null);

  const sheetDragHandlers = useMobileSheetDrag(
    panelRef,
    isOpenMobile,
    onCloseMobile
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: coarse), (max-width: 900px)');
    const onChange = () => setIsTouchUi(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (summaryCopyTimerRef.current !== null) {
        window.clearTimeout(summaryCopyTimerRef.current);
      }
    };
  }, []);

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
      lines.push(`${preset.name} (${measureText}) — ${keyMetrics}`);
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
            : item.basisUnit === 'm'
              ? formatLength(item.basisValue, locale)
              : item.summaryText ||
                `${formatNumber(item.basisValue, 1, locale)} ${item.basisUnit}`;
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
      trackEvent('summary_copied', {
        zoneCount: quoteItems.length + (hasRelevantMeasure ? 1 : 0),
        presetId: preset.id,
        locale,
      });
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

  return (
    <aside
      ref={panelRef}
      id="calculator-panel"
      className="panel"
      data-open={isOpenMobile}
      aria-label={t.heading}
    >
      <div
        className="sheet-drag-zone"
        {...sheetDragHandlers}
        aria-hidden="true"
      >
        <span className="sheet-drag-pill" />
      </div>

      <PanelHeader
        locale={locale}
        activeTool={activeTool}
        isTouchUi={isTouchUi}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDuplicateProject={onDuplicateProject}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onCloseMobile={onCloseMobile}
      />

      <div className="panel-body">
        {storageWarning && (
          <div className="site-storage-warning" role="alert">
            {storageWarning}
          </div>
        )}

        <MeasurementCard
          locale={locale}
          summary={summary}
          parcelCode={parcelCode}
          slopePct={slopePct}
          isEstimatingSlope={isEstimatingSlope}
          hasActiveCutout={hasActiveCutout}
          isAutoSubtracting={isAutoSubtracting}
          onChangeSlopePct={onChangeSlopePct}
          onAutoEstimateSlope={onAutoEstimateSlope}
          onCommitCutout={onCommitCutout}
          onAutoSubtractBuildings={onAutoSubtractBuildings}
          onClearCutouts={onClearCutouts}
          onConvertLineToCorridor={onConvertLineToCorridor}
          onInsertQuickShape={onInsertQuickShape}
        />

        <PresetParamsCard
          locale={locale}
          preset={preset}
          params={params}
          unitPriceEur={unitPriceEur}
          vatRatePct={vatRatePct}
          priceBook={priceBook}
          onSelectPreset={onSelectPreset}
          onChangeParam={onChangeParam}
          onChangeUnitPrice={onChangeUnitPrice}
          onChangeVatRate={onChangeVatRate}
          onChangePriceBook={onChangePriceBook}
          onSaveCurrentAsDefaults={onSaveCurrentAsDefaults}
          onResetPriceBook={onResetPriceBook}
        />

        <EstimateCard
          locale={locale}
          preset={preset}
          estimate={estimate}
          hourlyRateEur={priceBook.hourlyRateEur}
          onLoadDemoYard={onLoadDemoYard}
          onAddQuoteItem={onAddQuoteItem}
          onAddCustomQuoteItem={onAddCustomQuoteItem}
        />

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

        <SiteNotesPhotosCard
          locale={locale}
          siteNote={siteNote}
          includeSiteNoteInPdf={includeSiteNoteInPdf}
          sitePhotos={sitePhotos}
          includeSitePhotosInPdf={includeSitePhotosInPdf}
          onChangeSiteNote={onChangeSiteNote}
          onToggleIncludeSiteNote={onToggleIncludeSiteNote}
          onAddSitePhotos={onAddSitePhotos}
          onRemoveSitePhoto={onRemoveSitePhoto}
          onToggleIncludeSitePhotos={onToggleIncludeSitePhotos}
        />

        <QuoteInfoCard
          locale={locale}
          company={company}
          hasExportableContent={hasExportableContent}
          onChangeCompany={onChangeCompany}
          onExportGeo={onExportGeo}
        />
      </div>

      <div className="panel-footer">
        <span
          style={{ display: 'inline-flex', flexShrink: 0 }}
          data-tooltip={
            !hasExportableContent
              ? locale === 'en'
                ? 'Pick or draw an area on the map first'
                : 'Valitse tai piirrä ensin alue kartalta'
              : undefined
          }
          data-tooltip-pos="top"
          data-tooltip-align="left"
        >
          <button
            type="button"
            className="btn btn-subtle"
            style={{ padding: '0 13px' }}
            disabled={!hasExportableContent}
            onClick={handleCopySummary}
            aria-label={
              locale === 'en'
                ? 'Copy text summary'
                : 'Kopioi tekstimuotoinen yhteenveto'
            }
            data-tooltip={
              !hasExportableContent
                ? undefined
                : copiedSummary
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
        </span>
        <span
          style={{ display: 'flex', flex: 1 }}
          data-tooltip={
            !hasExportableContent
              ? locale === 'en'
                ? 'Pick or draw an area on the map first'
                : 'Valitse tai piirrä ensin alue kartalta'
              : undefined
          }
          data-tooltip-pos="top"
          data-tooltip-align="right"
        >
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
        </span>
      </div>
    </aside>
  );
}
