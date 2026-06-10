import { useContext } from 'react'
import { ArchiveContext, type ArchiveContextValue } from './archiveContext'

/** Access the archive store. Throws if used outside <ArchiveProvider>. */
export function useArchive(): ArchiveContextValue {
  const ctx = useContext(ArchiveContext)
  if (!ctx) {
    throw new Error('useArchive must be used within <ArchiveProvider>')
  }
  return ctx
}
