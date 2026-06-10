import { ArchiveProvider } from './providers/ArchiveProvider'
import { ArchiveStudio } from '../components/studio/ArchiveStudio'

export function App() {
  return (
    <ArchiveProvider>
      <ArchiveStudio />
    </ArchiveProvider>
  )
}
