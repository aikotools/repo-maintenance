/**
 * Collapsible domain group in the sidebar tree.
 */

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Domain, Repo } from '../../../shared/types'
import { RepoNode } from './RepoNode'

interface DomainGroupProps {
  domain: Domain
  repos: Repo[]
  selectedRepoId: string | null
  onSelectRepo: (id: string) => void
}

export function DomainGroup({ domain, repos, selectedRepoId, onSelectRepo }: DomainGroupProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Auto-expand if selected repo is in this domain
  const hasSelection = repos.some((r) => r.id === selectedRepoId)
  const expanded = isOpen || hasSelection

  const uncommittedCount = repos.filter((r) => r.gitStatus?.hasUncommittedChanges).length
  const statusColor = domain.hasUncommitted ? 'text-warning' : 'text-success'

  // Group repos: those without subGroup first, then by subGroup
  const directRepos = repos.filter((r) => !r.subGroup)
  const subGroupMap = new Map<string, Repo[]>()
  for (const repo of repos) {
    if (repo.subGroup) {
      const list = subGroupMap.get(repo.subGroup) || []
      list.push(repo)
      subGroupMap.set(repo.subGroup, list)
    }
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!expanded)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-hover"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span className="flex-1 text-left">{domain.id}/</span>
        <span className={`text-[10px] ${statusColor}`}>({domain.repoCount})</span>
        {uncommittedCount > 0 && (
          <span className="rounded bg-warning/20 px-1 text-[10px] text-warning">
            {uncommittedCount}
          </span>
        )}
      </button>

      {expanded && (
        <div className="ml-2 border-l border-sidebar-border pl-1">
          {directRepos.map((repo) => (
            <RepoNode
              key={repo.id}
              repo={repo}
              isSelected={repo.id === selectedRepoId}
              onSelect={onSelectRepo}
            />
          ))}

          {Array.from(subGroupMap.entries()).map(([subGroupName, subRepos]) => (
            <SubGroupSection
              key={subGroupName}
              name={subGroupName}
              repos={subRepos}
              selectedRepoId={selectedRepoId}
              onSelectRepo={onSelectRepo}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubGroupSection({
  name,
  repos,
  selectedRepoId,
  onSelectRepo,
}: {
  name: string
  repos: Repo[]
  selectedRepoId: string | null
  onSelectRepo: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const hasSelection = repos.some((r) => r.id === selectedRepoId)
  const expanded = isOpen || hasSelection

  return (
    <div>
      <button
        onClick={() => setIsOpen(!expanded)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <span>{name}/</span>
        <span className="text-[10px]">({repos.length})</span>
      </button>

      {expanded && (
        <div className="ml-2">
          {repos.map((repo) => (
            <RepoNode
              key={repo.id}
              repo={repo}
              isSelected={repo.id === selectedRepoId}
              onSelect={onSelectRepo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
