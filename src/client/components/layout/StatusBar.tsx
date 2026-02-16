/**
 * Bottom status bar showing repo statistics.
 */

import type { Domain, Repo } from '../../../shared/types'

interface StatusBarProps {
  repos: Repo[]
  domains: Domain[]
  lastRefresh?: string
}

export function StatusBar({ repos, domains, lastRefresh }: StatusBarProps) {
  const uncommittedCount = repos.filter((r) => r.gitStatus?.hasUncommittedChanges).length
  const totalEdges = repos.reduce((sum, r) => sum + r.dependencies.length, 0)

  const formatTime = (iso?: string) => {
    if (!iso) return 'never'
    const date = new Date(iso)
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex h-6 items-center gap-4 border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <span>{repos.length} repos</span>
      <span className="text-border">|</span>
      <span>{domains.length} domains</span>
      <span className="text-border">|</span>
      <span className={uncommittedCount > 0 ? 'text-warning' : ''}>
        {uncommittedCount} uncommitted
      </span>
      <span className="text-border">|</span>
      <span>{totalEdges} dependency edges</span>
      <span className="ml-auto">Last refresh: {formatTime(lastRefresh)}</span>
    </div>
  )
}
