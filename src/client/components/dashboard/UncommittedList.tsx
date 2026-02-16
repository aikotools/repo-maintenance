/**
 * List of repos with uncommitted changes.
 */

import { AlertCircle } from 'lucide-react'
import type { Repo } from '../../../shared/types'

interface UncommittedListProps {
  repos: Repo[]
  onSelectRepo: (id: string) => void
}

export function UncommittedList({ repos, onSelectRepo }: UncommittedListProps) {
  const uncommitted = repos.filter((r) => r.gitStatus?.hasUncommittedChanges)

  if (uncommitted.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        All repos are clean. No uncommitted changes.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertCircle className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-medium">Uncommitted Changes ({uncommitted.length})</h3>
      </div>
      <div className="divide-y divide-border">
        {uncommitted.map((repo) => (
          <button
            key={repo.id}
            onClick={() => onSelectRepo(repo.id)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent"
          >
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span className="min-w-0 flex-1 truncate font-medium">{repo.id}</span>
            <span className="text-xs text-muted-foreground">{repo.domain}</span>
            <span className="text-xs text-muted-foreground">
              {repo.gitStatus?.branch || 'unknown'}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {(repo.gitStatus?.modifiedCount || 0) +
                (repo.gitStatus?.untrackedCount || 0) +
                (repo.gitStatus?.stagedCount || 0)}{' '}
              files
            </span>
            {repo.dependents.length > 0 && (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning">
                {repo.dependents.length} dependents
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
