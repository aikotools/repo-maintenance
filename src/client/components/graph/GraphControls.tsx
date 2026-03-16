/**
 * Controls panel for the dependency graph.
 * Domain filter, repo multi-select for focus roots, affected mode.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Focus, Search, Sparkles, X } from 'lucide-react'

export type GraphMode = 'full' | 'focus' | 'affected'

interface GraphControlsProps {
  domains: string[]
  selectedDomain: string | null
  onDomainChange: (domain: string | null) => void
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
  focusRepoId: string | null
  focusRepoIds: Set<string>
  onToggleFocusRepo: (id: string) => void
  onClearFocus: () => void
  nodeCount: number
  edgeCount: number
  repoIds: string[]
}

export function GraphControls({
  domains,
  selectedDomain,
  onDomainChange,
  mode,
  onModeChange,
  focusRepoId,
  focusRepoIds,
  onToggleFocusRepo,
  onClearFocus,
  nodeCount,
  edgeCount,
  repoIds,
}: GraphControlsProps) {
  const [repoListOpen, setRepoListOpen] = useState(false)
  const [repoFilter, setRepoFilter] = useState('')

  const filteredRepos = repoFilter
    ? repoIds.filter((id) => id.toLowerCase().includes(repoFilter.toLowerCase()))
    : repoIds

  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
      {/* Stats */}
      <div className="rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        {nodeCount} nodes &middot; {edgeCount} edges
      </div>

      {/* Domain filter */}
      <div className="rounded-md border border-border bg-card/90 backdrop-blur-sm">
        <select
          value={selectedDomain || ''}
          onChange={(e) => onDomainChange(e.target.value || null)}
          className="w-40 rounded-md bg-transparent px-2 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}/
            </option>
          ))}
        </select>
      </div>

      {/* Mode buttons */}
      <div className="flex flex-col gap-1 rounded-md border border-border bg-card/90 p-1.5 backdrop-blur-sm">
        <button
          onClick={() => onModeChange('full')}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            mode === 'full'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          Full graph
        </button>
        <button
          onClick={() => onModeChange('affected')}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
            mode === 'affected'
              ? 'bg-warning text-black'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Sparkles className="h-3 w-3" />
          Affected
        </button>
      </div>

      {/* Focus indicator (single node click) */}
      {focusRepoId && focusRepoIds.size <= 1 && (
        <div className="flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1.5 backdrop-blur-sm">
          <Focus className="h-3 w-3 text-primary" />
          <span className="text-xs text-primary">{focusRepoId}</span>
          <button
            onClick={onClearFocus}
            className="ml-1 rounded p-0.5 text-primary hover:bg-primary/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Repo picker for multi-focus */}
      <div className="rounded-md border border-border bg-card/90 backdrop-blur-sm">
        <button
          onClick={() => setRepoListOpen(!repoListOpen)}
          className="flex w-40 items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {repoListOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">
            {focusRepoIds.size > 0
              ? `${focusRepoIds.size} root${focusRepoIds.size > 1 ? 's' : ''} selected`
              : 'Select roots...'}
          </span>
          {focusRepoIds.size > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClearFocus()
              }}
              className="ml-auto shrink-0 rounded p-0.5 hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>

        {repoListOpen && (
          <div className="border-t border-border">
            {/* Search */}
            <div className="flex items-center gap-1 border-b border-border px-2 py-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                placeholder="Filter repos..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoFocus
              />
            </div>

            {/* Selected repos (always visible at top) */}
            {focusRepoIds.size > 0 && (
              <div className="border-b border-border px-1 py-0.5">
                {[...focusRepoIds].sort().map((id) => (
                  <button
                    key={id}
                    onClick={() => onToggleFocusRepo(id)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs text-primary hover:bg-accent"
                  >
                    <div className="h-2.5 w-2.5 shrink-0 rounded-sm border border-primary bg-primary" />
                    <span className="truncate">{id}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Repo list */}
            <div className="scrollbar-thin max-h-48 overflow-y-auto px-1 py-0.5">
              {filteredRepos.map((id) => {
                const isSelected = focusRepoIds.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => onToggleFocusRepo(id)}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-accent ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <div
                      className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/40 bg-transparent'
                      }`}
                    />
                    <span className="truncate">{id}</span>
                  </button>
                )
              })}
              {filteredRepos.length === 0 && (
                <div className="px-1.5 py-2 text-center text-xs text-muted-foreground">
                  No repos found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
