import {
  Focus,
  Navigation,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMessages, type Locale } from '../i18n';
import { type GeocoderResult, searchAddress } from '../map/geocoder';
import {
  type BaseLayerId,
  ENABLED_BASE_LAYERS,
  IS_MML_ENABLED,
} from '../map/providers';
import { MaamittaLogo } from './MaamittaLogo';

interface TopBarProps {
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  baseLayer: BaseLayerId;
  showParcels: boolean;
  showSoilMap: boolean;
  showCrosshair: boolean;
  hasSelection: boolean;
  onSelectBaseLayer: (id: BaseLayerId) => void;
  onToggleParcels: () => void;
  onToggleSoilMap: () => void;
  onToggleCrosshair: () => void;
  onSelectLocation: (lng: number, lat: number, label: string) => void;
  onLocateUser: () => void;
  onFitSelection: () => void;
}

export function TopBar({
  locale,
  onChangeLocale,
  baseLayer,
  showParcels,
  showSoilMap,
  showCrosshair,
  hasSelection,
  onSelectBaseLayer,
  onToggleParcels,
  onToggleSoilMap,
  onToggleCrosshair,
  onSelectLocation,
  onLocateUser,
  onFitSelection,
}: TopBarProps) {
  const t = getMessages(locale);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocoderResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await searchAddress(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setResults(found);
        }
      } catch {
        // Ignore aborted requests
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!menuOpen && results.length === 0) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setResults([]);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, results.length]);

  return (
    <header className="top-bar">
      <div className="brand-pill" aria-label="Maamitta">
        <MaamittaLogo size={22} bare />
        <span className="brand-text">Maamitta</span>
      </div>

      <div className="search-wrap">
        <div className="search-input-row">
          <Search
            size={15}
            strokeWidth={2}
            color="var(--ink-muted)"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          />
          <input
            type="search"
            autoCorrect="off"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.app.searchPlaceholder}
            enterKeyHint="search"
            autoComplete="off"
            aria-label={t.app.searchPlaceholder}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
              aria-label={t.app.clearSearch}
              style={{
                border: 0,
                background: 'transparent',
                padding: 4,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: 'var(--ink-muted)',
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onLocateUser}
              aria-label={t.app.locateTooltip}
              data-tooltip={t.app.locateTooltip}
              data-tooltip-pos="bottom"
              style={{
                border: 0,
                background: 'transparent',
                padding: 5,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: 'var(--ink-secondary)',
              }}
            >
              <Navigation size={15} strokeWidth={2} />
            </button>
          )}
        </div>

        {(results.length > 0 || isSearching) && (
          <div className="search-results" role="listbox">
            {isSearching && results.length === 0 && (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: 13,
                  color: 'var(--ink-secondary)',
                }}
              >
                {t.app.searching}
              </div>
            )}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="search-result-btn"
                onClick={() => {
                  skipNextSearchRef.current = true;
                  onSelectLocation(item.lng, item.lat, item.label);
                  setQuery(item.label);
                  setResults([]);
                }}
              >
                <span className="search-result-title">{item.label}</span>
                {item.subtitle && (
                  <span className="search-result-sub">{item.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="layer-control"
        ref={menuRef}
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <button
          type="button"
          className="btn-icon"
          onClick={onFitSelection}
          disabled={!hasSelection}
          aria-label={
            locale === 'en'
              ? 'Fit selected area on map'
              : 'Keskitä valittuun kohteeseen'
          }
          data-tooltip={
            locale === 'en'
              ? 'Fit selected area on map'
              : 'Keskitä valittuun kohteeseen'
          }
          data-tooltip-pos="bottom"
          data-tooltip-align="right"
        >
          <Focus size={18} />
        </button>

        <button
          type="button"
          className="btn-icon"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={locale === 'en' ? 'Map & settings' : 'Kartta ja asetukset'}
          aria-expanded={menuOpen}
          data-tooltip={
            locale === 'en' ? 'Map & settings' : 'Kartta ja asetukset'
          }
          data-tooltip-pos="bottom"
          data-tooltip-align="right"
        >
          <SlidersHorizontal size={18} />
        </button>

        {menuOpen && (
          <div
            className="layer-popover"
            role="dialog"
            aria-label={
              locale === 'en' ? 'Map & settings' : 'Kartta ja asetukset'
            }
          >
            <div className="popover-heading">{t.app.baseMapHeading}</div>
            {ENABLED_BASE_LAYERS.map((cfg) => {
              const label =
                cfg.id === 'satellite'
                  ? t.layers.satellite
                  : cfg.id === 'mml-orto'
                    ? t.layers.mmlOrto
                    : IS_MML_ENABLED
                      ? t.layers.mmlTopo
                      : t.layers.osmTopo;
              return (
                <button
                  key={cfg.id}
                  type="button"
                  className="layer-option"
                  data-active={baseLayer === cfg.id}
                  onClick={() => onSelectBaseLayer(cfg.id)}
                >
                  <span>{label}</span>
                  {baseLayer === cfg.id && <span>●</span>}
                </button>
              );
            })}

            <div className="popover-heading" style={{ marginTop: 4 }}>
              {t.app.overlaysHeading}
            </div>
            <button
              type="button"
              className="layer-option"
              data-active={showParcels && IS_MML_ENABLED}
              disabled={!IS_MML_ENABLED}
              onClick={onToggleParcels}
              style={!IS_MML_ENABLED ? { opacity: 0.55 } : undefined}
            >
              <span>{t.app.parcelsLabel}</span>
              <span>
                {showParcels && IS_MML_ENABLED ? t.app.on : t.app.off}
              </span>
            </button>

            <button
              type="button"
              className="layer-option"
              data-active={showSoilMap}
              onClick={onToggleSoilMap}
            >
              <span>
                {locale === 'en' ? 'Soil map (GTK)' : 'Maaperäkartta (GTK)'}
              </span>
              <span>{showSoilMap ? t.app.on : t.app.off}</span>
            </button>

            <button
              type="button"
              className="layer-option"
              data-active={showCrosshair}
              onClick={onToggleCrosshair}
            >
              <span>
                {locale === 'en' ? 'Center crosshair (X)' : 'Keskustähtäin (X)'}
              </span>
              <span>{showCrosshair ? t.app.on : t.app.off}</span>
            </button>

            <div className="popover-heading" style={{ marginTop: 4 }}>
              {locale === 'en' ? 'Language' : 'Kieli'}
            </div>
            <div className="lang-segment" role="group" aria-label="Language">
              <button
                type="button"
                className="lang-segment-btn"
                data-active={locale === 'fi'}
                onClick={() => onChangeLocale('fi')}
              >
                Suomi
              </button>
              <button
                type="button"
                className="lang-segment-btn"
                data-active={locale === 'en'}
                onClick={() => onChangeLocale('en')}
              >
                English
              </button>
            </div>

            {!IS_MML_ENABLED && (
              <div className="layer-note">
                {t.app.mmlHintPrefix} <code>MML_API_KEY</code>{' '}
                {t.app.mmlHintSuffix}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
