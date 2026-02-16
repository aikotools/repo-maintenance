/**
 * Dashboard view - default main content when no repo is selected.
 */

import type { Domain, Repo } from '../../../shared/types'
import { StatsCards } from './StatsCards'
import { UncommittedList } from './UncommittedList'

interface DashboardProps {
  repos: Repo[]
  domains: Domain[]
  onSelectRepo: (id: string) => void
}

export function Dashboard({ repos, domains, onSelectRepo }: DashboardProps) {
  const uncommittedCount = repos.filter((r) => r.gitStatus?.hasUncommittedChanges).length
  const totalEdges = repos.reduce((sum, r) => sum + r.dependencies.length, 0)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of all repositories in the monorepo
        </p>
      </div>

      <StatsCards
        totalRepos={repos.length}
        totalDomains={domains.length}
        uncommittedCount={uncommittedCount}
        totalEdges={totalEdges}
      />

      <UncommittedList repos={repos} onSelectRepo={onSelectRepo} />

      {/* Domain overview */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium">Domains</h3>
        </div>
        <div className="grid grid-cols-4 gap-px bg-border">
          {domains.map((domain) => (
            <div key={domain.id} className="bg-card p-3">
              <div className="text-sm font-medium">{domain.id}/</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {domain.repoCount} repos
                {domain.subGroups.length > 0 && (
                  <span> ({domain.subGroups.length} sub-groups)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
