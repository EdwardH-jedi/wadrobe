// Backup & transfer — the settings-side entry point for getting an archive out
// of this browser as one JSON file, and back in again.
//
// Honest framing throughout: the export is built locally and handed to the
// browser's download (nothing is uploaded), and an import is REVIEWED before it
// is committed — the report lists every entry that was dropped and why, and the
// user picks whether to merge or replace.
import { useRef, useState, type ChangeEvent } from 'react'
import { useArchive } from '../../app/providers/useArchive'
import { downloadBlob } from '../../lib/download'
import {
  suggestArchiveExportFileName,
  type ArchiveExportStats,
} from '../../lib/storage/archiveExport'
import {
  readArchiveFileText,
  reviewArchiveImportText,
  summarizeArchiveImport,
  type ArchiveImportMode,
  type ArchiveImportReview,
  type ArchiveImportSummary,
} from '../../lib/storage/archiveImport'
import { cx } from '../../lib/cx'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'

export interface ArchiveTransferModalProps {
  open: boolean
  onClose: () => void
}

type ExportState =
  | { status: 'idle' }
  | { status: 'working'; done: number; total: number }
  | { status: 'done'; stats: ArchiveExportStats; fileName: string; bytes: number }
  | { status: 'error'; message: string }

/** Yield to the event loop this often so the progress bar can actually paint. */
const EXPORT_PAINT_INTERVAL = 25

const MODES: { id: ArchiveImportMode; label: string; hint: string }[] = [
  {
    id: 'merge',
    label: 'Merge',
    hint: 'Adds what is new. Pieces and looks already in this archive are kept as they are.',
  },
  {
    id: 'replace',
    label: 'Replace everything',
    hint: 'This archive is discarded and the file becomes the archive. Export a backup first.',
  },
]

/** Human file size for the export receipt. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function ArchiveTransferModal({ open, onClose }: ArchiveTransferModalProps) {
  const { garments, savedOutfits, exportArchive, importArchive } = useArchive()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' })
  const [review, setReview] = useState<ArchiveImportReview | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [mode, setMode] = useState<ArchiveImportMode>('merge')
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ArchiveImportSummary | null>(null)

  const resetImport = () => {
    setReview(null)
    setFileName('')
    setSummary(null)
    setMode('merge')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    resetImport()
    setExportState({ status: 'idle' })
    onClose()
  }

  const handleExport = async () => {
    setExportState({ status: 'working', done: 0, total: garments.length })
    try {
      const { blob, stats } = await exportArchive(async (done, total) => {
        setExportState({ status: 'working', done, total })
        // The export loop holds the main thread; without a macrotask yield the
        // bar would jump straight from 0 to done.
        if (done % EXPORT_PAINT_INTERVAL === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      })
      const name = suggestArchiveExportFileName()
      if (!downloadBlob(blob, name)) {
        setExportState({
          status: 'error',
          message: 'This browser could not start the download.',
        })
        return
      }
      setExportState({
        status: 'done',
        stats,
        fileName: name,
        bytes: blob.size,
      })
    } catch {
      setExportState({
        status: 'error',
        message: 'The export could not be built. Nothing was changed.',
      })
    }
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSummary(null)
    setFileName(file.name)
    setReview(reviewArchiveImportText(await readArchiveFileText(file)))
  }

  const handleImport = async () => {
    if (!review?.ok) return
    setImporting(true)
    try {
      setSummary(await importArchive(review, mode))
      // Clear the picked file so the panel shows the outcome, not a stale
      // selection that looks like it is still pending.
      setReview(null)
      setFileName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setImporting(false)
    }
  }

  const preview = review
    ? summarizeArchiveImport(review, { garments, savedOutfits }, mode)
    : null
  // A long report scrolls, so lead with the counts — that is what tells a user
  // whether anything needs acting on before they read the individual lines.
  const dropped =
    review?.issues.filter((i) => i.severity === 'dropped').length ?? 0
  const warnings =
    review?.issues.filter((i) => i.severity === 'warning').length ?? 0

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow="Archive data"
      title="Backup & transfer"
      size="lg"
      footer={<Button onClick={handleClose}>Done</Button>}
    >
      <div className="transfer">
        <section className="transfer__section">
          <h3 className="transfer__heading">Export</h3>
          <p className="transfer__copy">
            One JSON file holding every archived piece, every saved look and the
            current outfit. Images kept in this browser&rsquo;s asset store are
            written into the file as base64, so it stands on its own — nothing is
            uploaded and no server is involved.
          </p>
          <div className="transfer__row">
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={exportState.status === 'working'}
            >
              <Icon name="download" size={16} />
              {exportState.status === 'working' ? 'Building…' : 'Export JSON'}
            </Button>
            <span className="transfer__stat">
              {plural(garments.length, 'piece', 'pieces')} ·{' '}
              {plural(savedOutfits.length, 'look', 'looks')}
            </span>
          </div>
          {exportState.status === 'working' && exportState.total > 0 && (
            <div className="transfer__progress">
              <div
                className="transfer__progress-track"
                role="progressbar"
                aria-label="Export progress"
                aria-valuemin={0}
                aria-valuemax={exportState.total}
                aria-valuenow={exportState.done}
              >
                <div
                  className="transfer__progress-fill"
                  style={{
                    width: `${Math.round(
                      (exportState.done / exportState.total) * 100,
                    )}%`,
                  }}
                />
              </div>
              <span className="transfer__stat">
                Inlining images — {exportState.done} of {exportState.total} pieces
              </span>
            </div>
          )}
          {exportState.status === 'done' && (
            <div className="transfer__report">
              <div className="transfer__report-head">
                Saved <b>{exportState.fileName}</b> ·{' '}
                {formatBytes(exportState.bytes)} ·{' '}
                {plural(exportState.stats.garmentCount, 'piece', 'pieces')} ·{' '}
                {plural(exportState.stats.savedOutfitCount, 'look', 'looks')} ·{' '}
                {plural(exportState.stats.inlinedImageCount, 'image', 'images')}{' '}
                inlined
              </div>
              {exportState.stats.unresolvedImageCount > 0 && (
                <div className="transfer__issue transfer__issue--dropped">
                  {plural(
                    exportState.stats.unresolvedImageCount,
                    'stored image',
                    'stored images',
                  )}{' '}
                  could not be read from this browser&rsquo;s asset store; those
                  pieces exported with their thumbnail instead.
                </div>
              )}
            </div>
          )}
          {exportState.status === 'error' && (
            <div className="transfer__warn">{exportState.message}</div>
          )}
        </section>

        <section className="transfer__section">
          <h3 className="transfer__heading">Import</h3>
          <p className="transfer__copy">
            Read an exported file back in. It is checked first — anything
            malformed is listed below and skipped, and nothing is written to this
            archive until you confirm.
          </p>
          <div className="transfer__row">
            <Button onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={16} />
              Choose a file
            </Button>
            {fileName && <span className="transfer__stat">{fileName}</span>}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="transfer__file"
              aria-label="Archive export file"
              onChange={handleFile}
            />
          </div>

          {review && !review.ok && (
            <div className="transfer__report">
              {review.issues.map((issue, index) => (
                <div
                  key={index}
                  className="transfer__issue transfer__issue--dropped"
                >
                  {issue.message}
                </div>
              ))}
            </div>
          )}

          {review?.ok && preview && (
            <>
              <div className="transfer__report">
                <div className="transfer__report-head">
                  This file holds{' '}
                  {plural(review.garments.length, 'piece', 'pieces')} and{' '}
                  {plural(review.savedOutfits.length, 'look', 'looks')}.
                </div>
                {review.issues.length > 0 && (
                  <div className="transfer__issue-count">
                    {dropped > 0 &&
                      `${plural(dropped, 'entry', 'entries')} skipped`}
                    {dropped > 0 && warnings > 0 && ' · '}
                    {warnings > 0 &&
                      `${plural(warnings, 'entry', 'entries')} kept with a warning`}
                    . Each one is listed below.
                  </div>
                )}
                {review.issues.length > 0 && (
                  <div className="transfer__issues">
                    {review.issues.map((issue, index) => (
                      <div
                        key={index}
                        className={cx(
                          'transfer__issue',
                          issue.severity === 'dropped' &&
                            'transfer__issue--dropped',
                        )}
                      >
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="transfer__modes">
                {MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cx('chip', mode === option.id && 'chip--active')}
                    aria-pressed={mode === option.id}
                    onClick={() => setMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="transfer__copy">
                {MODES.find((option) => option.id === mode)?.hint}
              </p>

              <div className="transfer__row">
                <Button
                  variant={mode === 'replace' ? 'danger' : 'primary'}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {mode === 'replace'
                    ? `Replace archive with ${plural(preview.garmentsAdded, 'piece', 'pieces')}`
                    : `Import ${plural(preview.garmentsAdded, 'piece', 'pieces')}`}
                </Button>
                <Button variant="ghost" onClick={resetImport}>
                  Cancel
                </Button>
              </div>
              <div className="transfer__stat">
                {mode === 'replace'
                  ? `${plural(preview.garmentsRemoved, 'piece', 'pieces')} and ${plural(
                      preview.savedOutfitsRemoved,
                      'look',
                      'looks',
                    )} currently in this archive will be removed.`
                  : `${plural(preview.garmentsSkipped, 'piece', 'pieces')} already archived — the existing record is kept.`}
              </div>
            </>
          )}

          {summary && (
            <div className="transfer__report">
              <div className="transfer__report-head">
                Imported{' '}
                {plural(summary.garmentsAdded, 'piece', 'pieces')} and{' '}
                {plural(summary.savedOutfitsAdded, 'look', 'looks')}
                {summary.mode === 'replace'
                  ? `, removing ${plural(summary.garmentsRemoved, 'piece', 'pieces')}.`
                  : `, keeping ${plural(summary.garmentsSkipped, 'existing piece', 'existing pieces')}.`}
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
