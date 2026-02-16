/**
 * Individual cascade step row - shows repo name, status, deps being updated,
 * and commit message (editable in plan mode).
 */

import {
  AlertCircle,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  SkipForward,
  Clock,
} from 'lucide-react'
import type { CascadeStep, CascadeStepStatus } from '../../../shared/types'

interface CascadeStepRowProps {
  step: CascadeStep
  isEditable: boolean
  onCommitMessageChange?: (repoId: string, message: string) => void
}

const STATUS_CONFIG: Record<
  CascadeStepStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  pending: {
    icon: <Circle className="h-3.5 w-3.5" />,
    color: 'text-muted-foreground',
    label: 'Pending',
  },
  'updating-deps': {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-400',
    label: 'Updating deps',
  },
  installing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-400',
    label: 'Installing',
  },
  testing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-400',
    label: 'Testing',
  },
  committing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-400',
    label: 'Committing',
  },
  pushing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-400',
    label: 'Pushing',
  },
  'waiting-ci': {
    icon: <Clock className="h-3.5 w-3.5 animate-pulse" />,
    color: 'text-yellow-400',
    label: 'Waiting CI',
  },
  done: {
    icon: <Check className="h-3.5 w-3.5" />,
    color: 'text-success',
    label: 'Done',
  },
  failed: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: 'text-destructive',
    label: 'Failed',
  },
  skipped: {
    icon: <SkipForward className="h-3.5 w-3.5" />,
    color: 'text-muted-foreground',
    label: 'Skipped',
  },
}

function formatDuration(start?: string, end?: string): string | null {
  if (!start) return null
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.round((endTime - startTime) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function CascadeStepRow({ step, isEditable, onCommitMessageChange }: CascadeStepRowProps) {
  const config = STATUS_CONFIG[step.status]

  return (
    <div className="space-y-1.5 border-b border-border px-4 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        {/* Status icon */}
        <span className={config.color}>{config.icon}</span>

        {/* Repo name */}
        <span className="font-mono text-sm font-medium">{step.repoId}</span>

        {/* Status label */}
        <span className={`text-xs ${config.color}`}>{config.label}</span>

        {/* Duration */}
        {step.startedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDuration(step.startedAt, step.completedAt)}
          </span>
        )}

        {/* CI badge */}
        {step.ciStatus && step.ciStatus !== 'skipped' && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              step.ciStatus === 'success'
                ? 'bg-success/20 text-success'
                : step.ciStatus === 'failure'
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-yellow-500/20 text-yellow-500'
            }`}
          >
            CI: {step.ciStatus}
          </span>
        )}
      </div>

      {/* Deps being updated */}
      {step.depsToUpdate.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-6">
          {step.depsToUpdate.map((dep) => (
            <span
              key={dep.npmName}
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]"
            >
              <span className="font-mono">{dep.npmName.split('/').pop()}</span>
              <span className="text-muted-foreground">{dep.fromVersion}</span>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-primary">{dep.toVersion}</span>
            </span>
          ))}
        </div>
      )}

      {/* Commit message */}
      <div className="pl-6">
        {isEditable ? (
          <textarea
            value={step.commitMessage}
            onChange={(e) => onCommitMessageChange?.(step.repoId, e.target.value)}
            rows={1}
            className="w-full resize-none rounded border border-border bg-background px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="font-mono text-xs text-muted-foreground">{step.commitMessage}</span>
        )}
      </div>

      {/* Error message */}
      {step.error && (
        <div className="ml-6 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {step.error}
        </div>
      )}
    </div>
  )
}
