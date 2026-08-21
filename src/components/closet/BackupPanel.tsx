// Backup / restore for a local-first archive.
//
// The archive lives only in this browser profile. Clearing site data, switching
// machine or losing the profile loses everything, and there is no server copy —
// so a portable file is the only recovery path there is.
//
// Import is deliberately explicit: a file is validated and *reviewed* first, the
// user picks merge or replace, and nothing is applied until they confirm. A
// malformed file is rejected with a reason rather than partially applied.
import { useRef, useState } from 'react'
import { useArchive } from '../../app/providers/useArchive'
import {
  buildArchiveExportBlob,
  suggestArchiveExportFileName,
} from '../../lib/storage/archiveExport'
import {
  readArchiveFileText,
  reviewArchiveImportText,
  summarizeArchiveImport,
  type ArchiveImportMode,
  type ArchiveImportReview,
  type ArchiveImportSummary,
} from '../../lib/storage/archiveImport'
import { getAssetBlobStore } from '../../lib/storage/assetBlobStore'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

type Phase =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'exported'; fileName: string; garments: number }
  | { kind: 'reading' }
  | { kind: 'review'; review: ArchiveImportReview; fileName: string }
  | { kind: 'imported'; summary: ArchiveImportSummary }
  | { kind: 'error'; message: string }

export function BackupPanel() {
  const { garments, savedOutfits, currentOutfit, importArchive } = useArchive()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [mode, setMode] = useState<ArchiveImportMode>('merge')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setPhase({ kind: 'exporting' })
    try {
      // Image bytes live in the blob store; passing it in is what makes the
      // backup self-contained rather than a set of dangling references.
      const blobStore = await getAssetBlobStore().catch(() => null)
      const { blob, stats } = await buildArchiveExportBlob(
        { garments, savedOutfits, currentOutfit },
        { blobStore },
      )
      const fileName = suggestArchiveExportFileName()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      // Revoke on the next tick so the download has taken the handle.
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setPhase({ kind: 'exported', fileName, garments: stats.garmentCount })
    } catch (error) {
      setPhase({
        kind: 'error',
        message:
          error instanceof Error
            ? `Export failed: ${error.message}`
            : 'Export failed.',
      })
    }
  }

  const handleFile = async (file: File) => {
    setPhase({ kind: 'reading' })
    try {
      const text = await readArchiveFileText(file)
      const review = reviewArchiveImportText(text)
      if (!review.ok) {
        setPhase({
          kind: 'error',
          message:
            review.issues[0]?.message ??
            'That file is not a readable archive backup.',
        })
        return
      }
      setPhase({ kind: 'review', review, fileName: file.name })
    } catch {
      setPhase({ kind: 'error', message: 'That file could not be read.' })
    }
  }

  const applyImport = (review: ArchiveImportReview) => {
    const summary = importArchive(review, mode)
    setPhase({ kind: 'imported', summary })
  }

  const preview =
    phase.kind === 'review'
      ? summarizeArchiveImport(phase.review, { garments, savedOutfits }, mode)
      : null

  return (
    <div className="stack">
      <p className="muted">
        Your archive lives in this browser only. A backup file is the one way to
        move it to another browser or recover it after clearing site data.
      </p>

      <div className="row">
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={phase.kind === 'exporting' || garments.length === 0}
        >
          <Icon name="layers" size={16} />
          {phase.kind === 'exporting' ? 'Preparing…' : 'Export archive'}
        </Button>

        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" size={16} />
          Import backup
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Choose a backup file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset so choosing the same file twice fires change again.
            e.target.value = ''
            if (file) void handleFile(file)
          }}
        />
      </div>

      {phase.kind === 'exported' && (
        <p className="muted" role="status">
          Saved <strong>{phase.fileName}</strong> — {phase.garments}{' '}
          {phase.garments === 1 ? 'piece' : 'pieces'}, images included.
        </p>
      )}

      {phase.kind === 'error' && (
        <p className="form-error" role="alert">
          {phase.message}
        </p>
      )}

      {phase.kind === 'review' && preview && (
        <div className="stack" role="group" aria-label="Confirm import">
          <p className="muted">
            <strong>{phase.fileName}</strong> holds{' '}
            {phase.review.garments.length}{' '}
            {phase.review.garments.length === 1 ? 'piece' : 'pieces'} and{' '}
            {phase.review.savedOutfits.length} saved{' '}
            {phase.review.savedOutfits.length === 1 ? 'look' : 'looks'}.
          </p>

          {phase.review.issues.length > 0 && (
            <p className="muted">
              {phase.review.issues.length} entr
              {phase.review.issues.length === 1 ? 'y was' : 'ies were'} skipped
              as unreadable: {phase.review.issues[0].message}
            </p>
          )}

          <fieldset className="stack">
            <legend className="eyebrow">How should it be applied?</legend>
            <label className="row">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                <strong>Merge</strong> — add pieces this archive does not have.
                Nothing here is changed or removed.
              </span>
            </label>
            <label className="row">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <span>
                <strong>Replace</strong> — discard the current archive and use
                the file instead.
              </span>
            </label>
          </fieldset>

          <p className="muted">
            {mode === 'replace'
              ? `This will remove ${preview.garmentsRemoved} piece(s) currently archived and add ${preview.garmentsAdded}.`
              : `This will add ${preview.garmentsAdded} piece(s) and skip ${preview.garmentsSkipped} already archived.`}
          </p>

          <div className="row">
            <Button
              variant={mode === 'replace' ? 'danger' : 'primary'}
              onClick={() => applyImport(phase.review)}
            >
              {mode === 'replace' ? 'Replace archive' : 'Merge into archive'}
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {phase.kind === 'imported' && (
        <p className="muted" role="status">
          Imported: {phase.summary.garmentsAdded} piece(s) added
          {phase.summary.garmentsSkipped > 0 &&
            `, ${phase.summary.garmentsSkipped} skipped`}
          {phase.summary.garmentsRemoved > 0 &&
            `, ${phase.summary.garmentsRemoved} removed`}
          .
        </p>
      )}
    </div>
  )
}
