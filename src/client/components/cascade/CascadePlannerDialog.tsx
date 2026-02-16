/**
 * Main cascade dialog - switches between plan, running, and done phases.
 * Handles plan loading, execution start, and live polling.
 */

import { useState } from 'react'
import { Layers, Loader2, X } from 'lucide-react'
import type { CascadePlan } from '../../../shared/types'
import { trpc } from '../../trpc'
import { CascadePlanView } from './CascadePlanView'
import { CascadeProgressView } from './CascadeProgressView'

type Phase = 'plan' | 'running' | 'done'

interface CascadePlannerDialogProps {
  sourceRepoId: string
  onClose: () => void
}

export function CascadePlannerDialog({ sourceRepoId, onClose }: CascadePlannerDialogProps) {
  const [phase, setPhase] = useState<Phase>('plan')
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [waitForCi, setWaitForCi] = useState(false)
  const [runTests, setRunTests] = useState(false)
  const [commitPrefix, setCommitPrefix] = useState('deps: ')
  const [commitOverrides, setCommitOverrides] = useState<Record<string, string>>({})

  // Fetch the plan (structure only - options are applied at start time)
  const planQuery = trpc.cascade.plan.useQuery(
    { sourceRepoId },
    { enabled: phase === 'plan' }
  )

  // Start mutation
  const startMutation = trpc.cascade.start.useMutation({
    onSuccess: (data) => {
      setExecutionId(data.id)
      setPhase('running')
    },
  })

  // Poll execution status
  const executionQuery = trpc.cascade.execution.useQuery(
    { id: executionId! },
    {
      enabled: !!executionId && phase !== 'plan',
      refetchInterval: (data) => {
        const s = data?.status
        return s === 'completed' || s === 'failed' || s === 'aborted' ? false : 2000
      },
    }
  )

  // Derive effective phase from execution status
  const execStatus = executionQuery.data?.status
  const effectivePhase =
    phase === 'running' &&
    (execStatus === 'completed' ||
      execStatus === 'failed' ||
      execStatus === 'aborted' ||
      execStatus === 'paused')
      ? 'done'
      : phase

  // Apply commit prefix and overrides to the plan for display
  const defaultPrefix = planQuery.data?.commitPrefix ?? 'deps: '
  const displayPlan: CascadePlan | undefined = planQuery.data
    ? {
        ...planQuery.data,
        layers: planQuery.data.layers.map((layer) => ({
          ...layer,
          steps: layer.steps.map((step) => {
            if (commitOverrides[step.repoId]) return { ...step, commitMessage: commitOverrides[step.repoId] }
            // Replace default prefix with current prefix
            const base = step.commitMessage.startsWith(defaultPrefix)
              ? step.commitMessage.slice(defaultPrefix.length)
              : step.commitMessage
            return { ...step, commitMessage: `${commitPrefix}${base}` }
          }),
        })),
      }
    : undefined

  function handleCommitMessageChange(repoId: string, message: string) {
    setCommitOverrides((prev) => ({ ...prev, [repoId]: message }))
  }

  function handleStart() {
    startMutation.mutate({
      sourceRepoId,
      waitForCi,
      runTests,
      commitPrefix,
      commitOverrides: Object.keys(commitOverrides).length > 0 ? commitOverrides : undefined,
    })
  }

  const isWorking = startMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Cascade Update</h3>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {sourceRepoId}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          {effectivePhase === 'plan' && (
            <>
              {planQuery.isLoading && (
                <div className="flex items-center gap-3 py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm">Building cascade plan...</span>
                </div>
              )}
              {planQuery.error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {planQuery.error.message}
                </div>
              )}
              {displayPlan && (
                <CascadePlanView
                  plan={displayPlan}
                  waitForCi={waitForCi}
                  runTests={runTests}
                  commitPrefix={commitPrefix}
                  onWaitForCiChange={setWaitForCi}
                  onRunTestsChange={setRunTests}
                  onCommitPrefixChange={setCommitPrefix}
                  onCommitMessageChange={handleCommitMessageChange}
                />
              )}
            </>
          )}

          {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.data && (
            <CascadeProgressView execution={executionQuery.data} />
          )}

          {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.isLoading && (
            <div className="flex items-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading execution status...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {effectivePhase === 'plan' && (
            <>
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={!displayPlan || isWorking || displayPlan.totalRepos === 0}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isWorking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Layers className="h-3.5 w-3.5" />
                )}
                Start Cascade
              </button>
            </>
          )}
          {effectivePhase === 'done' && (
            <button
              onClick={onClose}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
