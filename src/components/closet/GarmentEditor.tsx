// Shared garment metadata fields (used by both the upload flow and the editor)
// plus the modal for editing an existing archived piece.
import { useEffect, useState, type KeyboardEvent } from 'react'
import type { GarmentDraft, GarmentItem } from '../../domain/garmentTypes'
import {
  CATEGORY_ORDER,
  CATEGORY_META,
  COLOR_OPTIONS,
  STYLE_TAG_SUGGESTIONS,
} from '../../domain/garmentTaxonomy'
import {
  garmentToDraft,
  isNameMissing,
  normalizeDraft,
} from '../../domain/garmentDraft'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { MarketValuePanel } from './MarketValuePanel'

export interface GarmentFieldsProps {
  draft: GarmentDraft
  onChange: (patch: Partial<GarmentDraft>) => void
  /** Flags the (required) name field as invalid — a11y + a red border. */
  nameInvalid?: boolean
}

/** Controlled field set for editing a garment's metadata. */
export function GarmentFields({
  draft,
  onChange,
  nameInvalid = false,
}: GarmentFieldsProps) {
  const [tagText, setTagText] = useState('')

  const addTag = (raw: string) => {
    const value = raw.trim().toLowerCase()
    if (value && !draft.styleTags.includes(value)) {
      onChange({ styleTags: [...draft.styleTags, value] })
    }
    setTagText('')
  }

  const removeTag = (tag: string) => {
    onChange({ styleTags: draft.styleTags.filter((t) => t !== tag) })
  }

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagText)
    } else if (e.key === 'Backspace' && tagText === '' && draft.styleTags.length) {
      removeTag(draft.styleTags[draft.styleTags.length - 1])
    }
  }

  const suggestions = STYLE_TAG_SUGGESTIONS.filter(
    (t) => !draft.styleTags.includes(t),
  ).slice(0, 8)

  return (
    <div className="upload">
      <div className="field__row">
        <div className="field">
          <label className="field__label" htmlFor="g-name">
            Name
          </label>
          <input
            id="g-name"
            className="field__input"
            value={draft.name}
            aria-invalid={nameInvalid || undefined}
            placeholder="e.g. Wool Overcoat"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="g-brand">
            Brand (optional)
          </label>
          <input
            id="g-brand"
            className="field__input"
            value={draft.brand ?? ''}
            placeholder="e.g. Maison Grey"
            onChange={(e) => onChange({ brand: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Category</span>
        <div className="catpills">
          {CATEGORY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={cx('catpill', draft.category === id && 'catpill--active')}
              onClick={() => onChange({ category: id })}
            >
              {CATEGORY_META[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Color · {draft.color}</span>
        <div className="colorgrid">
          {COLOR_OPTIONS.map((option) => (
            <button
              key={option.hex}
              type="button"
              title={option.name}
              aria-label={option.name}
              className={cx(
                'colorswatch',
                draft.colorHex === option.hex && 'colorswatch--active',
              )}
              style={{ background: option.hex }}
              onClick={() =>
                onChange({ color: option.name, colorHex: option.hex })
              }
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Style tags</span>
        <div className="taginput">
          {draft.styleTags.map((tag) => (
            <span key={tag} className="tagchip">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => removeTag(tag)}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          <input
            className="field__input"
            style={{ flex: 1, minWidth: 120 }}
            value={tagText}
            placeholder="Add a tag, press Enter"
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={onTagKey}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="tagsuggest">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => addTag(s)}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field__row">
        <div className="field">
          <label className="field__label" htmlFor="g-material">
            Material (optional)
          </label>
          <input
            id="g-material"
            className="field__input"
            value={draft.material ?? ''}
            placeholder="e.g. 100% wool"
            onChange={(e) => onChange({ material: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="g-size">
            Size (optional)
          </label>
          <input
            id="g-size"
            className="field__input"
            value={draft.size ?? ''}
            placeholder="e.g. M / 32 / EU 42"
            onChange={(e) => onChange({ size: e.target.value })}
          />
        </div>
      </div>

      <div className="field__row">
        <div className="field">
          <label className="field__label" htmlFor="g-subtype">
            Subtype (optional)
          </label>
          <input
            id="g-subtype"
            className="field__input"
            value={draft.subtype ?? ''}
            placeholder="e.g. bomber / loafer"
            onChange={(e) => onChange({ subtype: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="g-price">
            Price (optional)
          </label>
          <div className="taginput" style={{ gap: 8 }}>
            <input
              id="g-price"
              className="field__input"
              style={{ flex: 1, minWidth: 90 }}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={draft.price ?? ''}
              placeholder="e.g. 129"
              onChange={(e) => {
                const n = e.target.valueAsNumber
                onChange({ price: Number.isNaN(n) ? undefined : n })
              }}
            />
            <input
              className="field__input"
              style={{ width: 88 }}
              aria-label="Currency"
              value={draft.currency ?? ''}
              placeholder="USD"
              onChange={(e) => onChange({ currency: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="g-notes">
          Notes (optional)
        </label>
        <textarea
          id="g-notes"
          className="field__textarea"
          value={draft.notes ?? ''}
          placeholder="Fit, fabric, where you wear it…"
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

export interface EditGarmentModalProps {
  garment: GarmentItem | null
  onClose: () => void
}

/** Modal for editing an existing archived piece. */
export function EditGarmentModal({ garment, onClose }: EditGarmentModalProps) {
  const { updateGarment } = useArchive()
  const [draft, setDraft] = useState<GarmentDraft | null>(null)

  useEffect(() => {
    setDraft(garment ? garmentToDraft(garment) : null)
  }, [garment])

  const open = garment !== null && draft !== null
  const nameMissing = draft ? isNameMissing(draft.name) : false

  const handleSave = () => {
    if (!garment || !draft || isNameMissing(draft.name)) return
    updateGarment(garment.id, normalizeDraft(draft))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Edit piece"
      title={garment?.name ?? 'Edit piece'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={nameMissing} onClick={handleSave}>
            Save changes
          </Button>
        </>
      }
    >
      {draft && (
        <div className="upload__grid">
          <div className="preview">
            <img src={getGarmentDisplayImage(draft)} alt={draft.name} />
          </div>
          <div className="upload">
            <GarmentFields
              draft={draft}
              nameInvalid={nameMissing}
              onChange={(patch) =>
                setDraft((current) =>
                  current ? { ...current, ...patch } : current,
                )
              }
            />
            {nameMissing && (
              <p style={{ color: 'var(--danger)', fontSize: 12 }}>
                Name this archive piece before saving.
              </p>
            )}
            {garment && <MarketValuePanel garment={garment} />}
          </div>
        </div>
      )}
    </Modal>
  )
}
