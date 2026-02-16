/**
 * Pre-execution plan view - shows the cascade plan as a vertical timeline
 * of layers with editable commit messages and toggle options.
 */

import type { CascadePlan } from '../../../shared/types'
import { CascadeLayerCard } from './CascadeLayerCard'

interface CascadePlanViewProps {
  plan: CascadePlan
  waitForCi: boolean
  runTests: boolean
  commitPrefix: string
  onWaitForCiChange: (v: boolean) => void
  onRunTestsChange: (v: boolean) => void
  onCommitPrefixChange: (v: string) => void
  onCommitMessageChange: (repoId: string, message: string) => void
}

export function CascadePlanView({
  plan,
  waitForCi,
  runTests,
  commitPrefix,
  onWaitForCiChange,
  onRunTestsChange,
  onCommitPrefixChange,
  onCommitMessageChange,
}: CascadePlanViewProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span>
          <strong>{plan.totalRepos}</strong> repos in{' '}
          <strong>{plan.layers.length}</strong> layers
        </span>
        <span className="text-muted-foreground">
          Source: <span className="font-mono">{plan.sourceRepoId}</span>
        </span>
      </div>

      {/* Options bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waitForCi}
            onChange={(e) => onWaitForCiChange(e.target.checked)}
            className="rounded border-border"
          />
          Wait for CI
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={runTests}
            onChange={(e) => onRunTestsChange(e.target.checked)}
            className="rounded border-border"
          />
          Run tests
        </label>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Prefix:</label>
          <input
            value={commitPrefix}
            onChange={(e) => onCommitPrefixChange(e.target.value)}
            className="w-32 rounded border border-border bg-background px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none"
            placeholder="deps: "
          />
        </div>
      </div>

      {/* Layer timeline */}
      <div className="space-y-2">
        {plan.layers.map((layer) => (
          <CascadeLayerCard
            key={layer.layerIndex}
            layer={layer}
            isEditable={true}
            isCurrentLayer={false}
            onCommitMessageChange={onCommitMessageChange}
          />
        ))}
      </div>
    </div>
  )
}
