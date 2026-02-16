/**
 * Filter and search input for the repo tree.
 */

import { Search } from 'lucide-react'

interface TreeFilterProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  showOnlyUncommitted: boolean
  onToggleUncommitted: () => void
  showOnlyFileUrl: boolean
  onToggleFileUrl: () => void
  showOnlyLeaves: boolean
  onToggleLeaves: () => void
}

export function TreeFilter({
  searchTerm,
  onSearchChange,
  showOnlyUncommitted,
  onToggleUncommitted,
  showOnlyFileUrl,
  onToggleFileUrl,
  showOnlyLeaves,
  onToggleLeaves,
}: TreeFilterProps) {
  return (
    <div className="space-y-2 px-2 py-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter repos..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 w-full rounded border border-input bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={showOnlyUncommitted}
            onChange={onToggleUncommitted}
            className="h-3 w-3 rounded border-input accent-primary"
          />
          Only uncommitted
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={showOnlyFileUrl}
            onChange={onToggleFileUrl}
            className="h-3 w-3 rounded border-input accent-primary"
          />
          Has file: deps
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={showOnlyLeaves}
            onChange={onToggleLeaves}
            className="h-3 w-3 rounded border-input accent-primary"
          />
          Leaf repos
        </label>
      </div>
    </div>
  )
}
