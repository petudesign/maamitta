import {
  Calculator,
  Pentagon,
  Plus,
  Ruler,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { formatArea, formatLength } from '../engine/format';
import type { DrawTool, MeasurementSummary } from '../engine/types';
import { getMessages, type Locale } from '../i18n';

interface ToolDockProps {
  locale: Locale;
  activeTool: DrawTool;
  summary: MeasurementSummary;
  statusMessage: string | null;
  onUndoClear?: () => void;
  isConfirmingClear?: boolean;
  clearItemCount?: number;
  canUndo: boolean;
  hasGeometry: boolean;
  hasClearable: boolean;
  showCrosshair: boolean;
  onSelectTool: (tool: DrawTool) => void;
  onPlaceCrosshairPoint: () => void;
  onUndo: () => void;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
  onOpenMobileSheet: () => void;
}

export function ToolDock({
  locale,
  activeTool,
  summary,
  statusMessage,
  onUndoClear,
  isConfirmingClear = false,
  clearItemCount = 0,
  canUndo,
  hasGeometry,
  hasClearable,
  showCrosshair,
  onSelectTool,
  onPlaceCrosshairPoint,
  onUndo,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
  onOpenMobileSheet,
}: ToolDockProps) {
  const t = getMessages(locale).tools;

  return (
    <>
      {(hasGeometry || statusMessage || isConfirmingClear) && (
        <div className="measure-hud tabular-nums" aria-live="polite">
          {isConfirmingClear ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                className="hud-label"
                style={{ color: 'var(--ink-primary)', fontWeight: 600 }}
              >
                {clearItemCount > 1
                  ? locale === 'en'
                    ? `Clear all (${clearItemCount} items)?`
                    : `Tyhjennä kaikki (${clearItemCount} kohdetta)?`
                  : locale === 'en'
                    ? 'Clear all measurements?'
                    : 'Tyhjennä kaikki mittaukset?'}
              </span>
              <button
                type="button"
                className="hud-cancel-btn"
                onClick={onCancelClear}
              >
                {locale === 'en' ? 'Cancel' : 'Peruuta'}
              </button>
              <button
                type="button"
                className="hud-danger-btn"
                onClick={onConfirmClear}
              >
                {locale === 'en' ? 'Clear' : 'Tyhjennä'}
              </button>
            </div>
          ) : statusMessage ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span
                className="hud-label"
                style={{ color: 'var(--ink-primary)', fontWeight: 550 }}
              >
                {statusMessage}
              </span>
              {onUndoClear && (
                <button
                  type="button"
                  className="hud-undo-btn"
                  onClick={onUndoClear}
                >
                  {locale === 'en' ? 'Undo' : 'Kumoa'}
                </button>
              )}
            </div>
          ) : (
            <>
              {summary.effectiveAreaSqm > 0 && (
                <div className="hud-metric">
                  <span className="hud-value">
                    {formatArea(summary.effectiveAreaSqm, locale)}
                  </span>
                  <span className="hud-label">{t.hudNet}</span>
                </div>
              )}
              {summary.cutoutAreaSqm > 0 && (
                <>
                  <span className="hud-divider" />
                  <div className="hud-metric">
                    <span
                      className="hud-value"
                      style={{ color: 'var(--geo-cutout)' }}
                    >
                      −{formatArea(summary.cutoutAreaSqm, locale)}
                    </span>
                    <span className="hud-label">{t.hudCutout}</span>
                  </div>
                </>
              )}
              {summary.lineLengthM > 0 && (
                <>
                  {summary.effectiveAreaSqm > 0 && (
                    <span className="hud-divider" />
                  )}
                  <div className="hud-metric">
                    <span
                      className="hud-value"
                      style={{ color: 'var(--geo-line)' }}
                    >
                      {formatLength(summary.lineLengthM, locale)}
                    </span>
                    <span className="hud-label">{t.hudLine}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <nav
        className="tool-dock"
        aria-label={locale === 'en' ? 'Measurement tools' : 'Mittaustyökalut'}
      >
        <button
          type="button"
          className="tool-chip"
          data-active={activeTool === 'pick'}
          aria-pressed={activeTool === 'pick'}
          onClick={() => onSelectTool('pick')}
          data-tooltip={t.pickTooltip}
        >
          <Sparkles size={16} />
          <span className="tool-chip-label">{t.pick}</span>
        </button>

        <button
          type="button"
          className="tool-chip"
          data-active={activeTool === 'area'}
          aria-pressed={activeTool === 'area'}
          onClick={() => onSelectTool('area')}
          data-tooltip={t.areaTooltip}
        >
          <Pentagon size={16} />
          <span className="tool-chip-label">{t.area}</span>
        </button>

        <button
          type="button"
          className="tool-chip"
          data-variant="cutout"
          data-active={activeTool === 'cutout'}
          aria-pressed={activeTool === 'cutout'}
          onClick={() => onSelectTool('cutout')}
          data-tooltip={t.cutoutTooltip}
        >
          <Scissors size={16} />
          <span className="tool-chip-label">{t.cutout}</span>
        </button>

        <button
          type="button"
          className="tool-chip"
          data-variant="line"
          data-active={activeTool === 'line'}
          aria-pressed={activeTool === 'line'}
          onClick={() => onSelectTool('line')}
          data-tooltip={t.lineTooltip}
        >
          <Ruler size={16} />
          <span className="tool-chip-label">{t.line}</span>
        </button>

        {(showCrosshair || hasClearable) && <span className="dock-sep" />}

        {showCrosshair ? (
          <button
            type="button"
            className="tool-chip"
            data-active="true"
            onClick={onPlaceCrosshairPoint}
            data-tooltip={t.addPointTooltip}
          >
            <Plus size={16} />
            <span>{t.addPoint}</span>
          </button>
        ) : null}

        {hasClearable && (
          <>
            {hasGeometry && (
              <button
                type="button"
                className="tool-chip"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label={t.undoTooltip}
                data-tooltip={t.undoTooltip}
              >
                <Undo2 size={16} />
              </button>
            )}

            <button
              type="button"
              className="tool-chip"
              onClick={onRequestClear}
              aria-label={t.clearTooltip}
              data-tooltip={isConfirmingClear ? undefined : t.clearTooltip}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}

        <button
          type="button"
          className="tool-chip mobile-sheet-trigger"
          data-active="true"
          onClick={onOpenMobileSheet}
          aria-label={t.calculateMobile}
        >
          <Calculator size={16} />
          <span>{t.calculateMobile}</span>
        </button>
      </nav>
    </>
  );
}
