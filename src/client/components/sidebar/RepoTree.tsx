/**
 * Full repo tree sidebar component.
 * Groups repos by domain, supports filtering and search.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import type { Domain, Repo } from '../../../shared/types'
import { trpc } from '../../trpc'
import { DomainGroup } from './DomainGroup'
import { TreeFilter } from './TreeFilter'

interface RepoTreeProps {
  repos: Repo[]
  domains: Domain[]
  selectedRepoId: string | null
  onSelectRepo: (id: string) => void
}

export function RepoTree({ repos, domains, selectedRepoId, onSelectRepo }: RepoTreeProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showOnlyUncommitted, setShowOnlyUncommitted] = useState(false)
  const [showOnlyFileUrl, setShowOnlyFileUrl] = useState(false)
  const [showOnlyLeaves, setShowOnlyLeaves] = useState(false)
  const [changedReposOpen, setChangedReposOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const projectQuery = trpc.project.get.useQuery()
  const knownLeafRepos = useMemo(
    () => new Set(projectQuery.data?.knownLeafRepos || []),
    [projectQuery.data?.knownLeafRepos]
  )

  const utils = trpc.useUtils()
  const toggleKnownLeafMutation = trpc.project.toggleKnownLeaf.useMutation({
    onSuccess: () => utils.project.get.invalidate(),
  })

  const handleToggleKnownLeaf = (repoId: string) => {
    toggleKnownLeafMutation.mutate({ repoId })
  }

  const filteredRepos = useMemo(() => {
    let filtered = repos

    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.id.toLowerCase().includes(lower) ||
          r.npmPackage.toLowerCase().includes(lower) ||
          r.domain.toLowerCase().includes(lower)
      )
    }

    if (showOnlyUncommitted) {
      filtered = filtered.filter((r) => r.gitStatus?.hasUncommittedChanges)
    }

    if (showOnlyFileUrl) {
      filtered = filtered.filter((r) =>
        r.dependencies.some((d) => d.versionSpec.startsWith('file:'))
      )
    }

    if (showOnlyLeaves) {
      filtered = filtered.filter((r) => r.dependents.length === 0)
    }

    return filtered
  }, [repos, searchTerm, showOnlyUncommitted, showOnlyFileUrl, showOnlyLeaves])

  // Group by domain
  const reposByDomain = useMemo(() => {
    const map = new Map<string, Repo[]>()
    for (const repo of filteredRepos) {
      const list = map.get(repo.domain) || []
      list.push(repo)
      map.set(repo.domain, list)
    }
    return map
  }, [filteredRepos])

  // Repos with uncommitted changes
  const changedRepos = useMemo(
    () => repos.filter((r) => r.gitStatus?.hasUncommittedChanges).map((r) => r.id),
    [repos]
  )

  // Filter domains that have repos after filtering
  const visibleDomains = domains.filter((d) => reposByDomain.has(d.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Changed repos collapsible summary */}
      {changedRepos.length > 0 && (
        <div className="border-b border-sidebar-border">
          <div className="flex items-center">
            <button
              onClick={() => setChangedReposOpen(!changedReposOpen)}
              className="flex flex-1 items-center gap-1 px-2 py-1.5 text-xs text-warning hover:bg-sidebar-hover"
            >
              {changedReposOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <span className="font-medium">{changedRepos.length} changed repos</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(changedRepos.join('\n'))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              title="Copy repo names"
              className="mr-1 rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
          {changedReposOpen && (
            <div className="scrollbar-thin max-h-40 overflow-y-auto px-2 pb-1.5">
              {changedRepos.map((id) => (
                <button
                  key={id}
                  onClick={() => onSelectRepo(id)}
                  className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] transition-colors ${
                    id === selectedRepoId
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <TreeFilter
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showOnlyUncommitted={showOnlyUncommitted}
        onToggleUncommitted={() => setShowOnlyUncommitted(!showOnlyUncommitted)}
        showOnlyFileUrl={showOnlyFileUrl}
        onToggleFileUrl={() => setShowOnlyFileUrl(!showOnlyFileUrl)}
        showOnlyLeaves={showOnlyLeaves}
        onToggleLeaves={() => setShowOnlyLeaves(!showOnlyLeaves)}
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {visibleDomains.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {repos.length === 0
              ? 'No repos loaded. Click Refresh to scan.'
              : 'No repos match your filter.'}
          </div>
        ) : (
          visibleDomains.map((domain) => (
            <DomainGroup
              key={domain.id}
              domain={domain}
              repos={reposByDomain.get(domain.id) || []}
              selectedRepoId={selectedRepoId}
              onSelectRepo={onSelectRepo}
              knownLeafRepos={knownLeafRepos}
              onToggleKnownLeaf={handleToggleKnownLeaf}
            />
          ))
        )}
      </div>
    </div>
  )
}
