// Renders the "Fit Check" — an editorial read on the current outfit's palette,
// tone and style. Pure logic lives in `domain/fitCheck.ts`.
import { useMemo } from 'react'
import { generateFitCheck } from '../../domain/fitCheck'
import { useArchive } from '../../app/providers/useArchive'

export function FitCheck() {
  const { selectedGarments } = useArchive()
  const fit = useMemo(
    () => generateFitCheck(selectedGarments),
    [selectedGarments],
  )

  return (
    <div className="fitcheck">
      <div className="fitcheck__head">
        <div>
          <div className="eyebrow">Fit check</div>
          <div className="fitcheck__rating">{fit.rating}</div>
        </div>
        <div className="eyebrow">
          {fit.filledSlots}/{fit.totalSlots}
        </div>
      </div>

      <div className="fitcheck__meter">
        <span style={{ width: `${Math.round(fit.completeness * 100)}%` }} />
      </div>

      <div className="fitcheck__rows">
        <div className="fitcheck__row">
          <span>Palette</span>
          {fit.palette.length > 0 ? (
            <div className="fitcheck__palette">
              {fit.palette.map((hex) => (
                <span
                  key={hex}
                  className="swatch"
                  style={{ background: hex }}
                  title={hex}
                />
              ))}
            </div>
          ) : (
            <span className="muted">—</span>
          )}
        </div>

        <div className="fitcheck__row">
          <span>Tone</span>
          <span style={{ color: 'var(--text-100)' }}>{fit.toneLabel}</span>
        </div>

        <div className="fitcheck__row">
          <span>Style</span>
          {fit.dominantTags.length > 0 ? (
            <div className="fitcheck__tags">
              {fit.dominantTags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted">{fit.styleLabel}</span>
          )}
        </div>
      </div>

      {fit.notes.length > 0 && (
        <div className="fitcheck__notes">
          {fit.notes.map((note) => (
            <p key={note} className="fitcheck__note">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
