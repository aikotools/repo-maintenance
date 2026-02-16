/**
 * A single layer in the cascade plan - contains multiple CascadeStepRow components.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CascadeLayer } from '../../../shared/types'
import { CascadeStepRow } from './CascadeStepRow'

interface CascadeLayerCardProps {
  layer: CascadeLayer
  isEditable: boolean
  isCurrentLayer: boolean
  onCommitMessageChange?: (repoId: string, message: string) => void
}

export function CascadeLayerCard({
  layer,
  isEditable,
  isCurrentLayer,
  onCommitMessageChange,
}: CascadeLayerCardProps) {
  const [isExpanded, setIsExpanded] = useState(layer.steps.length <= 6 || isCurrentLayer)

  const doneCount = layer.steps.filter((s) => s.status === 'done').length
  const failedCount = layer.steps.filter((s) => s.status === 'failed').length
  const runningCount = layer.steps.filter(
    (s) =>
      s.status !== 'pending' &&
      s.status !== 'done' &&
      s.status !== 'failed' &&
      s.status !== 'skipped'
  ).length

  const layerStatus =
    failedCount > 0
      ? 'has-failures'
      : doneCount === layer.steps.length
        ? 'complete'
        : runningCount > 0
          ? 'running'
          : 'pending'

  return (
    <div
      className={`rounded-lg border bg-card ${
        isCurrentLayer
          ? 'border-primary/50 shadow-sm shadow-primary/10'
          : layerStatus === 'complete'
            ? 'border-success/30'
            : layerStatus === 'has-failures'
              ? 'border-destructive/30'
              : 'border-border'
      }`}
    >
      {/* Layer header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}

        <span className="text-sm font-medium">Layer {layer.layerIndex}</span>

        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            layer.mode === 'parallel'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {layer.mode === 'parallel' ? `Parallel (${layer.steps.length})` : 'Sequential'}
        </span>

        {/* Status summary */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {doneCount > 0 && <span className="text-success">{doneCount} done</span>}
          {failedCount > 0 && <span className="text-destructive">{failedCount} failed</span>}
          {runningCount > 0 && <span className="text-blue-400">{runningCount} running</span>}
          {layerStatus === 'pending' && (
            <span className="text-muted-foreground">{layer.steps.length} repos</span>
          )}
        </div>
      </button>

      {/* Steps */}
      {isExpanded && (
        <div className="border-t border-border">
          {layer.steps.map((step) => (
            <CascadeStepRow
              key={step.repoId}
              step={step}
              isEditable={isEditable}
              onCommitMessageChange={onCommitMessageChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
