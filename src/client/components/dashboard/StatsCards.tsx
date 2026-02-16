/**
 * Dashboard statistics cards.
 */

import { Box, GitBranch, GitCommit, Network } from 'lucide-react'

interface StatsCardsProps {
  totalRepos: number
  totalDomains: number
  uncommittedCount: number
  totalEdges: number
}

export function StatsCards({
  totalRepos,
  totalDomains,
  uncommittedCount,
  totalEdges,
}: StatsCardsProps) {
  const cards = [
    { label: 'Repos', value: totalRepos, icon: Box, color: 'text-primary' },
    { label: 'Domains', value: totalDomains, icon: Network, color: 'text-purple-400' },
    {
      label: 'Uncommitted',
      value: uncommittedCount,
      icon: GitCommit,
      color: uncommittedCount > 0 ? 'text-warning' : 'text-success',
    },
    { label: 'Dep Edges', value: totalEdges, icon: GitBranch, color: 'text-cyan-400' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{card.label}</span>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</div>
        </div>
      ))}
    </div>
  )
}
