/**
 * Dialog showing live progress and results of pulling all repos.
 * Uses background execution with polling for real-time feedback.
 * Supports clone-missing + pull-existing flow with GitHub integration.
 */

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  EyeOff,
  Loader2,
  Square,
  X,
} from 'lucide-react'
import type { PullResult } from '../../../shared/types'
import { trpc } from '../../trpc'

interface PullAllDialogProps {
  onClose: () => void
}

export function PullAllDialog({ onClose }: PullAllDialogProps) {
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())

  // Start pull-all on mount
  const pullAllMutation = trpc.git.pullAll.useMutation({
    onSuccess: (data) => {
      setExecutionId(data.id)
    },
  })

  // Poll execution status
  const statusQuery = trpc.git.pullAllStatus.useQuery(
    { id: executionId! },
    {
      enabled: !!executionId,
      refetchInterval: (query) => {
        const data = query.state.data
        if (data && (data.status === 'completed' || data.status === 'aborted')) return false
        return 2000
      },
    }
  )

  // Abort mutation
  const abortMutation = trpc.git.pullAllAbort.useMutation()

  // Start execution on mount
  useEffect(() => {
    pullAllMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const execution = statusQuery.data
  const isRunning = !execution || execution.status === 'running'
  const isDone = execution && (execution.status === 'completed' || execution.status === 'aborted')

  const total = execution?.total ?? 0
  const skippedAndUnmapped = (execution?.skippedCount ?? 0) + (execution?.unmappedCount ?? 0)
  const actionableTotal = total - skippedAndUnmapped
  const done =
    (execution?.completedCount ?? 0) +
    (execution?.failedCount ?? 0) +
    (execution?.clonedCount ?? 0)
  const progress = actionableTotal > 0 ? Math.round((done / actionableTotal) * 100) : 0

  function handleAbort() {
    if (executionId) {
      abortMutation.mutate({ id: executionId })
    }
  }

  function toggleExpand(repoId: string) {
    setExpandedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) next.delete(repoId)
      else next.add(repoId)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Pull All Repos</h3>
            {execution && (
              <span className="text-xs text-muted-foreground">
                {done}/{actionableTotal}
                {skippedAndUnmapped > 0 && ` (+${skippedAndUnmapped} skipped)`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isRunning && executionId && (
              <button
                onClick={handleAbort}
                className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              >
                <Square className="h-3 w-3" />
                Abort
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isRunning && !isDone}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {execution && (
          <div className="border-b border-border px-4 py-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {execution.completedCount} pulled
                {execution.clonedCount > 0 && `, ${execution.clonedCount} cloned`}
                {execution.failedCount > 0 && `, ${execution.failedCount} failed`}
                {execution.withChanges > 0 && `, ${execution.withChanges} with changes`}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  execution.failedCount > 0 ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Loading state before execution starts */}
        {!execution && (
          <div className="flex items-center gap-3 px-4 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Starting pull operation...</span>
          </div>
        )}

        {/* Per-repo results */}
        {execution && (
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {execution.results.map((result) => (
              <PullResultRow
                key={result.repoId}
                result={result}
                isExpanded={expandedRepos.has(result.repoId)}
                onToggle={() => toggleExpand(result.repoId)}
              />
            ))}
          </div>
        )}

        {/* Completion summary */}
        {isDone && execution && (
          <div
            className={`mx-4 my-3 rounded-lg border p-3 ${
              execution.status === 'completed' && execution.failedCount === 0
                ? 'border-success/30 bg-success/5'
                : execution.status === 'aborted'
                  ? 'border-border bg-muted/30'
                  : 'border-yellow-500/30 bg-yellow-500/5'
            }`}
          >
            <h4 className="text-sm font-medium">
              {execution.status === 'completed' && execution.failedCount === 0
                ? 'All repos synced successfully'
                : execution.status === 'aborted'
                  ? 'Pull operation was aborted'
                  : `Completed with ${execution.failedCount} failure${execution.failedCount !== 1 ? 's' : ''}`}
            </h4>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>{execution.completedCount} pulled</span>
              {execution.clonedCount > 0 && <span>{execution.clonedCount} cloned</span>}
              <span>{execution.failedCount} failed</span>
              <span>{execution.withChanges} with changes</span>
              {execution.skippedCount > 0 && <span>{execution.skippedCount} skipped</span>}
              {execution.unmappedCount > 0 && <span>{execution.unmappedCount} unmapped</span>}
              {execution.completedAt && (
                <span>
                  Duration:{' '}
                  {formatDuration(
                    new Date(execution.completedAt).getTime() -
                      new Date(execution.startedAt).getTime()
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            disabled={isRunning && !isDone}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isDone ? 'Close' : 'Working...'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PullResultRow({
  result,
  isExpanded,
  onToggle,
}: {
  result: PullResult
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasError = !result.success && result.message && result.status === 'failed'
  const isClickable = !!hasError

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        disabled={!isClickable}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          isClickable ? 'hover:bg-accent/50' : ''
        }`}
      >
        {/* Status icon */}
        <div className="shrink-0">
          {result.status === 'pending' && (
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {result.status === 'running' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {result.status === 'completed' && <Check className="h-3.5 w-3.5 text-success" />}
          {result.status === 'cloned' && (
            <Download className="h-3.5 w-3.5 text-success" />
          )}
          {result.status === 'failed' && (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          {result.status === 'aborted' && (
            <Square className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {result.status === 'skipped' && (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
          {result.status === 'unmapped' && (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
          )}
          {!result.status && (
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Expand chevron */}
        <div className="shrink-0">
          {isClickable ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : (
            <div className="w-3" />
          )}
        </div>

        {/* Repo path */}
        <span className={`min-w-0 flex-1 truncate font-mono text-xs ${
          result.status === 'skipped' || result.status === 'unmapped'
            ? 'text-muted-foreground/60'
            : ''
        }`}>
          {result.repoId}
        </span>

        {/* Status badges */}
        {result.status === 'cloned' && (
          <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
            cloned
          </span>
        )}

        {result.success && result.changes > 0 && result.status === 'completed' && (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {result.changes} changes
          </span>
        )}

        {result.success && result.changes === 0 && result.status === 'completed' && (
          <span className="shrink-0 text-[10px] text-muted-foreground">up to date</span>
        )}

        {result.status === 'skipped' && (
          <span className="shrink-0 text-[10px] text-muted-foreground/50">ignored</span>
        )}

        {result.status === 'unmapped' && (
          <span className="shrink-0 rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
            unmapped
          </span>
        )}

        {result.status === 'failed' && (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
            failed
          </span>
        )}
      </button>

      {/* Expandable error details */}
      {isExpanded && hasError && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <pre className="scrollbar-thin max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] text-destructive/80">
            {result.message}
          </pre>
        </div>
      )}
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
