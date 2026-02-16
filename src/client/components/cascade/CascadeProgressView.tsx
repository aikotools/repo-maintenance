/**
 * Live execution progress view - shows running cascade with progress bar,
 * layer status, and action buttons for pause/abort/skip.
 */

import {
  AlertCircle,
  Check,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Square,
  Tag,
} from 'lucide-react'
import { useState } from 'react'
import type { CascadeExecution } from '../../../shared/types'
import { trpc } from '../../trpc'
import { CascadeLayerCard } from './CascadeLayerCard'

interface CascadeProgressViewProps {
  execution: CascadeExecution
}

export function CascadeProgressView({ execution }: CascadeProgressViewProps) {
  const [versionInput, setVersionInput] = useState<Record<string, string>>({})

  const abortMutation = trpc.cascade.abort.useMutation()
  const pauseMutation = trpc.cascade.pause.useMutation()
  const resumeMutation = trpc.cascade.resume.useMutation()
  const skipMutation = trpc.cascade.skipStep.useMutation()
  const setVersionMutation = trpc.cascade.setVersion.useMutation()

  const total = execution.plan.totalRepos
  const completed = execution.completedCount
  const failed = execution.failedCount
  const skipped = execution.skippedCount
  const progress = total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0

  const isRunning = execution.status === 'running'
  const isPaused = execution.status === 'paused'
  const isDone = execution.status === 'completed' || execution.status === 'failed' || execution.status === 'aborted'

  // Find failed steps for action buttons
  const failedSteps = execution.plan.layers.flatMap((l) =>
    l.steps.filter((s) => s.status === 'failed').map((s) => ({ ...s, layerIndex: l.layerIndex }))
  )

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {isRunning && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {isPaused && <Pause className="h-5 w-5 text-yellow-400" />}
        {execution.status === 'completed' && <Check className="h-5 w-5 text-success" />}
        {execution.status === 'failed' && <AlertCircle className="h-5 w-5 text-destructive" />}
        {execution.status === 'aborted' && <Square className="h-5 w-5 text-muted-foreground" />}

        <div>
          <span className="text-sm font-medium capitalize">{execution.status}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            Layer {execution.currentLayerIndex + 1} / {execution.plan.layers.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {completed} completed, {failed} failed, {skipped} skipped
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${failed > 0 ? 'bg-yellow-500' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {isRunning && (
          <>
            <button
              onClick={() => pauseMutation.mutate({ id: execution.id })}
              disabled={pauseMutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              onClick={() => abortMutation.mutate({ id: execution.id })}
              disabled={abortMutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3.5 w-3.5" />
              Abort
            </button>
          </>
        )}
        {isPaused && (
          <>
            <button
              onClick={() => resumeMutation.mutate({ id: execution.id })}
              disabled={resumeMutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
            <button
              onClick={() => abortMutation.mutate({ id: execution.id })}
              disabled={abortMutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3.5 w-3.5" />
              Abort
            </button>
          </>
        )}
      </div>

      {/* Failed steps actions */}
      {failedSteps.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <h4 className="mb-2 text-sm font-medium text-destructive">
            Failed Steps ({failedSteps.length})
          </h4>
          <div className="space-y-2">
            {failedSteps.map((step) => (
              <div key={step.repoId} className="flex items-center gap-2">
                <span className="font-mono text-xs">{step.repoId}</span>
                <span className="text-xs text-destructive">{step.error}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() =>
                      skipMutation.mutate({ executionId: execution.id, repoId: step.repoId })
                    }
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                    title="Skip this step"
                  >
                    <SkipForward className="h-3 w-3" />
                    Skip
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      value={versionInput[step.repoId] || ''}
                      onChange={(e) =>
                        setVersionInput((prev) => ({ ...prev, [step.repoId]: e.target.value }))
                      }
                      placeholder="1.0.0"
                      className="w-20 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs"
                    />
                    <button
                      onClick={() => {
                        const version = versionInput[step.repoId]
                        if (version) {
                          setVersionMutation.mutate({
                            executionId: execution.id,
                            repoId: step.repoId,
                            version,
                          })
                        }
                      }}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                      title="Set published version manually"
                    >
                      <Tag className="h-3 w-3" />
                      Set
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer cards */}
      <div className="space-y-2">
        {execution.plan.layers.map((layer) => (
          <CascadeLayerCard
            key={layer.layerIndex}
            layer={layer}
            isEditable={false}
            isCurrentLayer={layer.layerIndex === execution.currentLayerIndex}
          />
        ))}
      </div>

      {/* Completion summary */}
      {isDone && (
        <div
          className={`rounded-lg border p-4 ${
            execution.status === 'completed'
              ? 'border-success/30 bg-success/5'
              : execution.status === 'aborted'
                ? 'border-border bg-muted/30'
                : 'border-destructive/30 bg-destructive/5'
          }`}
        >
          <h4 className="mb-1 text-sm font-medium">
            {execution.status === 'completed'
              ? 'Cascade completed successfully'
              : execution.status === 'aborted'
                ? 'Cascade was aborted'
                : 'Cascade failed'}
          </h4>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{completed} completed</span>
            <span>{failed} failed</span>
            <span>{skipped} skipped</span>
            {execution.completedAt && (
              <span>
                Duration:{' '}
                {Math.round(
                  (new Date(execution.completedAt).getTime() -
                    new Date(execution.startedAt).getTime()) /
                    1000
                )}
                s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
