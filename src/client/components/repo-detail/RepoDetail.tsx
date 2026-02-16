/**
 * Repo detail view - shown when a repo is selected in the sidebar.
 */

import { useState } from 'react'
import { Download, GitCommit, Layers, Loader2, RefreshCw } from 'lucide-react'
import type { Repo } from '../../../shared/types'
import { trpc } from '../../trpc'
import { ChangesList } from './ChangesList'
import { CommitDialog } from './CommitDialog'
import { DependenciesList } from './DependenciesList'
import { DependentsList } from './DependentsList'
import { DiffViewer } from './DiffViewer'
import { RepoCommandRunner } from './RepoCommandRunner'
import { RepoInfo } from './RepoInfo'

type Tab = 'changes' | 'dependencies' | 'dependents'

interface RepoDetailProps {
  repo: Repo
  allRepos: Repo[]
  onSelectRepo: (id: string) => void
  onStartCascade?: (repoId: string) => void
}

export function RepoDetail({ repo, allRepos, onSelectRepo, onStartCascade }: RepoDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('changes')
  const [showDiff, setShowDiff] = useState(false)
  const [diffFile, setDiffFile] = useState<string | undefined>(undefined)
  const [showCommitDialog, setShowCommitDialog] = useState(false)

  const utils = trpc.useUtils()

  // Diff query
  const diffQuery = trpc.git.diff.useQuery(
    { id: repo.id, filePath: diffFile },
    { enabled: showDiff, staleTime: 10_000 }
  )

  // Pull mutation
  const pullMutation = trpc.git.pull.useMutation({
    onSuccess: () => {
      utils.git.status.invalidate({ id: repo.id })
    },
  })

  // Refresh git status for this repo
  const statusQuery = trpc.git.status.useQuery(
    { id: repo.id },
    { enabled: false }
  )

  async function handleRefreshStatus() {
    const result = await statusQuery.refetch()
    if (result.data) {
      utils.repos.list.invalidate()
    }
  }

  // Gitignore mutation
  const gitignoreMutation = trpc.git.addToGitignore.useMutation({
    onSuccess: () => {
      utils.git.status.invalidate({ id: repo.id })
    },
  })

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'changes', label: 'Changes', count: repo.gitStatus?.changedFiles.length || 0 },
    { id: 'dependencies', label: 'Dependencies', count: repo.dependencies.length },
    { id: 'dependents', label: 'Dependents', count: repo.dependents.length },
  ]

  function handleViewDiff(filePath?: string) {
    setDiffFile(filePath)
    setShowDiff(true)
  }

  function handleCommitSuccess() {
    utils.git.status.invalidate({ id: repo.id })
    utils.repos.list.invalidate()
  }

  return (
    <div className="space-y-4 p-6">
      <RepoInfo repo={repo} />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleRefreshStatus}
          disabled={statusQuery.isFetching}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          {statusQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        {repo.gitStatus?.hasUncommittedChanges && (
          <button
            onClick={() => setShowCommitDialog(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <GitCommit className="h-3.5 w-3.5" />
            Commit & Push
          </button>
        )}
        {repo.gitStatus && (
          <>
            <button
              onClick={() => pullMutation.mutate({ id: repo.id })}
              disabled={pullMutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50"
            >
              {pullMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Pull
            </button>
            {repo.dependents.length > 0 && onStartCascade && (
              <button
                onClick={() => onStartCascade(repo.id)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <Layers className="h-3.5 w-3.5" />
                Start Cascade
                <span className="rounded-full bg-muted px-1.5 text-[10px]">
                  {repo.dependents.length}
                </span>
              </button>
            )}
            {pullMutation.data && (
              <span
                className={`flex items-center text-xs ${pullMutation.data.success ? 'text-success' : 'text-destructive'}`}
              >
                {pullMutation.data.message}
              </span>
            )}
          </>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  activeTab === tab.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-lg border border-border bg-card">
        {activeTab === 'changes' && (
          <ChangesList
            files={repo.gitStatus?.changedFiles || []}
            onViewDiff={handleViewDiff}
            onAddToGitignore={(filePath) =>
              gitignoreMutation.mutate({ id: repo.id, filePath })
            }
            selectedFile={showDiff ? diffFile : null}
          />
        )}
        {activeTab === 'dependencies' && (
          <DependenciesList dependencies={repo.dependencies} onSelectRepo={onSelectRepo} />
        )}
        {activeTab === 'dependents' && (
          <DependentsList
            dependents={repo.dependents}
            allRepos={allRepos}
            onSelectRepo={onSelectRepo}
          />
        )}
      </div>

      {/* Diff viewer */}
      {showDiff && (
        <DiffViewer
          files={diffQuery.data?.files || []}
          onClose={() => {
            setShowDiff(false)
            setDiffFile(undefined)
          }}
        />
      )}

      {/* Command runner */}
      <RepoCommandRunner repo={repo} />

      {/* Recent commits */}
      {repo.gitStatus && repo.gitStatus.recentCommits.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Recent Commits</h3>
          </div>
          <div className="divide-y divide-border">
            {repo.gitStatus.recentCommits.map((commit) => (
              <div key={commit.hash} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-primary">{commit.hash}</span>
                <span className="min-w-0 flex-1 truncate">{commit.message}</span>
                <span className="text-xs text-muted-foreground">{commit.author}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commit dialog */}
      {showCommitDialog && (
        <CommitDialog
          repo={repo}
          onClose={() => setShowCommitDialog(false)}
          onSuccess={handleCommitSuccess}
        />
      )}
    </div>
  )
}
