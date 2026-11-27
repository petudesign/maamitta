import { ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import type { CompanyInfo } from '../../engine/types';
import { resizeImageToDataUrl } from '../../export/imageCompress';
import { getMessages, type Locale } from '../../i18n';

interface QuoteInfoCardProps {
  locale: Locale;
  company: CompanyInfo;
  hasExportableContent: boolean;
  onChangeCompany: (patch: Partial<CompanyInfo>) => void;
  onExportGeo: (format: 'geojson' | 'kml') => void;
}

export function QuoteInfoCard({
  locale,
  company,
  hasExportableContent,
  onChangeCompany,
  onExportGeo,
}: QuoteInfoCardProps) {
  const t = getMessages(locale).panel;
  const [quoteInfoOpen, setQuoteInfoOpen] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    try {
      const logoDataUrl = await resizeImageToDataUrl(file, {
        maxWidth: 320,
        maxHeight: 120,
        mimeType: 'image/png',
      });
      onChangeCompany({ logoDataUrl });
    } catch {
      setLogoError(
        locale === 'en'
          ? 'Could not process logo image. Try a PNG or JPG file.'
          : 'Logon käsittely epäonnistui. Kokeile PNG- tai JPG-kuvaa.'
      );
    }
  };

  return (
    <section
      className={`card card-collapsible${quoteInfoOpen ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="section-collapse-btn"
        aria-expanded={quoteInfoOpen}
        onClick={() => setQuoteInfoOpen((o) => !o)}
      >
        <span className="card-title">{t.quoteInfoTitle}</span>
        <span className="section-collapse-meta">
          <span className="section-collapse-summary">
            {company.name.trim() ||
              company.address.trim() ||
              (locale === 'en' ? 'Optional' : 'Valinnainen')}
          </span>
          {quoteInfoOpen ? (
            <ChevronUp size={15} color="var(--ink-muted)" />
          ) : (
            <ChevronDown size={15} color="var(--ink-muted)" />
          )}
        </span>
      </button>

      {quoteInfoOpen && (
        <div className="field-grid">
          <div className="field field-full">
            <label htmlFor="project-title">{t.projectTitleLabel}</label>
            <input
              id="project-title"
              type="text"
              enterKeyHint="done"
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
              enterKeyHint="done"
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
              enterKeyHint="done"
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
              enterKeyHint="done"
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
            {logoError && (
              <div className="site-storage-warning" role="alert">
                {logoError}
              </div>
            )}
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
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-secondary)',
                fontWeight: 550,
              }}
            >
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
      )}
    </section>
  );
}
