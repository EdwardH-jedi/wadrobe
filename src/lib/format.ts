// Lightweight, locale-aware formatters.
const dateFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

/** Compact "Mar 3" style date from an epoch timestamp. */
export function formatDate(ts: number): string {
  return dateFmt.format(new Date(ts))
}
