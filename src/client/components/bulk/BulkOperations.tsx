/**
 * Main bulk operations full-page view.
 * Phase switching: configure → running → done.
 * Quick actions for common commands, custom command input, concurrency slider.
 */

import { useState } from 'react'
import { Play, Terminal, Zap } from 'lucide-react'
import type { Repo } from '../../../shared/types'
import { trpc } from '../../trpc'
import { BulkRepoSelector } from './BulkRepoSelector'
import { BulkProgressView } from './BulkProgressView'

type Phase = 'configure' | 'running' | 'done'

interface QuickAction {
  label: string
  command: string
  icon: string
  parseCoverage: boolean
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'pnpm install', command: 'pnpm install', icon: 'download', parseCoverage: false },
  { label: 'pnpm test', command: 'pnpm test', icon: 'test', parseCoverage: true },
  { label: 'pnpm build', command: 'pnpm build', icon: 'build', parseCoverage: false },
  { label: 'git pull', command: 'git pull', icon: 'git', parseCoverage: false },
]

interface BulkOperationsProps {
  repos: Repo[]
}

export function BulkOperations({ repos }: BulkOperationsProps) {
  const [phase, setPhase] = useState<Phase>('configure')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [customCommand, setCustomCommand] = useState('')
  const [concurrency, setConcurrency] = useState(4)
  const [executionId, setExecutionId] = useState<string | null>(null)

  // Execute mutation
  const executeMutation = trpc.bulk.execute.useMutation({
    onSuccess: (data) => {
      setExecutionId(data.id)
      setPhase('running')
    },
  })

  // Poll execution status
  const executionQuery = trpc.bulk.execution.useQuery(
    { id: executionId! },
    {
      enabled: !!executionId && phase !== 'configure',
      refetchInterval: (data) => {
        const s = data?.status
        return s === 'completed' || s === 'failed' || s === 'aborted' ? false : 2000
      },
    }
  )

  // Abort mutation
  const abortMutation = trpc.bulk.abort.useMutation()

  // Derive effective phase from execution status
  const execStatus = executionQuery.data?.status
  const effectivePhase =
    phase === 'running' &&
    (execStatus === 'completed' || execStatus === 'failed' || execStatus === 'aborted')
      ? 'done'
      : phase

  function handleExecute(command: string) {
    if (selectedIds.size === 0) return
    executeMutation.mutate({
      command,
      repoIds: [...selectedIds],
      concurrency,
    })
  }

  function handleNewOperation() {
    setPhase('configure')
    setExecutionId(null)
  }

  function handleAbort() {
    if (executionId) {
      abortMutation.mutate({ id: executionId })
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Bulk Operations</h1>
          <span className="text-sm text-muted-foreground">
            Run commands across multiple repos in parallel
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
        {effectivePhase === 'configure' && (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Quick Actions */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Quick Actions</h2>
              <div className="flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.command}
                    onClick={() => handleExecute(action.command)}
                    disabled={selectedIds.size === 0 || executeMutation.isPending}
                    className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Command */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Custom Command</h2>
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
                    placeholder="e.g., ls -la, pnpm run lint, git status"
                    className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 font-mono text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => handleExecute(customCommand.trim())}
                  disabled={
                    !customCommand.trim() ||
                    selectedIds.size === 0 ||
                    executeMutation.isPending
                  }
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run
                </button>
              </div>
            </div>

            {/* Concurrency slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Concurrency</h2>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {concurrency} parallel
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1 (sequential)</span>
                <span>12 (max parallel)</span>
              </div>
            </div>

            {/* Repo Selector */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Select Repos</h2>
              <BulkRepoSelector
                repos={repos}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </div>

            {/* Error display */}
            {executeMutation.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {executeMutation.error.message}
              </div>
            )}
          </div>
        )}

        {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.data && (
          <div className="mx-auto max-w-4xl">
            <BulkProgressView
              execution={executionQuery.data}
              onAbort={handleAbort}
              onNewOperation={handleNewOperation}
            />
          </div>
        )}

        {(effectivePhase === 'running' || effectivePhase === 'done') && executionQuery.isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading execution status...
          </div>
        )}
      </div>
    </div>
  )
}
