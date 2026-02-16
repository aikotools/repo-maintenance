/**
 * Custom React Flow node for a repository.
 * Color-coded by type, shows uncommitted status.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { RepoType } from '../../../shared/types'

export interface RepoNodeData {
  label: string
  domain: string
  type: RepoType
  hasUncommitted: boolean
  isFocused: boolean
  isAffected: boolean
  isDimmed: boolean
  dependentCount: number
}

const TYPE_COLORS: Record<RepoType, { bg: string; border: string; text: string }> = {
  kernel: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400' },
  'kernel-plugin': {
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/50',
    text: 'text-orange-400',
  },
  'frontend-kernel': {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    text: 'text-blue-400',
  },
  'frontend-plugin': { bg: 'bg-sky-500/20', border: 'border-sky-500/50', text: 'text-sky-400' },
  'frontend-ui': {
    bg: 'bg-indigo-500/20',
    border: 'border-indigo-500/50',
    text: 'text-indigo-400',
  },
  lib: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400' },
  app: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400' },
  tool: { bg: 'bg-zinc-500/20', border: 'border-zinc-500/50', text: 'text-zinc-400' },
  mock: { bg: 'bg-zinc-500/20', border: 'border-zinc-500/50', text: 'text-zinc-400' },
  integration: { bg: 'bg-teal-500/20', border: 'border-teal-500/50', text: 'text-teal-400' },
}

function GraphNodeComponent({ data }: NodeProps & { data: RepoNodeData }) {
  const colors = TYPE_COLORS[data.type] || TYPE_COLORS.lib

  return (
    <div
      className={`rounded-md border px-3 py-1.5 text-xs shadow-md transition-opacity ${colors.bg} ${colors.border} ${
        data.isDimmed ? 'opacity-20' : 'opacity-100'
      } ${data.isAffected ? 'ring-2 ring-warning/60' : ''} ${data.isFocused ? 'ring-2 ring-primary' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-none !bg-muted-foreground/50" />

      <div className="flex items-center gap-1.5">
        {data.hasUncommitted && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
        <span className={`font-medium ${colors.text}`}>{data.label}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-none !bg-muted-foreground/50" />
    </div>
  )
}

export const GraphNode = memo(GraphNodeComponent)
