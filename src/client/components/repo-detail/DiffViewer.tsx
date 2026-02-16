/**
 * Git diff viewer - renders unified diff with syntax highlighting.
 */

import { ChevronDown, ChevronRight, FileCode, X } from 'lucide-react'
import { useState } from 'react'
import type { FileDiff } from '../../../shared/types'

interface DiffViewerProps {
  files: FileDiff[]
  onClose: () => void
}

export function DiffViewer({ files, onClose }: DiffViewerProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium">Diff</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="py-4 text-center text-sm text-muted-foreground">No changes to show</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">
          Diff ({files.length} file{files.length !== 1 ? 's' : ''})
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-border">
        {files.map((file) => (
          <FileDiffSection key={file.filePath} file={file} />
        ))}
      </div>
    </div>
  )
}

function FileDiffSection({ file }: { file: FileDiff }) {
  const [expanded, setExpanded] = useState(true)

  const additions = file.hunks.reduce(
    (sum, h) => sum + h.lines.filter((l) => l.type === 'add').length,
    0
  )
  const removals = file.hunks.reduce(
    (sum, h) => sum + h.lines.filter((l) => l.type === 'remove').length,
    0
  )

  return (
    <div>
      {/* File header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs">{file.filePath}</span>
        {file.binary ? (
          <span className="text-[10px] text-muted-foreground">binary</span>
        ) : (
          <span className="flex gap-2 text-[10px]">
            {additions > 0 && <span className="text-success">+{additions}</span>}
            {removals > 0 && <span className="text-destructive">-{removals}</span>}
          </span>
        )}
      </button>

      {/* Diff content */}
      {expanded && !file.binary && (
        <div className="overflow-x-auto">
          {file.hunks.map((hunk, i) => (
            <div key={i}>
              <div className="bg-primary/10 px-4 py-0.5 font-mono text-[10px] text-primary">
                {hunk.header}
              </div>
              <div className="font-mono text-xs leading-5">
                {hunk.lines.map((line, j) => (
                  <div
                    key={j}
                    className={`flex ${
                      line.type === 'add'
                        ? 'bg-success/10'
                        : line.type === 'remove'
                          ? 'bg-destructive/10'
                          : ''
                    }`}
                  >
                    {/* Line numbers */}
                    <span className="inline-block w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/50">
                      {line.oldLineNum ?? ''}
                    </span>
                    <span className="inline-block w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/50">
                      {line.newLineNum ?? ''}
                    </span>
                    {/* Change indicator */}
                    <span
                      className={`inline-block w-4 shrink-0 select-none text-center ${
                        line.type === 'add'
                          ? 'text-success'
                          : line.type === 'remove'
                            ? 'text-destructive'
                            : 'text-muted-foreground/30'
                      }`}
                    >
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                    </span>
                    {/* Content */}
                    <span className="flex-1 whitespace-pre px-2">{line.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
