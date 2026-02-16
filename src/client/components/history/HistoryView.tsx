/**
 * History view showing past pull-all, bulk, and cascade operations.
 */

import { useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Layers,
  Square,
  Zap,
} from 'lucide-react'
import type { CascadeHistoryEntry, PullAllHistoryEntry } from '../../../shared/types'
import { trpc } from '../../trpc'

type Tab = 'pullAll' | 'bulk' | 'cascade'

export function HistoryView() {
  const [activeTab, setActiveTab] = useState<Tab>('pullAll')

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Operation History</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-4">
          <TabButton
            label="Pull All"
            icon={<Download className="h-3.5 w-3.5" />}
            active={activeTab === 'pullAll'}
            onClick={() => setActiveTab('pullAll')}
          />
          <TabButton
            label="Bulk Operations"
            icon={<Zap className="h-3.5 w-3.5" />}
            active={activeTab === 'bulk'}
            onClick={() => setActiveTab('bulk')}
          />
          <TabButton
            label="Cascade"
            icon={<Layers className="h-3.5 w-3.5" />}
            active={activeTab === 'cascade'}
            onClick={() => setActiveTab('cascade')}
          />
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {activeTab === 'pullAll' && <PullAllHistory />}
          {activeTab === 'bulk' && <BulkHistory />}
          {activeTab === 'cascade' && <CascadeHistory />}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-sm transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function PullAllHistory() {
  const historyQuery = trpc.git.pullAllHistory.useQuery()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  if (historyQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
  }

  const entries = historyQuery.data || []

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No pull-all operations recorded yet.
      </div>
    )
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <PullAllHistoryCard
          key={entry.id}
          entry={entry}
          isExpanded={expandedIds.has(entry.id)}
          onToggle={() => toggleExpand(entry.id)}
        />
      ))}
    </div>
  )
}

function PullAllHistoryCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: PullAllHistoryEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const duration =
    entry.completedAt
      ? formatDuration(new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime())
      : '-'

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        {entry.status === 'completed' && entry.failedCount === 0 ? (
          <Check className="h-4 w-4 shrink-0 text-success" />
        ) : entry.status === 'aborted' ? (
          <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
        )}

        <div className="flex-1">
          <div className="text-sm font-medium">
            Pull All &mdash; {entry.total} repos
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{new Date(entry.startedAt).toLocaleString()}</span>
            <span>{duration}</span>
            <span className="text-success">{entry.completedCount} pulled</span>
            {entry.clonedCount > 0 && (
              <span className="text-success">{entry.clonedCount} cloned</span>
            )}
            {entry.failedCount > 0 && (
              <span className="text-destructive">{entry.failedCount} failed</span>
            )}
            {entry.withChanges > 0 && <span>{entry.withChanges} with changes</span>}
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {isExpanded && entry.results && (
        <div className="border-t border-border">
          {entry.results
            .filter((r) => !r.success || r.changes > 0 || r.status === 'cloned')
            .map((r) => (
              <div
                key={r.repoId}
                className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-sm last:border-0"
              >
                {r.status === 'cloned' ? (
                  <Download className="h-3 w-3 shrink-0 text-success" />
                ) : r.success ? (
                  <Check className="h-3 w-3 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
                )}
                <span className="flex-1 truncate font-mono text-xs">{r.repoId}</span>
                <span className={`text-xs ${r.success ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {r.status === 'cloned' ? 'cloned' : r.message}
                </span>
              </div>
            ))}
          {entry.results.filter((r) => !r.success || r.changes > 0 || r.status === 'cloned').length === 0 && (
            <div className="py-2 text-center text-xs text-muted-foreground">
              All repos were up to date
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BulkHistory() {
  const listQuery = trpc.bulk.list.useQuery()

  if (listQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
  }

  const executions = listQuery.data || []

  if (executions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No bulk operations recorded yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {executions.map((exec) => (
        <div key={exec.id} className="rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-3">
            {exec.status === 'completed' && exec.failedCount === 0 ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : exec.status === 'aborted' ? (
              <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : exec.status === 'running' ? (
              <Clock className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">
                <span className="font-mono">{exec.command}</span>
                <span className="ml-2 text-muted-foreground">({exec.repoIds.length} repos)</span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{new Date(exec.startedAt).toLocaleString()}</span>
                <span className="capitalize">{exec.status}</span>
                <span className="text-success">{exec.completedCount} ok</span>
                {exec.failedCount > 0 && (
                  <span className="text-destructive">{exec.failedCount} failed</span>
                )}
                {exec.completedAt && (
                  <span>
                    {formatDuration(
                      new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CascadeHistory() {
  const historyQuery = trpc.cascade.history.useQuery()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  if (historyQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
  }

  const entries = (historyQuery.data || []) as CascadeHistoryEntry[]

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No cascade operations recorded yet.
      </div>
    )
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-border">
          <button
            onClick={() => toggleExpand(entry.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
          >
            {entry.status === 'completed' && entry.failedCount === 0 ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : entry.status === 'aborted' ? (
              <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">
                Cascade from {entry.sourceRepoId} &mdash; {entry.totalRepos} repos
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{new Date(entry.startedAt).toLocaleString()}</span>
                <span className="capitalize">{entry.status}</span>
                <span className="text-success">{entry.completedCount} ok</span>
                {entry.failedCount > 0 && (
                  <span className="text-destructive">{entry.failedCount} failed</span>
                )}
                {entry.completedAt && (
                  <span>
                    {formatDuration(
                      new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()
                    )}
                  </span>
                )}
              </div>
            </div>
            {expandedIds.has(entry.id) ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>

          {expandedIds.has(entry.id) && entry.layers && (
            <div className="border-t border-border px-4 py-2">
              {entry.layers.map((layer) => (
                <div key={layer.layerIndex} className="mb-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Layer {layer.layerIndex + 1} ({layer.mode})
                  </div>
                  {layer.steps.map((step) => (
                    <div
                      key={step.repoId}
                      className="flex items-center gap-2 py-1 pl-4 text-xs"
                    >
                      {step.status === 'done' ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : step.status === 'failed' ? (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      ) : step.status === 'skipped' ? (
                        <Square className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="font-mono">{step.repoId}</span>
                      <span className="capitalize text-muted-foreground">{step.status}</span>
                      {step.error && (
                        <span className="text-destructive">{step.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${mins}m ${remainSecs}s`
}
