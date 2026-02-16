/**
 * Domain mapping view - shows which repos belong to which domains,
 * highlights UNKNOWN repos, and allows reassignment.
 */

import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Loader2,
  Save,
} from 'lucide-react'
import type { Domain, Repo } from '../../../shared/types'
import { trpc } from '../../trpc'

interface DomainsViewProps {
  repos: Repo[]
  domains: Domain[]
  onRefresh: () => void
}

export function DomainsView({ repos, domains, onRefresh }: DomainsViewProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [hasChanges, setHasChanges] = useState(false)

  const projectQuery = trpc.project.get.useQuery()
  const saveMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      setHasChanges(false)
      onRefresh()
    },
  })

  // Group repos by domain
  const reposByDomain = new Map<string, Repo[]>()
  for (const repo of repos) {
    const domain = overrides[repo.id] || repo.domain
    const existing = reposByDomain.get(domain) || []
    existing.push(repo)
    reposByDomain.set(domain, existing)
  }

  // Sort: UNKNOWN first, then alphabetical
  const sortedDomains = Array.from(reposByDomain.keys()).sort((a, b) => {
    if (a === 'UNKNOWN') return -1
    if (b === 'UNKNOWN') return 1
    return a.localeCompare(b)
  })

  const unknownCount = reposByDomain.get('UNKNOWN')?.length || 0

  function toggleDomain(domainId: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }

  function handleOverride(repoId: string, newDomain: string) {
    setOverrides((prev) => ({ ...prev, [repoId]: newDomain }))
    setHasChanges(true)
  }

  function handleSave() {
    if (!projectQuery.data) return

    const existingOverrides = projectQuery.data.domainOverrides || {}
    const merged = { ...existingOverrides, ...overrides }

    // Only keep overrides that actually reassign repos
    const cleaned: Record<string, string> = {}
    for (const [repoId, domain] of Object.entries(merged)) {
      if (domain) {
        cleaned[repoId] = domain
      }
    }

    saveMutation.mutate({ domainOverrides: cleaned })
  }

  // Available domain names for dropdown
  const availableDomains = Array.from(new Set(domains.map((d) => d.id))).sort()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderTree className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Domain Mapping</h1>
            <span className="text-sm text-muted-foreground">
              {repos.length} repos in {sortedDomains.length} domains
            </span>
          </div>
          <div className="flex items-center gap-2">
            {unknownCount > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600">
                <AlertTriangle className="h-3 w-3" />
                {unknownCount} unassigned
              </span>
            )}
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Overrides
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Domain list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-2">
          {sortedDomains.map((domainId) => {
            const domainRepos = reposByDomain.get(domainId) || []
            const isExpanded = expandedDomains.has(domainId)
            const isUnknown = domainId === 'UNKNOWN'

            return (
              <div
                key={domainId}
                className={`rounded-lg border ${
                  isUnknown ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-border'
                }`}
              >
                <button
                  onClick={() => toggleDomain(domainId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {isUnknown ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
                  ) : (
                    <FolderTree className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <span className={`font-medium ${isUnknown ? 'text-yellow-600' : ''}`}>
                    {domainId}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {domainRepos.length} repo{domainRepos.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50">
                    {domainRepos.map((repo) => (
                      <div
                        key={repo.id}
                        className="flex items-center gap-3 border-b border-border/30 px-8 py-2 last:border-0"
                      >
                        <span className="flex-1 font-mono text-xs">{repo.path}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {repo.type}
                        </span>
                        {isUnknown && (
                          <select
                            value={overrides[repo.id] || ''}
                            onChange={(e) => handleOverride(repo.id, e.target.value)}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          >
                            <option value="">Assign domain...</option>
                            {availableDomains.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
