import { Camera, ChevronDown, ChevronUp, X } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import type { SitePhoto } from '../../engine/types';
import { compressSitePhoto, MAX_SITE_PHOTOS } from '../../export/imageCompress';
import type { Locale } from '../../i18n';

interface SiteNotesPhotosCardProps {
  locale: Locale;
  siteNote: string;
  includeSiteNoteInPdf: boolean;
  sitePhotos: SitePhoto[];
  includeSitePhotosInPdf: boolean;
  onChangeSiteNote: (note: string) => void;
  onToggleIncludeSiteNote: (include: boolean) => void;
  onAddSitePhotos: (photos: SitePhoto[]) => void;
  onRemoveSitePhoto: (id: string) => void;
  onToggleIncludeSitePhotos: (include: boolean) => void;
}

export function SiteNotesPhotosCard({
  locale,
  siteNote,
  includeSiteNoteInPdf,
  sitePhotos,
  includeSitePhotosInPdf,
  onChangeSiteNote,
  onToggleIncludeSiteNote,
  onAddSitePhotos,
  onRemoveSitePhoto,
  onToggleIncludeSitePhotos,
}: SiteNotesPhotosCardProps) {
  const [notesSectionOpen, setNotesSectionOpen] = useState(false);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handleSitePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const remaining = Math.max(0, MAX_SITE_PHOTOS - sitePhotos.length);
    if (remaining <= 0) return;

    setIsCompressingPhotos(true);
    setPhotoError(null);
    try {
      const compressed: SitePhoto[] = [];
      for (const file of files.slice(0, remaining)) {
        compressed.push(await compressSitePhoto(file, 1200, 0.75));
      }
      onAddSitePhotos(compressed);
    } catch {
      setPhotoError(
        locale === 'en'
          ? 'Could not process that image. Try a JPG or PNG photo.'
          : 'Kuvan käsittely epäonnistui. Kokeile JPG- tai PNG-kuvaa.'
      );
    } finally {
      setIsCompressingPhotos(false);
    }
  };

  return (
    <section
      className={`card card-collapsible${notesSectionOpen ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="section-collapse-btn"
        aria-expanded={notesSectionOpen}
        onClick={() => setNotesSectionOpen((o) => !o)}
      >
        <span className="card-title">
          {locale === 'en' ? 'Site notes & photos' : 'Muistiinpanot & kuvat'}
        </span>
        <span className="section-collapse-meta tabular-nums">
          <span>
            {siteNote.trim()
              ? locale === 'en'
                ? `Note · ${sitePhotos.length}/${MAX_SITE_PHOTOS}`
                : `Huomio · ${sitePhotos.length}/${MAX_SITE_PHOTOS}`
              : `${sitePhotos.length}/${MAX_SITE_PHOTOS}`}
          </span>
          {notesSectionOpen ? (
            <ChevronUp size={15} color="var(--ink-muted)" />
          ) : (
            <ChevronDown size={15} color="var(--ink-muted)" />
          )}
        </span>
      </button>

      {notesSectionOpen && (
        <div className="field-grid">
          <div className="field field-full">
            <label htmlFor="site-note-input">
              {locale === 'en'
                ? 'Notes (gate width, slopes, access)'
                : 'Huomiot (portin leveys, kaadot, erityishuomiot)'}
            </label>
            <textarea
              id="site-note-input"
              className="site-note-textarea"
              rows={2}
              maxLength={1200}
              placeholder={
                locale === 'en'
                  ? 'E.g. 2.6 m gate width, drain slopes toward street…'
                  : 'Esim. portin leveys 2,6 m, kaadot kadulle päin…'
              }
              value={siteNote}
              onChange={(e) => onChangeSiteNote(e.target.value)}
            />
          </div>

          <label className="field-full site-check-row">
            <input
              type="checkbox"
              checked={includeSiteNoteInPdf}
              onChange={(e) => onToggleIncludeSiteNote(e.target.checked)}
            />
            <span>
              {locale === 'en'
                ? 'Show notes in quote PDF'
                : 'Näytä tarjous-PDF:ssä'}
            </span>
          </label>

          <div className="field field-full">
            <div className="site-photo-actions">
              <label
                className="btn btn-subtle site-photo-upload-btn"
                aria-disabled={
                  isCompressingPhotos || sitePhotos.length >= MAX_SITE_PHOTOS
                }
                style={{
                  cursor:
                    isCompressingPhotos || sitePhotos.length >= MAX_SITE_PHOTOS
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isCompressingPhotos || sitePhotos.length >= MAX_SITE_PHOTOS
                      ? 0.55
                      : 1,
                }}
              >
                <Camera size={15} />
                <span>
                  {isCompressingPhotos
                    ? locale === 'en'
                      ? 'Compressing…'
                      : 'Pakataan…'
                    : locale === 'en'
                      ? `Add photo (${sitePhotos.length}/${MAX_SITE_PHOTOS})`
                      : `Lisää valokuva (${sitePhotos.length}/${MAX_SITE_PHOTOS})`}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    isCompressingPhotos || sitePhotos.length >= MAX_SITE_PHOTOS
                  }
                  onChange={handleSitePhotoUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {photoError && (
              <div className="site-storage-warning" role="alert">
                {photoError}
              </div>
            )}

            {sitePhotos.length > 0 && (
              <>
                <div className="site-photo-grid">
                  {sitePhotos.map((photo) => (
                    <div key={photo.id} className="site-photo-thumb">
                      <img src={photo.dataUrl} alt={photo.name} />
                      <button
                        type="button"
                        className="site-photo-remove"
                        onClick={() => onRemoveSitePhoto(photo.id)}
                        aria-label={
                          locale === 'en'
                            ? `Remove ${photo.name}`
                            : `Poista ${photo.name}`
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="site-check-row">
                  <input
                    type="checkbox"
                    checked={includeSitePhotosInPdf}
                    onChange={(e) =>
                      onToggleIncludeSitePhotos(e.target.checked)
                    }
                  />
                  <span>
                    {locale === 'en'
                      ? 'Attach photos as PDF appendix page'
                      : 'Liitä kuvat PDF-liitesivulle'}
                  </span>
                </label>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
