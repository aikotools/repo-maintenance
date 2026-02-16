/**
 * A single repo node in the sidebar tree.
 */

import { Check, Leaf } from 'lucide-react'
import type { Repo } from '../../../shared/types'

interface RepoNodeProps {
  repo: Repo
  isSelected: boolean
  onSelect: (id: string) => void
  knownLeafRepos: Set<string>
  onToggleKnownLeaf: (repoId: string) => void
}

function statusDot(repo: Repo) {
  if (!repo.gitStatus) return 'bg-zinc-600'
  if (repo.gitStatus.hasUncommittedChanges) return 'bg-warning'
  return 'bg-success'
}

function typeLabel(type: string) {
  switch (type) {
    case 'kernel':
      return 'K'
    case 'kernel-plugin':
      return 'KP'
    case 'frontend-kernel':
      return 'FK'
    case 'frontend-plugin':
      return 'FP'
    case 'frontend-ui':
      return 'UI'
    case 'lib':
      return 'L'
    case 'app':
      return 'A'
    case 'tool':
      return 'T'
    case 'mock':
      return 'M'
    case 'integration':
      return 'I'
    default:
      return '?'
  }
}

export function RepoNode({
  repo,
  isSelected,
  onSelect,
  knownLeafRepos,
  onToggleKnownLeaf,
}: RepoNodeProps) {
  const affectedCount = repo.dependents.length
  const hasFileUrlDeps = repo.dependencies.some((d) => d.versionSpec.startsWith('file:'))
  const isLeaf = repo.dependents.length === 0
  const isKnownLeaf = knownLeafRepos.has(repo.id)

  return (
    <button
      onClick={() => onSelect(repo.id)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
        isSelected
          ? 'bg-sidebar-active text-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-hover'
      }`}
    >
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDot(repo)}`} />
      <span className="min-w-0 flex-1 truncate">{repo.id}</span>
      {repo.gitStatus?.hasUncommittedChanges && affectedCount > 0 && (
        <span className="flex-shrink-0 rounded bg-warning/20 px-1 text-[10px] text-warning">
          {affectedCount}
        </span>
      )}
      {hasFileUrlDeps && (
        <span
          className="flex-shrink-0 rounded bg-yellow-500/20 px-1 text-[10px] font-semibold text-yellow-500"
          title="Has file: URL dependencies"
        >
          F
        </span>
      )}
      {isLeaf && (
        <span
          className="flex-shrink-0 cursor-pointer"
          title={isKnownLeaf ? 'Known leaf repo (click to unmark)' : 'Leaf repo (click to mark as known)'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleKnownLeaf(repo.id)
          }}
        >
          {isKnownLeaf ? (
            <Check className="h-3 w-3 text-muted-foreground/50" />
          ) : (
            <Leaf className="h-3 w-3 text-yellow-500" />
          )}
        </span>
      )}
      <span className="flex-shrink-0 text-[10px] text-muted-foreground">
        {typeLabel(repo.type)}
      </span>
    </button>
  )
}
