/**
 * View for scanning and managing file: URL dependencies in package.json files.
 * Shows which repos use file: deps and allows batch replacement.
 */

import { useState } from 'react'
import { ArrowLeftRight, Check, Loader2, Package, RefreshCw } from 'lucide-react'
import type { FileUrlDep, Repo } from '../../../shared/types'
import { trpc } from '../../trpc'

interface FileUrlViewProps {
  repos: Repo[]
}

export function FileUrlView({ repos: _repos }: FileUrlViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Scan query
  const scanQuery = trpc.package.scanFileUrls.useQuery()

  // Replace mutations
  const replaceToNpm = trpc.package.replaceFileUrls.useMutation({
    onSuccess: () => {
      scanQuery.refetch()
      setSelectedIds(new Set())
    },
  })

  const replaceToFile = trpc.package.replaceWithFileUrls.useMutation({
    onSuccess: () => {
      scanQuery.refetch()
    },
  })

  const scanResult = scanQuery.data
  const isLoading = scanQuery.isLoading

  // Group deps by repo
  const depsByRepo = new Map<string, FileUrlDep[]>()
  if (scanResult) {
    for (const dep of scanResult.repos) {
      const existing = depsByRepo.get(dep.repoId) || []
      existing.push(dep)
      depsByRepo.set(dep.repoId, existing)
    }
  }

  const affectedRepoIds = Array.from(depsByRepo.keys())

  function toggleRepo(repoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) next.delete(repoId)
      else next.add(repoId)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(affectedRepoIds))
  }

  function selectNone() {
    setSelectedIds(new Set())
  }

  function handleReplaceToNpm() {
    if (selectedIds.size === 0) return
    replaceToNpm.mutate({ repoIds: Array.from(selectedIds) })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Package Dependencies</h1>
          <span className="text-sm text-muted-foreground">
            Scan and manage file: URL dependencies
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <button
          onClick={() => scanQuery.refetch()}
          disabled={scanQuery.isFetching}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          {scanQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Rescan
        </button>

        {affectedRepoIds.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />

            <button
              onClick={selectAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Select all
            </button>
            <button
              onClick={selectNone}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Select none
            </button>

            <div className="h-4 w-px bg-border" />

            <button
              onClick={handleReplaceToNpm}
              disabled={selectedIds.size === 0 || replaceToNpm.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {replaceToNpm.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              )}
              file: &rarr; 1.0.0 ({selectedIds.size})
            </button>

            <button
              onClick={() => replaceToFile.mutate()}
              disabled={replaceToFile.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              {replaceToFile.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              )}
              npm &rarr; file: (all)
            </button>
          </>
        )}
      </div>

      {/* Results */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Scanning packages...</span>
            </div>
          )}

          {scanResult && affectedRepoIds.length === 0 && (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Check className="mb-2 h-8 w-8 text-success" />
              <span className="text-sm">No file: URL dependencies found</span>
              <span className="text-xs">
                All {scanResult.totalRepos} repos use npm package versions
              </span>
            </div>
          )}

          {/* Mutation results */}
          {replaceToNpm.data && (
            <div className="mb-4 rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="text-sm font-medium">
                Replaced file: URLs in {replaceToNpm.data.updated} repo(s)
              </div>
              {replaceToNpm.data.errors.length > 0 && (
                <div className="mt-1 text-xs text-destructive">
                  {replaceToNpm.data.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {replaceToFile.data && (
            <div className="mb-4 rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="text-sm font-medium">
                Converted to file: URLs in {replaceToFile.data.updated} repo(s)
              </div>
              {replaceToFile.data.errors.length > 0 && (
                <div className="mt-1 text-xs text-destructive">
                  {replaceToFile.data.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {scanResult && affectedRepoIds.length > 0 && (
            <div className="mb-4 text-sm text-muted-foreground">
              Found <strong>{scanResult.repos.length}</strong> file: URL dependencies in{' '}
              <strong>{scanResult.affectedRepos}</strong> of {scanResult.totalRepos} repos
            </div>
          )}

          {/* Repo list */}
          {affectedRepoIds.length > 0 && (
            <div className="space-y-0.5 rounded-lg border border-border">
              {affectedRepoIds.map((repoId) => {
                const deps = depsByRepo.get(repoId) || []
                const repoPath = deps[0]?.repoPath || repoId
                const isSelected = selectedIds.has(repoId)

                return (
                  <div key={repoId} className="border-b border-border last:border-b-0">
                    <div className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRepo(repoId)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className="font-mono text-xs font-medium">{repoPath}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {deps.length} file: dep{deps.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="border-t border-border/50 bg-muted/20 px-8 py-1">
                      {deps.map((dep) => (
                        <div key={dep.depName} className="flex items-center gap-2 py-0.5 text-xs">
                          <span className="font-mono text-muted-foreground">{dep.depName}</span>
                          <span className="text-[10px] text-yellow-600">{dep.currentValue}</span>
                          {dep.targetRepoPath && (
                            <span className="text-[10px] text-muted-foreground">
                              &rarr; {dep.targetRepoPath}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
