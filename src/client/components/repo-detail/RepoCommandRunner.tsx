/**
 * Compact command runner for a single repo.
 * Reuses the bulk execution backend (with repoIds=[repo.id])
 * and BulkProgressView for result display.
 */

import { useState } from 'react'
import { Play, Terminal } from 'lucide-react'
import type { Repo } from '../../../shared/types'
import { trpc } from '../../trpc'
import { BulkProgressView } from '../bulk/BulkProgressView'

type Phase = 'idle' | 'running' | 'done'

interface RepoCommandRunnerProps {
  repo: Repo
}

export function RepoCommandRunner({ repo }: RepoCommandRunnerProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [customCommand, setCustomCommand] = useState('')
  const [executionId, setExecutionId] = useState<string | null>(null)

  const projectQuery = trpc.project.get.useQuery()
  const quickActions = projectQuery.data?.quickActions ?? []

  const executeMutation = trpc.bulk.execute.useMutation({
    onSuccess: (data) => {
      setExecutionId(data.id)
      setPhase('running')
    },
  })

  const executionQuery = trpc.bulk.execution.useQuery(
    { id: executionId! },
    {
      enabled: !!executionId && phase !== 'idle',
      refetchInterval: (data) => {
        const s = data?.status
        return s === 'completed' || s === 'failed' || s === 'aborted' ? false : 2000
      },
    }
  )

  const abortMutation = trpc.bulk.abort.useMutation()

  const execStatus = executionQuery.data?.status
  const effectivePhase =
    phase === 'running' &&
    (execStatus === 'completed' || execStatus === 'failed' || execStatus === 'aborted')
      ? 'done'
      : phase

  function handleExecute(command: string) {
    executeMutation.mutate({
      command,
      repoIds: [repo.id],
      concurrency: 1,
    })
  }

  function handleReset() {
    setPhase('idle')
    setExecutionId(null)
  }

  function handleAbort() {
    if (executionId) {
      abortMutation.mutate({ id: executionId })
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Run Command</h3>
      </div>

      <div className="space-y-3 p-4">
        {/* Quick Actions + Custom Command (always visible) */}
        {effectivePhase === 'idle' && (
          <>
            {quickActions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickActions.map((action) => (
                  <button
                    key={action.command}
                    onClick={() => handleExecute(action.command)}
                    disabled={executeMutation.isPending}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Terminal className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customCommand.trim()) {
                      handleExecute(customCommand.trim())
                    }
                  }}
                  placeholder="Custom command..."
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </div>
              <button
                onClick={() => handleExecute(customCommand.trim())}
                disabled={!customCommand.trim() || executeMutation.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                Run
              </button>
            </div>

            {executeMutation.error && (
              <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                {executeMutation.error.message}
              </div>
            )}
          </>
        )}

        {/* Progress / Results */}
        {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.data && (
          <BulkProgressView
            execution={executionQuery.data}
            onAbort={handleAbort}
            onNewOperation={handleReset}
          />
        )}

        {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.isLoading && (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
            Loading execution status...
          </div>
        )}
      </div>
    </div>
  )
}
