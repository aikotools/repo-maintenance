/**
 * Main application layout with sidebar, content area, and status bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '../../trpc'
import { useSelectedRepo } from '../../hooks/useSelectedRepo'
import { useTheme } from '../../hooks/useTheme'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { BulkOperations } from '../bulk/BulkOperations'
import { CascadePlannerDialog } from '../cascade/CascadePlannerDialog'
import { Dashboard } from '../dashboard/Dashboard'
import { RepoDetail } from '../repo-detail/RepoDetail'
import { DependencyGraph } from '../graph/DependencyGraph'
import { PullAllDialog } from '../shared/PullAllDialog'
import { SettingsDialog } from '../settings/SettingsDialog'
import { HistoryView } from '../history/HistoryView'
import { FileUrlView } from '../packages/FileUrlView'
import { DomainsView } from '../domains/DomainsView'

type MainView = 'dashboard' | 'graph' | 'bulk' | 'history' | 'packages' | 'domains'

export function AppLayout() {
  const queryClient = useQueryClient()
  const { selectedRepoId, selectRepo } = useSelectedRepo()
  const { theme, toggleTheme } = useTheme()
  const [showPullAll, setShowPullAll] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mainView, setMainView] = useState<MainView>('dashboard')
  const [cascadeSourceRepoId, setCascadeSourceRepoId] = useState<string | null>(null)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('repohub-sidebar-width')
    return stored ? Number(stored) : 256
  })
  const isDragging = useRef(false)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const clamped = Math.min(480, Math.max(200, e.clientX))
    setSidebarWidth(clamped)
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setSidebarWidth((w) => {
      localStorage.setItem('repohub-sidebar-width', String(w))
      return w
    })
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  function handleResizeStart() {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Fetch repos
  const reposQuery = trpc.repos.list.useQuery()
  const projectQuery = trpc.project.get.useQuery()

  // Fetch dependency graph (for graph view)
  const graphQuery = trpc.dependencies.graph.useQuery(undefined, {
    enabled: reposQuery.data !== undefined && (reposQuery.data?.repos?.length ?? 0) > 0,
  })

  // Mutations
  const refreshMutation = trpc.repos.refresh.useMutation({
    onSuccess: () => {
      reposQuery.refetch()
      graphQuery.refetch()
    },
  })

  const gitStatusMutation = trpc.git.statusAll.useMutation({
    onSuccess: () => {
      reposQuery.refetch()
    },
  })

  const repos = reposQuery.data?.repos || []
  const domains = reposQuery.data?.domains || []

  // Find selected repo
  const selectedRepo = selectedRepoId ? repos.find((r) => r.id === selectedRepoId) : null

  // Auto-fetch git status for selected repo
  const gitStatusQuery = trpc.git.status.useQuery(
    { id: selectedRepoId! },
    {
      enabled: !!selectedRepoId,
      staleTime: 30_000,
    }
  )

  // Merge git status into selected repo
  const enrichedSelectedRepo = selectedRepo
    ? { ...selectedRepo, gitStatus: gitStatusQuery.data || selectedRepo.gitStatus }
    : null

  function handlePullAll() {
    setShowPullAll(true)
  }

  function handleSelectRepo(id: string | null) {
    selectRepo(id)
    if (id) setMainView('dashboard') // switch away from graph when selecting a repo
  }

  function handleShowGraph() {
    selectRepo(null)
    setMainView('graph')
  }

  function handleShowBulk() {
    selectRepo(null)
    setMainView('bulk')
  }

  function handleShowHistory() {
    selectRepo(null)
    setMainView('history')
  }

  function handleShowPackages() {
    selectRepo(null)
    setMainView('packages')
  }

  function handleShowDomains() {
    selectRepo(null)
    setMainView('domains')
  }

  function handleProjectSwitch() {
    selectRepo(null)
    setMainView('dashboard')
    queryClient.invalidateQueries()
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          repos={repos}
          domains={domains}
          selectedRepoId={selectedRepoId}
          onSelectRepo={handleSelectRepo}
          onRefresh={() => refreshMutation.mutate()}
          onRefreshGit={() => gitStatusMutation.mutate()}
          onPullAll={handlePullAll}
          onShowGraph={handleShowGraph}
          onShowBulk={handleShowBulk}
          onShowHistory={handleShowHistory}
          onShowPackages={handleShowPackages}
          onShowDomains={handleShowDomains}
          onShowSettings={() => setShowSettings(true)}
          onToggleTheme={toggleTheme}
          onProjectSwitch={handleProjectSwitch}
          theme={theme}
          isRefreshing={refreshMutation.isPending}
          isRefreshingGit={gitStatusMutation.isPending}
          activeView={mainView}
          width={sidebarWidth}
        />

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 active:bg-primary/50"
        />

        {/* Main content */}
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          {reposQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : enrichedSelectedRepo ? (
            <RepoDetail
              repo={enrichedSelectedRepo}
              allRepos={repos}
              onSelectRepo={handleSelectRepo}
              onStartCascade={(repoId) => setCascadeSourceRepoId(repoId)}
            />
          ) : mainView === 'graph' && graphQuery.data ? (
            <div className="h-full">
              <DependencyGraph
                graph={graphQuery.data}
                repos={repos}
                onSelectRepo={(id) => {
                  selectRepo(id)
                  setMainView('dashboard')
                }}
              />
            </div>
          ) : mainView === 'bulk' ? (
            <BulkOperations repos={repos} />
          ) : mainView === 'history' ? (
            <HistoryView />
          ) : mainView === 'packages' ? (
            <FileUrlView repos={repos} />
          ) : mainView === 'domains' ? (
            <DomainsView repos={repos} domains={domains} onRefresh={() => refreshMutation.mutate()} />
          ) : (
            <Dashboard repos={repos} domains={domains} onSelectRepo={handleSelectRepo} />
          )}
        </main>
      </div>

      <StatusBar
        repos={repos}
        domains={domains}
        lastRefresh={projectQuery.data?.lastRefresh}
      />

      {/* Pull All Dialog */}
      {showPullAll && (
        <PullAllDialog
          onClose={() => {
            setShowPullAll(false)
            reposQuery.refetch()
          }}
        />
      )}

      {/* Cascade Planner Dialog */}
      {cascadeSourceRepoId && (
        <CascadePlannerDialog
          sourceRepoId={cascadeSourceRepoId}
          onClose={() => setCascadeSourceRepoId(null)}
        />
      )}

      {/* Settings Dialog */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
