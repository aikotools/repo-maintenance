/**
 * Controls panel for the dependency graph.
 * Domain filter, focus mode, affected mode.
 */

import { Focus, Sparkles, X } from 'lucide-react'

export type GraphMode = 'full' | 'focus' | 'affected'

interface GraphControlsProps {
  domains: string[]
  selectedDomain: string | null
  onDomainChange: (domain: string | null) => void
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
  focusRepoId: string | null
  onClearFocus: () => void
  nodeCount: number
  edgeCount: number
}

export function GraphControls({
  domains,
  selectedDomain,
  onDomainChange,
  mode,
  onModeChange,
  focusRepoId,
  onClearFocus,
  nodeCount,
  edgeCount,
}: GraphControlsProps) {
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
            mode === 'full' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          Full graph
        </button>
        <button
          onClick={() => onModeChange('affected')}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
            mode === 'affected' ? 'bg-warning text-black' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Sparkles className="h-3 w-3" />
          Affected
        </button>
      </div>

      {/* Focus indicator */}
      {focusRepoId && (
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
    </div>
  )
}
