/**
 * Dialog for committing and pushing changes.
 * Supports stage all, enter commit message, commit, then push.
 */

import { useState } from 'react'
import { AlertCircle, Check, GitCommit, Loader2, Upload, X } from 'lucide-react'
import type { Repo } from '../../../shared/types'
import { trpc } from '../../trpc'

interface CommitDialogProps {
  repo: Repo
  onClose: () => void
  onSuccess: () => void
}

type Step = 'compose' | 'committing' | 'pushing' | 'done' | 'error'

export function CommitDialog({ repo, onClose, onSuccess }: CommitDialogProps) {
  const [message, setMessage] = useState('')
  const [step, setStep] = useState<Step>('compose')
  const [stageAll, setStageAll] = useState(true)
  const [autoPush, setAutoPush] = useState(true)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const stageAllMutation = trpc.git.stageAll.useMutation()
  const commitMutation = trpc.git.commit.useMutation()
  const pushMutation = trpc.git.push.useMutation()

  const isWorking = step === 'committing' || step === 'pushing'

  async function handleCommit() {
    if (!message.trim()) return

    try {
      // Stage all if checked
      if (stageAll) {
        setStep('committing')
        const stageResult = await stageAllMutation.mutateAsync({ id: repo.id })
        if (!stageResult.success) {
          setError(stageResult.message)
          setStep('error')
          return
        }
      }

      // Commit
      setStep('committing')
      const commitResult = await commitMutation.mutateAsync({ id: repo.id, message: message.trim() })
      if (!commitResult.success) {
        setError(commitResult.message)
        setStep('error')
        return
      }

      setResult(commitResult.message)

      // Push if auto-push enabled
      if (autoPush) {
        setStep('pushing')
        const pushResult = await pushMutation.mutateAsync({ id: repo.id })
        if (!pushResult.success) {
          setError(pushResult.message)
          setStep('error')
          return
        }
        setResult(`${commitResult.message} + ${pushResult.message}`)
      }

      setStep('done')
      onSuccess()
    } catch (err) {
      setError((err as Error).message)
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Commit & Push</h3>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{repo.id}</span>
          </div>
          <button
            onClick={onClose}
            disabled={isWorking}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {step === 'compose' && (
            <>
              {/* File count info */}
              <div className="text-sm text-muted-foreground">
                {repo.gitStatus?.changedFiles.length || 0} changed file(s) on branch{' '}
                <span className="font-mono text-foreground">{repo.gitStatus?.branch}</span>
              </div>

              {/* Stage all checkbox */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={stageAll}
                  onChange={(e) => setStageAll(e.target.checked)}
                  className="rounded border-border"
                />
                Stage all changes before commit
              </label>

              {/* Commit message */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Commit message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="feat: describe your changes..."
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleCommit()
                    }
                  }}
                />
              </div>

              {/* Auto-push checkbox */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoPush}
                  onChange={(e) => setAutoPush(e.target.checked)}
                  className="rounded border-border"
                />
                Push after commit
              </label>
            </>
          )}

          {step === 'committing' && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">
                {stageAll && stageAllMutation.isPending ? 'Staging all files...' : 'Committing...'}
              </span>
            </div>
          )}

          {step === 'pushing' && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Pushing to remote...</span>
            </div>
          )}

          {step === 'done' && (
            <div className="flex items-center gap-3 rounded-md bg-success/10 p-3">
              <Check className="h-5 w-5 text-success" />
              <span className="text-sm text-success">{result}</span>
            </div>
          )}

          {step === 'error' && (
            <div className="flex items-center gap-3 rounded-md bg-destructive/10 p-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {step === 'compose' && (
            <>
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!message.trim()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {autoPush ? 'Commit & Push' : 'Commit'}
              </button>
            </>
          )}
          {(step === 'done' || step === 'error') && (
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
