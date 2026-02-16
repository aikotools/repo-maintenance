/**
 * List of dependents (who depends on me).
 */

import { ArrowLeft } from 'lucide-react'
import type { Repo } from '../../../shared/types'

interface DependentsListProps {
  dependents: string[]
  allRepos: Repo[]
  onSelectRepo: (id: string) => void
}

export function DependentsList({ dependents, allRepos, onSelectRepo }: DependentsListProps) {
  if (dependents.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No other repos depend on this one
      </div>
    )
  }

  const dependentRepos = dependents
    .map((id) => allRepos.find((r) => r.id === id))
    .filter(Boolean)
    .sort((a, b) => a!.domain.localeCompare(b!.domain))

  return (
    <div className="divide-y divide-border">
      {dependentRepos.map((repo) => (
        <button
          key={repo!.id}
          onClick={() => onSelectRepo(repo!.id)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1">{repo!.id}</span>
          <span className="text-xs text-muted-foreground">{repo!.domain}</span>
          <span className="text-xs text-muted-foreground">{repo!.type}</span>
        </button>
      ))}
    </div>
  )
}
