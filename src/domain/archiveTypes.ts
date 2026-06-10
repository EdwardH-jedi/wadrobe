// Archive activity events.
//
// ArchiveEvents are emitted by the store on every meaningful mutation. The UI
// uses the most recent event to trigger the "Archive Piece entering the room"
// transition and to drive a subtle activity feel. Events are append-only and
// capped to a small recent window in the store.

export type ArchiveEventType =
  | 'garment_added'
  | 'garment_updated'
  | 'garment_removed'
  | 'outfit_saved'
  | 'outfit_removed'
  | 'outfit_restored'
  | 'outfit_cleared'

export interface ArchiveEvent {
  id: string
  type: ArchiveEventType
  /** Epoch milliseconds. */
  at: number
  /** Short human-readable summary, e.g. "Archived: Wool Overcoat". */
  label: string
  garmentId?: string
  outfitId?: string
}
