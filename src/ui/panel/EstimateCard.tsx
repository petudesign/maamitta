import { Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatEur, formatNumber } from '../../engine/format';
import type { CalculationResult, MaterialPreset } from '../../engine/types';
import { getMessages, type Locale } from '../../i18n';

interface EstimateCardProps {
  locale: Locale;
  preset: MaterialPreset;
  estimate: CalculationResult;
  hourlyRateEur: number;
  onLoadDemoYard: () => void;
  onAddQuoteItem: () => void;
  onAddCustomQuoteItem: (
    label: string,
    qty: number,
    unitLabel: string,
    unitPriceExclVat: number
  ) => void;
}

export function EstimateCard({
  locale,
  preset,
  estimate,
  hourlyRateEur,
  onLoadDemoYard,
  onAddQuoteItem,
  onAddCustomQuoteItem,
}: EstimateCardProps) {
  const t = getMessages(locale).panel;
  const hasRelevantMeasure = estimate.basisValue > 0;
  const [customRowOpen, setCustomRowOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('h');
  const [customPrice, setCustomPrice] = useState(hourlyRateEur);

  useEffect(() => {
    setCustomPrice(hourlyRateEur);
  }, [hourlyRateEur]);

  return (
    <section className="card card-estimate">
      <div className="card-title">
        <span>{t.estimateTitle}</span>
        <span>{preset.basis === 'area' ? t.basisArea : t.basisLine}</span>
      </div>

      {!hasRelevantMeasure ? (
        <div className="empty-guide">
          {preset.basis === 'area' ? (
            <ol className="empty-steps">
              <li>
                <strong>
                  {locale === 'en' ? 'Search an address' : 'Hae osoite'}
                </strong>{' '}
                {locale === 'en'
                  ? 'at the top, or pan the map to the site.'
                  : 'ylhäältä tai siirry kartalla kohteeseen.'}
              </li>
              <li>
                {locale === 'en' ? (
                  <>
                    Choose <strong>Pick</strong> and tap a parcel (borders &amp;
                    buildings auto-fill) — or draw an <strong>Area</strong>.
                  </>
                ) : (
                  <>
                    Valitse <strong>Poimi</strong> ja napauta tonttia (rajat
                    &amp; talot automaattisesti) — tai piirrä{' '}
                    <strong>Alue</strong>.
                  </>
                )}
              </li>
              <li>
                {locale === 'en' ? (
                  <>
                    Pick a <strong>job type</strong> and export a ready{' '}
                    <strong>PDF quote</strong>.
                  </>
                ) : (
                  <>
                    Valitse <strong>työlaji</strong> ja lataa valmis{' '}
                    <strong>PDF-arvio</strong>.
                  </>
                )}
              </li>
            </ol>
          ) : (
            <div className="empty-line-hint">{t.emptyLineHint}</div>
          )}
          {preset.basis === 'area' && (
            <button
              type="button"
              className="btn btn-subtle"
              style={{
                minHeight: 40,
                fontSize: 13,
                alignSelf: 'flex-start',
                padding: '0 13px',
              }}
              onClick={onLoadDemoYard}
            >
              <Sparkles size={14} />
              {locale === 'en' ? 'Try demo yard' : 'Kokeile esimerkkipihaa'}
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
          {estimate.marginPct > 0 && estimate.marginEur > 0 && (
            <div className="margin-note-row tabular-nums">
              {locale === 'en'
                ? `Incl. ${formatNumber(estimate.marginPct, 0, locale)}% margin (+${formatEur(estimate.marginEur, locale)}) · merged in PDF`
                : `Sis. kate ${formatNumber(estimate.marginPct, 0, locale)} % (+${formatEur(estimate.marginEur, locale)}) · sulautuu PDF:ään`}
            </div>
          )}
          <div className="result-row">
            <span className="result-row-label">
              {t.vatRowLabel(formatNumber(estimate.vatRatePct, 1, locale))}
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
                  <span>
                    {locale === 'en' ? 'Price (excl. VAT)' : 'Hinta (alv 0 %)'}
                  </span>
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
                  style={{
                    minHeight: 34,
                    padding: '0 12px',
                    fontSize: 12.5,
                    alignSelf: 'end',
                  }}
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
  );
}
