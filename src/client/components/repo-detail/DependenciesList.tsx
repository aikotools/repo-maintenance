/**
 * List of internal dependencies (who I depend on).
 */

import { ArrowRight } from 'lucide-react'
import type { InternalDep } from '../../../shared/types'

interface DependenciesListProps {
  dependencies: InternalDep[]
  onSelectRepo: (id: string) => void
}

export function DependenciesList({ dependencies, onSelectRepo }: DependenciesListProps) {
  if (dependencies.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No internal dependencies (leaf node)
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {dependencies.map((dep) => (
        <button
          key={dep.npmName}
          onClick={() => dep.repoId && onSelectRepo(dep.repoId)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
        >
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1">{dep.repoId || dep.npmName}</span>
          <span className="font-mono text-xs text-muted-foreground">{dep.versionSpec}</span>
        </button>
      ))}
    </div>
  )
}
