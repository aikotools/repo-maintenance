/**
 * Live progress view for bulk execution - shows per-repo status,
 * progress bar, coverage badges, and expandable stdout/stderr.
 */

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Square,
} from 'lucide-react'
import { useState } from 'react'
import type { BulkExecution, BulkOperationResult } from '../../../shared/types'

interface BulkProgressViewProps {
  execution: BulkExecution
  onAbort?: () => void
  onNewOperation?: () => void
}

export function BulkProgressView({ execution, onAbort, onNewOperation }: BulkProgressViewProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())

  const total = execution.repoIds.length
  const done = execution.completedCount + execution.failedCount
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const isRunning = execution.status === 'running'
  const isDone =
    execution.status === 'completed' ||
    execution.status === 'failed' ||
    execution.status === 'aborted'

  // Calculate average coverage from results that have coverage
  const withCoverage = execution.results.filter((r) => r.coverage !== undefined && r.coverage !== null)
  const avgCoverage =
    withCoverage.length > 0
      ? Math.round((withCoverage.reduce((sum, r) => sum + (r.coverage ?? 0), 0) / withCoverage.length) * 10) / 10
      : null

  function toggleExpand(repoId: string) {
    setExpandedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) next.delete(repoId)
      else next.add(repoId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {execution.status === 'completed' && <Check className="h-5 w-5 text-success" />}
          {execution.status === 'failed' && <AlertCircle className="h-5 w-5 text-destructive" />}
          {execution.status === 'aborted' && (
            <Square className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <span className="text-sm font-medium capitalize">{execution.status}</span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {execution.command}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {isRunning && onAbort && (
            <button
              onClick={onAbort}
              className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3 w-3" />
              Abort
            </button>
          )}
          {isDone && onNewOperation && (
            <button
              onClick={onNewOperation}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
            >
              New Operation
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {execution.completedCount} passed, {execution.failedCount} failed
            {avgCoverage !== null && `, avg coverage: ${avgCoverage}%`}
          </span>
          <span>
            {done}/{total} ({progress}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${
              execution.failedCount > 0 ? 'bg-yellow-500' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Per-repo results */}
      <div className="space-y-0.5 rounded-lg border border-border">
        {execution.results.map((result) => (
          <RepoResultRow
            key={result.repoId}
            result={result}
            isExpanded={expandedRepos.has(result.repoId)}
            onToggle={() => toggleExpand(result.repoId)}
          />
        ))}
      </div>

      {/* Completion summary */}
      {isDone && (
        <div
          className={`rounded-lg border p-4 ${
            execution.status === 'completed' && execution.failedCount === 0
              ? 'border-success/30 bg-success/5'
              : execution.status === 'aborted'
                ? 'border-border bg-muted/30'
                : 'border-yellow-500/30 bg-yellow-500/5'
          }`}
        >
          <h4 className="mb-1 text-sm font-medium">
            {execution.status === 'completed' && execution.failedCount === 0
              ? 'All operations completed successfully'
              : execution.status === 'aborted'
                ? 'Operation was aborted'
                : `Completed with ${execution.failedCount} failure${execution.failedCount !== 1 ? 's' : ''}`}
          </h4>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{execution.completedCount} passed</span>
            <span>{execution.failedCount} failed</span>
            {avgCoverage !== null && <span>Avg coverage: {avgCoverage}%</span>}
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
    </div>
  )
}

function RepoResultRow({
  result,
  isExpanded,
  onToggle,
}: {
  result: BulkOperationResult
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasOutput = result.stdout || result.stderr

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        disabled={!hasOutput}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
          hasOutput ? 'hover:bg-accent/50' : ''
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
          {result.status === 'failed' && (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          {result.status === 'aborted' && (
            <Square className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Expand chevron */}
        <div className="shrink-0">
          {hasOutput ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : (
            <div className="w-3" />
          )}
        </div>

        {/* Repo name */}
        <span className="truncate font-mono text-xs">{result.repoId}</span>

        {/* Duration */}
        {result.duration > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatDuration(result.duration)}
          </span>
        )}

        {/* Coverage badge */}
        {result.coverage !== undefined && result.coverage !== null && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              result.coverage >= 80
                ? 'bg-success/10 text-success'
                : result.coverage >= 50
                  ? 'bg-yellow-500/10 text-yellow-600'
                  : 'bg-destructive/10 text-destructive'
            }`}
          >
            {result.coverage.toFixed(1)}%
          </span>
        )}

        {/* Exit code for failed */}
        {result.status === 'failed' && result.exitCode >= 0 && (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
            exit {result.exitCode}
          </span>
        )}
      </button>

      {/* Expandable output */}
      {isExpanded && hasOutput && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          {result.stdout && (
            <div className="mb-2">
              <span className="text-[10px] font-medium text-muted-foreground">stdout</span>
              <pre className="scrollbar-thin mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] text-foreground">
                {result.stdout}
              </pre>
            </div>
          )}
          {result.stderr && (
            <div>
              <span className="text-[10px] font-medium text-destructive">stderr</span>
              <pre className="scrollbar-thin mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] text-destructive/80">
                {result.stderr}
              </pre>
            </div>
          )}
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
