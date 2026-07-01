import type { ReactNode } from 'react'
import { useRepo } from '../state/RepoContext'

// Skydd för repo-scopade GitHub-vyer: kräver ett öppet repo. Enhetligt
// tomtillstånd i stället för att varje vy visar "Inga …" när inget repo finns.
export function RepoScopeGuard({ children }: { children: ReactNode }): JSX.Element {
  const { repo } = useRepo()
  if (!repo)
    return (
      <div className="hint">
        Öppna ett repo i källkontrollen för att se den här vyn för det projektet.
      </div>
    )
  return <>{children}</>
}
