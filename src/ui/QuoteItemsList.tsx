import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { formatArea, formatEur, formatLength } from '../engine/format';
import { computeQuoteTotals } from '../engine/quote';
import type { QuoteZoneItem } from '../engine/types';
import type { Locale } from '../i18n/types';
import { getPresetById } from '../presets/finland';

interface QuoteItemsListProps {
  items: QuoteZoneItem[];
  locale: Locale;
  inset?: boolean;
  onFocusItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

export function QuoteItemsList({
  items,
  locale,
  inset = false,
  onFocusItem,
  onRemoveItem,
}: QuoteItemsListProps) {
  const totals = useMemo(() => computeQuoteTotals(items), [items]);
  const measureLabel = [
    totals.areaSqm > 0 ? formatArea(totals.areaSqm, locale) : null,
    totals.lineM > 0 ? formatLength(totals.lineM, locale) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const summaryHeader = (
    <div
      className={
        inset
          ? 'quote-summary-header quote-summary-header--inset tabular-nums'
          : 'quote-summary-header tabular-nums'
      }
    >
      <span className="quote-summary-measure">{measureLabel}</span>
      <span className="quote-summary-price">
        {formatEur(totals.totalEur, locale)}
      </span>
    </div>
  );

  const cards = items.map((item) => (
    <div
      key={item.id}
      className="quote-item-card tabular-nums"
      role="button"
      tabIndex={0}
      onClick={() => onFocusItem(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocusItem(item.id);
        }
      }}
    >
      <div className="quote-item-top">
        <span className="quote-item-title">{item.label}</span>
        <span className="quote-item-price">
          {formatEur(item.totalEur, locale)}
        </span>
      </div>
      <div className="quote-item-bottom">
        <span className="quote-item-meta">
          {item.presetId === 'custom'
            ? item.summaryText || (locale === 'en' ? 'Custom item' : 'Oma rivi')
            : `${getPresetById(item.presetId, locale).name} · ${
                item.basisUnit === 'm²'
                  ? formatArea(item.basisValue, locale)
                  : formatLength(item.basisValue, locale)
              }`}
        </span>
        <button
          type="button"
          className="project-item-action"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(item.id);
          }}
          aria-label={locale === 'en' ? 'Remove item' : 'Poista kohde'}
          title={locale === 'en' ? 'Remove' : 'Poista'}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  ));

  if (inset) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {summaryHeader}
        {cards}
      </div>
    );
  }

  return (
    <div className="map-layers-card">
      {summaryHeader}
      <div className="map-layers-list">{cards}</div>
    </div>
  );
}
