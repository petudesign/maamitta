import {
  CopyPlus,
  FolderOpen,
  HelpCircle,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatArea } from '../../engine/format';
import { summarizeGeometry } from '../../engine/geometry';
import type { DrawTool } from '../../engine/types';
import { getMessages, type Locale } from '../../i18n';
import type { SavedProject } from '../../store/projectStore';

interface PanelHeaderProps {
  locale: Locale;
  activeTool: DrawTool;
  isTouchUi: boolean;
  projects: SavedProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, title: string) => void;
  onDeleteProject: (id: string) => void;
  onCloseMobile: () => void;
}

export function PanelHeader({
  locale,
  activeTool,
  isTouchUi,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onCloseMobile,
}: PanelHeaderProps) {
  const t = getMessages(locale).panel;
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<
    string | null
  >(null);
  const projectSwitcherRef = useRef<HTMLDivElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const deleteConfirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current !== null) {
        window.clearTimeout(deleteConfirmTimerRef.current);
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

  // Only compute all project areas when the project switcher popover is open
  const projectAreas = useMemo(() => {
    if (!projectsOpen) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const proj of projects) {
      map.set(
        proj.id,
        summarizeGeometry(proj.geometry, proj.slopePct).effectiveAreaSqm
      );
    }
    return map;
  }, [projects, projectsOpen]);

  return (
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
            (isTouchUi
              ? locale === 'en'
                ? 'Tap a parcel on the map · use Add to quote for multiple zones'
                : 'Napauta tonttia kartalta · lisää useita alueita + Lisää tarjoukseen'
              : locale === 'en'
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
                  <strong>
                    Shift + {locale === 'en' ? 'click:' : 'klikkaus:'}
                  </strong>{' '}
                  {locale === 'en'
                    ? 'Select multiple parcels into the same quote.'
                    : 'Valitse useampi tontti samaan tarjoukseen.'}
                </li>
                <li>
                  <strong>
                    {locale === 'en' ? 'Edit corners:' : 'Muokkaa kulmia:'}
                  </strong>{' '}
                  {locale === 'en'
                    ? 'Drag blue dots to move, drag small white dots to add, right-click to delete.'
                    : 'Vedä sinisiä pisteitä siirtääksesi, pieniä valkoisia lisätäksesi, oikea klikkaus poistaa.'}
                </li>
                <li>
                  <strong>
                    {locale === 'en' ? 'Shortcuts:' : 'Pikanäppäimet:'}
                  </strong>{' '}
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
                              if (deleteConfirmTimerRef.current !== null) {
                                window.clearTimeout(
                                  deleteConfirmTimerRef.current
                                );
                              }
                              deleteConfirmTimerRef.current = window.setTimeout(
                                () => {
                                  setPendingDeleteProjectId((curr) =>
                                    curr === proj.id ? null : curr
                                  );
                                  deleteConfirmTimerRef.current = null;
                                },
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
  );
}
