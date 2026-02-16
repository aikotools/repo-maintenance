/**
 * List of changed files in a repo with click-to-diff and staging controls.
 */

import { Eye, FileEdit, FileMinus, FilePlus, FileQuestion, ShieldBan } from 'lucide-react'
import type { ChangedFile, FileStatus } from '../../../shared/types'

interface ChangesListProps {
  files: ChangedFile[]
  onViewDiff?: (filePath?: string) => void
  onAddToGitignore?: (filePath: string) => void
  selectedFile?: string | null
}

function statusIcon(status: FileStatus) {
  switch (status) {
    case 'M':
      return <FileEdit className="h-3.5 w-3.5 text-warning" />
    case 'A':
      return <FilePlus className="h-3.5 w-3.5 text-success" />
    case 'D':
      return <FileMinus className="h-3.5 w-3.5 text-destructive" />
    case '?':
      return <FileQuestion className="h-3.5 w-3.5 text-muted-foreground" />
    default:
      return <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function statusLabel(status: FileStatus) {
  switch (status) {
    case 'M':
      return 'Modified'
    case 'A':
      return 'Added'
    case 'D':
      return 'Deleted'
    case 'R':
      return 'Renamed'
    case 'C':
      return 'Copied'
    case '?':
      return 'Untracked'
    default:
      return status
  }
}

export function ChangesList({ files, onViewDiff, onAddToGitignore, selectedFile }: ChangesListProps) {
  if (files.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">No changed files</div>
    )
  }

  // Show "View All Diffs" button at top
  return (
    <div>
      {onViewDiff && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">{files.length} changed file(s)</span>
          <button
            onClick={() => onViewDiff(undefined)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
          >
            <Eye className="h-3 w-3" />
            View All Diffs
          </button>
        </div>
      )}
      <div className="divide-y divide-border">
        {files.map((file) => (
          <div
            key={file.path}
            className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50 ${
              selectedFile === file.path ? 'bg-accent' : ''
            }`}
            onClick={() => onViewDiff?.(file.path)}
          >
            {statusIcon(file.status)}
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
            {file.status === '?' && onAddToGitignore && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddToGitignore(file.path)
                }}
                title="Add to .gitignore"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ShieldBan className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">{statusLabel(file.status)}</span>
            {file.staged && (
              <span className="rounded bg-success/20 px-1 text-[10px] text-success">staged</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
