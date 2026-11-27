import { Check, ChevronDown, ChevronUp, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hasCustomPriceBook, MAX_MARGIN_PCT } from '../../engine/priceBook';
import type { MaterialPreset, PriceBook } from '../../engine/types';
import { getMessages, type Locale } from '../../i18n';
import { getPresets } from '../../presets/finland';

interface PresetParamsCardProps {
  locale: Locale;
  preset: MaterialPreset;
  params: Record<string, number>;
  unitPriceEur: number;
  vatRatePct: number;
  priceBook: PriceBook;
  onSelectPreset: (presetId: string) => void;
  onChangeParam: (key: string, value: number) => void;
  onChangeUnitPrice: (price: number) => void;
  onChangeVatRate: (vat: number) => void;
  onChangePriceBook: (patch: Partial<PriceBook>) => void;
  onSaveCurrentAsDefaults: () => void;
  onResetPriceBook: () => void;
}

export function PresetParamsCard({
  locale,
  preset,
  params,
  unitPriceEur,
  vatRatePct,
  priceBook,
  onSelectPreset,
  onChangeParam,
  onChangeUnitPrice,
  onChangeVatRate,
  onChangePriceBook,
  onSaveCurrentAsDefaults,
  onResetPriceBook,
}: PresetParamsCardProps) {
  const t = getMessages(locale).panel;
  const presets = getPresets(locale);
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [savedPriceFlash, setSavedPriceFlash] = useState(false);
  const savedPriceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (savedPriceTimerRef.current !== null) {
        window.clearTimeout(savedPriceTimerRef.current);
      }
    };
  }, []);

  return (
    <>
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
            </button>
          ))}
        </div>
        <div className="preset-active-desc">{preset.shortDesc}</div>
      </section>

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

        <div className="pricebook-wrap">
          <button
            type="button"
            className="pricebook-toggle"
            aria-expanded={priceBookOpen}
            onClick={() => setPriceBookOpen((o) => !o)}
          >
            <span>
              {locale === 'en' ? 'My prices' : 'Oma hinnasto'}
              {hasCustomPriceBook(priceBook)
                ? locale === 'en'
                  ? ' · Saved'
                  : ' · Tallennettu'
                : ''}
            </span>
            {priceBookOpen ? (
              <ChevronUp size={15} color="var(--ink-muted)" />
            ) : (
              <ChevronDown size={15} color="var(--ink-muted)" />
            )}
          </button>

          {priceBookOpen && (
            <div className="pricebook-body">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="pricebook-hourly">
                    {locale === 'en'
                      ? 'Default labour (€/h)'
                      : 'Oletustuntihinta (€/h)'}
                  </label>
                  <input
                    id="pricebook-hourly"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1000}
                    step={5}
                    className="tabular-nums"
                    value={priceBook.hourlyRateEur}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangePriceBook({
                        hourlyRateEur: Number.isFinite(val)
                          ? Math.min(1000, Math.max(0, val))
                          : 0,
                      });
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pricebook-margin">
                    {locale === 'en'
                      ? `Margin (0–${MAX_MARGIN_PCT}%)`
                      : `Kate (0–${MAX_MARGIN_PCT} %)`}
                  </label>
                  <input
                    id="pricebook-margin"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_MARGIN_PCT}
                    step={1}
                    className="tabular-nums"
                    value={priceBook.marginPct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangePriceBook({
                        marginPct: Number.isFinite(val)
                          ? Math.min(MAX_MARGIN_PCT, Math.max(0, val))
                          : 0,
                      });
                    }}
                  />
                </div>
              </div>
              <p className="pricebook-hint">
                {locale === 'en'
                  ? 'Margin is folded into client quote prices (never shown as a separate line in the PDF).'
                  : 'Kate sulautuu tarjouksen rivihintoihin eikä näy asiakkaan PDF:ssä erillisenä rivinä.'}
              </p>
              <div className="pricebook-actions">
                <button
                  type="button"
                  className="btn btn-primary pricebook-btn"
                  onClick={() => {
                    onSaveCurrentAsDefaults();
                    setSavedPriceFlash(true);
                    if (savedPriceTimerRef.current !== null) {
                      window.clearTimeout(savedPriceTimerRef.current);
                    }
                    savedPriceTimerRef.current = window.setTimeout(() => {
                      setSavedPriceFlash(false);
                      savedPriceTimerRef.current = null;
                    }, 1800);
                  }}
                >
                  {savedPriceFlash ? <Check size={14} /> : <Save size={14} />}
                  <span>
                    {savedPriceFlash
                      ? locale === 'en'
                        ? 'Saved!'
                        : 'Tallennettu!'
                      : locale === 'en'
                        ? 'Save as defaults'
                        : 'Tallenna oletuksiksi'}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-subtle pricebook-btn"
                  onClick={onResetPriceBook}
                >
                  <RotateCcw size={14} />
                  <span>
                    {locale === 'en'
                      ? 'Reset defaults'
                      : 'Palauta Maamitan oletukset'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
