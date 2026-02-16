/**
 * Repo info header showing key metadata.
 */

import { ExternalLink, GitBranch, Package } from 'lucide-react'
import type { Repo } from '../../../shared/types'

interface RepoInfoProps {
  repo: Repo
}

function typeBadgeColor(type: string) {
  switch (type) {
    case 'kernel':
      return 'bg-red-500/20 text-red-400'
    case 'kernel-plugin':
      return 'bg-orange-500/20 text-orange-400'
    case 'frontend-kernel':
      return 'bg-blue-500/20 text-blue-400'
    case 'frontend-plugin':
      return 'bg-sky-500/20 text-sky-400'
    case 'frontend-ui':
      return 'bg-indigo-500/20 text-indigo-400'
    case 'lib':
      return 'bg-green-500/20 text-green-400'
    case 'app':
      return 'bg-purple-500/20 text-purple-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function RepoInfo({ repo }: RepoInfoProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{repo.id}</h2>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${typeBadgeColor(repo.type)}`}>
              {repo.type}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{repo.path}</p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-sm font-mono">
          v{repo.version}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span className="font-mono text-xs">{repo.npmPackage}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>{repo.gitStatus?.branch || 'unknown'}</span>
        </div>
        {repo.gitStatus?.hasUncommittedChanges && (
          <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
            uncommitted changes
          </span>
        )}
        {repo.gitStatus && repo.gitStatus.aheadCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            {repo.gitStatus.aheadCount} ahead
          </span>
        )}
      </div>
    </div>
  )
}
