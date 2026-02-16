/**
 * Repo selection component with domain/type/text filters.
 * Shows filterable checkbox list of repos with select all / deselect all.
 */

import { Check, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Repo, RepoType } from '../../../shared/types'

interface BulkRepoSelectorProps {
  repos: Repo[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
}

const REPO_TYPE_LABELS: Record<RepoType, string> = {
  kernel: 'kernel',
  'kernel-plugin': 'kernel-plugin',
  'frontend-kernel': 'frontend-kernel',
  'frontend-plugin': 'frontend-plugin',
  'frontend-ui': 'frontend-ui',
  lib: 'lib',
  app: 'app',
  tool: 'tool',
  mock: 'mock',
  integration: 'integration',
}

export function BulkRepoSelector({ repos, selectedIds, onSelectionChange }: BulkRepoSelectorProps) {
  const [search, setSearch] = useState('')
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())

  // Extract unique domains and types from repos
  const domains = useMemo(
    () => [...new Set(repos.map((r) => r.domain))].sort(),
    [repos]
  )
  const types = useMemo(
    () => [...new Set(repos.map((r) => r.type))].sort(),
    [repos]
  )

  // Filter repos
  const filteredRepos = useMemo(() => {
    let result = repos

    if (selectedDomains.size > 0) {
      result = result.filter((r) => selectedDomains.has(r.domain))
    }

    if (selectedTypes.size > 0) {
      result = result.filter((r) => selectedTypes.has(r.type))
    }

    if (search.trim()) {
      const term = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(term) ||
          r.npmPackage.toLowerCase().includes(term) ||
          r.domain.toLowerCase().includes(term)
      )
    }

    return result
  }, [repos, selectedDomains, selectedTypes, search])

  function toggleDomain(domain: string) {
    setSelectedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function toggleRepo(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  function selectAll() {
    const next = new Set(selectedIds)
    for (const r of filteredRepos) next.add(r.id)
    onSelectionChange(next)
  }

  function deselectAll() {
    const filteredIds = new Set(filteredRepos.map((r) => r.id))
    const next = new Set([...selectedIds].filter((id) => !filteredIds.has(id)))
    onSelectionChange(next)
  }

  const selectedInView = filteredRepos.filter((r) => selectedIds.has(r.id)).length

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repos..."
          className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-sm focus:border-primary focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Domain filter chips */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Domains</span>
        <div className="flex flex-wrap gap-1">
          {domains.map((domain) => (
            <button
              key={domain}
              onClick={() => toggleDomain(domain)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                selectedDomains.has(domain)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {domain}
            </button>
          ))}
        </div>
      </div>

      {/* Type filter chips */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Types</span>
        <div className="flex flex-wrap gap-1">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                selectedTypes.has(type)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {REPO_TYPE_LABELS[type as RepoType] || type}
            </button>
          ))}
        </div>
      </div>

      {/* Select / Deselect All + count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selectedInView} of {filteredRepos.length} repos selected
          {selectedIds.size !== selectedInView && ` (${selectedIds.size} total)`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-xs text-muted-foreground hover:underline"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Repo list */}
      <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border">
        {filteredRepos.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No repos match the current filters
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isSelected = selectedIds.has(repo.id)
            return (
              <button
                key={repo.id}
                onClick={() => toggleRepo(repo.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  isSelected ? 'bg-primary/5' : 'hover:bg-accent/50'
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <span className="truncate font-mono text-xs">{repo.id}</span>
                <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {repo.domain}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
