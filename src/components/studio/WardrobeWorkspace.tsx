// Wardrobe Workspace — the "Refined Editorial" (1a) redesign: the six studio
// views collapse into ONE screen where browsing and styling happen together.
// A slim icon rail, a filterable garment grid, and a live "Today's fit" panel,
// with the decorative chrome (spotlights, chrome gradients) stripped. It reuses
// the existing store + domain wholesale — this is an IA + visual refinement, not
// new logic. Brand tokens (dark charcoal, brass accent, Bodoni titles) are kept.
import { useMemo, useState } from 'react'
import type { ClothingCategory, GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_META, CATEGORY_ORDER } from '../../domain/garmentTaxonomy'
import { generateFitCheck } from '../../domain/fitCheck'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'
import { Icon, type IconName } from '../ui/Icon'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import type { StudioView } from './views'

type CategoryFilter = 'all' | ClothingCategory

export interface WardrobeWorkspaceProps {
  onUpload: () => void
  onEdit: (garment: GarmentItem) => void
  onDetails: (garment: GarmentItem) => void
  onProxy3d: (garment: GarmentItem) => void
  /** Navigate to a legacy view (mirror/lookbook/outfits) from the rail. */
  onOpenView: (view: StudioView) => void
}

const RAIL: { view: StudioView; icon: IconName; label: string }[] = [
  { view: 'mirror', icon: 'mirror', label: 'Mirror' },
  { view: 'lookbook', icon: 'layers', label: 'Lookbook' },
  { view: 'outfits', icon: 'outfits', label: 'Saved looks' },
]

export function WardrobeWorkspace({
  onUpload,
  onEdit,
  onDetails,
  onProxy3d,
  onOpenView,
}: WardrobeWorkspaceProps) {
  const {
    garments,
    currentOutfit,
    selectedGarments,
    selectGarment,
    clearSlot,
    removeGarment,
    saveOutfit,
    loadSampleArchive,
  } = useArchive()

  const [category, setCategory] = useState<CategoryFilter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lookName, setLookName] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const g of garments) g.styleTags.forEach((t) => set.add(t))
    return [...set].sort()
  }, [garments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false
      if (tag && !g.styleTags.includes(tag)) return false
      if (q) {
        const hay = [g.name, g.brand ?? '', g.color, g.styleTags.join(' ')]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [garments, category, tag, query])

  const fit = useMemo(
    () => generateFitCheck(selectedGarments),
    [selectedGarments],
  )

  const toggleFit = (garment: GarmentItem) => {
    if (currentOutfit[garment.category] === garment.id) {
      clearSlot(garment.category)
    } else {
      selectGarment(garment.id)
    }
  }

  const handleRemove = (garment: GarmentItem) => {
    if (window.confirm(`Remove "${garment.name}" from the archive?`)) {
      removeGarment(garment.id)
    }
  }

  const handleSave = () => {
    const name = lookName.trim() || fit.vibe
    const saved = saveOutfit(name)
    if (saved) {
      setSavedNote(`Saved “${saved.name}” to the board`)
      setLookName('')
      window.setTimeout(() => setSavedNote(null), 2600)
    }
  }

  return (
    <div className="wk">
      {/* icon rail */}
      <nav className="wk__rail" aria-label="Primary">
        <div className="wk__mark" aria-hidden="true">
          A
        </div>
        <button
          className="wk__railbtn wk__railbtn--active"
          aria-current="page"
          title="Wardrobe"
        >
          <Icon name="hanger" size={20} />
        </button>
        {RAIL.map((item) => (
          <button
            key={item.view}
            className="wk__railbtn"
            onClick={() => onOpenView(item.view)}
            title={item.label}
            aria-label={item.label}
          >
            <Icon name={item.icon} size={20} />
          </button>
        ))}
        <button
          className="wk__railbtn wk__railbtn--add"
          onClick={onUpload}
          title="Add piece"
          aria-label="Add piece"
        >
          <Icon name="plus" size={20} />
        </button>
      </nav>

      {/* main column */}
      <div className="wk__main">
        <div className="wk__head">
          <div className="wk__masthead">
            <h1 className="wk__title">Wardrobe</h1>
            <span className="wk__index">
              Personal index · {garments.length}{' '}
              {garments.length === 1 ? 'piece' : 'pieces'}
            </span>
          </div>
          <div className="wk__headtools">
            <label className="wk__search">
              <Icon name="closet" size={14} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pieces…"
                aria-label="Search pieces"
              />
            </label>
            <Button variant="primary" size="sm" onClick={onUpload}>
              <Icon name="plus" size={15} />
              Add piece
            </Button>
          </div>
        </div>

        {garments.length > 0 && (
          <div className="wk__filters">
            <button
              className={cx('wk__pill', category === 'all' && 'wk__pill--on')}
              onClick={() => setCategory('all')}
            >
              All
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                className={cx('wk__pill', category === c && 'wk__pill--on')}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_META[c].plural}
              </button>
            ))}
            {allTags.length > 0 && <span className="wk__divider" />}
            {allTags.map((t) => (
              <button
                key={t}
                className={cx('wk__tag', tag === t && 'wk__tag--on')}
                onClick={() => setTag(tag === t ? null : t)}
              >
                {tag === t ? `${t} ×` : t}
              </button>
            ))}
          </div>
        )}

        <div className="wk__gridwrap">
          {garments.length === 0 ? (
            <EmptyState
              icon="hanger"
              title="Your archive is empty"
              text="Upload a photo of a piece you own to begin — or load a sample set to explore the workspace."
              actions={
                <>
                  <Button variant="primary" onClick={onUpload}>
                    <Icon name="upload" size={16} />
                    Upload a piece
                  </Button>
                  <Button variant="ghost" onClick={loadSampleArchive}>
                    Load sample archive
                  </Button>
                </>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="closet"
              title="Nothing in this filter"
              text="No pieces match the current search, category and tag."
              actions={
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCategory('all')
                    setTag(null)
                    setQuery('')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="wk__grid">
              {filtered.map((g) => {
                const inFit = currentOutfit[g.category] === g.id
                return (
                  <article
                    key={g.id}
                    className={cx('wk__card', inFit && 'wk__card--on')}
                  >
                    <button
                      className="wk__cardmedia"
                      onClick={() => toggleFit(g)}
                      aria-pressed={inFit}
                      aria-label={
                        inFit ? `Remove ${g.name} from fit` : `Style ${g.name}`
                      }
                    >
                      <img
                        src={getGarmentDisplayImage(g)}
                        alt={g.name}
                        loading="lazy"
                      />
                      {inFit && <span className="wk__tick" aria-hidden="true" />}
                    </button>
                    <div className="wk__cardtools" role="group" aria-label="Piece actions">
                      <button title="Details" aria-label={`Details for ${g.name}`} onClick={() => onDetails(g)}>
                        <Icon name="info" size={14} />
                      </button>
                      <button title="Edit" aria-label={`Edit ${g.name}`} onClick={() => onEdit(g)}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button title="3D preview" aria-label={`3D preview for ${g.name}`} onClick={() => onProxy3d(g)}>
                        <Icon name="cube" size={14} />
                      </button>
                      <button title="Remove" aria-label={`Remove ${g.name}`} onClick={() => handleRemove(g)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                    <div className="wk__cardcap">
                      <div className="wk__cardname">{g.name}</div>
                      <div className="wk__cardtag">
                        {[g.brand, CATEGORY_META[g.category].label]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* fit panel — a stylist's manifest */}
      <aside className="wk__fit" aria-label="Today's fit">
        <div className="wk__fithead">
          <div className="wk__fitheadl">
            <span className="wk__fittitle">Today&apos;s fit</span>
            <span className="wk__fitslots">
              {fit.filledSlots} of {fit.totalSlots} slots
            </span>
          </div>
          <span
            className={cx(
              'wk__stamp',
              `wk__stamp--${fit.rating === 'Empty' ? 'empty' : 'on'}`,
            )}
          >
            {fit.rating}
          </span>
        </div>
        <div
          className="wk__ticks"
          role="progressbar"
          aria-valuenow={fit.filledSlots}
          aria-valuemin={0}
          aria-valuemax={fit.totalSlots}
          aria-label="Fit completeness"
        >
          {Array.from({ length: fit.totalSlots }).map((_, i) => (
            <span
              key={i}
              className={cx('wk__ticka', i < fit.filledSlots && 'wk__ticka--on')}
            />
          ))}
        </div>

        {selectedGarments.length > 0 && (
          <div className="wk__manifest">
            <div className="wk__spec">
              <span className="wk__speclabel">Palette</span>
              <div className="wk__swatches">
                {fit.palette.map((hex, i) => (
                  <span key={hex + i} className="wk__swatch" title={fit.paletteNames[i]}>
                    <span
                      className="wk__swatchchip"
                      style={{ background: hex }}
                      aria-hidden="true"
                    />
                    <span className="wk__swatchname">{fit.paletteNames[i]}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="wk__specrow">
              <span className="wk__speclabel">Tone</span>
              <span className="wk__specval">{fit.toneLabel}</span>
            </div>
            <div className="wk__specrow">
              <span className="wk__speclabel">Style</span>
              <span className="wk__specval">{fit.styleLabel}</span>
            </div>
          </div>
        )}

        <div className="wk__fitlist">
          {selectedGarments.length === 0 ? (
            <p className="wk__fitempty">
              Select pieces from the grid to build a fit.
            </p>
          ) : (
            selectedGarments.map((g) => (
              <button
                key={g.id}
                className="wk__fititem"
                onClick={() => clearSlot(g.category)}
                title={`Remove ${g.name} from the fit`}
                aria-label={`Remove ${g.name} from the fit`}
              >
                <span className="wk__fitthumb">
                  <img src={getGarmentDisplayImage(g)} alt="" />
                </span>
                <span className="wk__fitinfo">
                  <span className="wk__fitcat">{CATEGORY_META[g.category].label}</span>
                  <span className="wk__fitname">{g.name}</span>
                </span>
                <span
                  className="wk__fitdot"
                  style={{ background: g.colorHex }}
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>

        <div className="wk__fitfoot">
          {savedNote && <p className="wk__saved">{savedNote}</p>}
          {selectedGarments.length > 0 && (
            <input
              className="wk__nameinput"
              value={lookName}
              onChange={(e) => setLookName(e.target.value)}
              placeholder={`Name this look — e.g. ${fit.vibe}`}
              aria-label="Name this look"
            />
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={selectedGarments.length === 0}
          >
            <Icon name="check" size={15} />
            Save look
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenView('mirror')}>
            Preview on mannequin
          </Button>
        </div>
      </aside>
    </div>
  )
}
