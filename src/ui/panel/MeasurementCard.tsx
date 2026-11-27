import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Plus,
  PlusCircle,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatArea, formatLength, formatNumber } from '../../engine/format';
import type { MeasurementSummary } from '../../engine/types';
import { getMessages, type Locale } from '../../i18n';

interface MeasurementCardProps {
  locale: Locale;
  summary: MeasurementSummary;
  parcelCode: string | null;
  slopePct: number;
  isEstimatingSlope: boolean;
  hasActiveCutout: boolean;
  isAutoSubtracting: boolean;
  onChangeSlopePct: (slope: number) => void;
  onAutoEstimateSlope: () => void;
  onCommitCutout: () => void;
  onAutoSubtractBuildings: () => void;
  onClearCutouts: () => void;
  onConvertLineToCorridor: (widthM: number) => void;
  onInsertQuickShape: (
    kind: 'rect' | 'circle',
    dim1: number,
    dim2?: number
  ) => void;
}

export function MeasurementCard({
  locale,
  summary,
  parcelCode,
  slopePct,
  isEstimatingSlope,
  hasActiveCutout,
  isAutoSubtracting,
  onChangeSlopePct,
  onAutoEstimateSlope,
  onCommitCutout,
  onAutoSubtractBuildings,
  onClearCutouts,
  onConvertLineToCorridor,
  onInsertQuickShape,
}: MeasurementCardProps) {
  const t = getMessages(locale).panel;
  const [copiedParcel, setCopiedParcel] = useState(false);
  const [quickShapeOpen, setQuickShapeOpen] = useState(false);
  const [rectW, setRectW] = useState(10);
  const [rectH, setRectH] = useState(5);
  const [circleR, setCircleR] = useState(3);
  const [corridorWidthM, setCorridorWidthM] = useState(3.5);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

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

  return (
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
            <span className="parcel-code-val tabular-nums">{parcelCode}</span>
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
              style={{
                fontSize: 11.5,
                color: 'var(--accent-primary)',
                fontWeight: 600,
              }}
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
  );
}
