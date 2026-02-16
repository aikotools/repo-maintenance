/**
 * Main sidebar with header, repo tree, and action buttons.
 */

import {
  Clock,
  Download,
  FolderTree,
  GitPullRequest,
  Layers,
  Loader2,
  Moon,
  Network,
  Package,
  RefreshCw,
  Settings,
  Sun,
  Zap,
} from 'lucide-react'
import type { Domain, Repo } from '../../../shared/types'
import { ProjectSwitcher } from './ProjectSwitcher'
import { RepoTree } from '../sidebar/RepoTree'

interface SidebarProps {
  repos: Repo[]
  domains: Domain[]
  selectedRepoId: string | null
  onSelectRepo: (id: string) => void
  onRefresh: () => void
  onRefreshGit: () => void
  onPullAll: () => void
  onShowGraph: () => void
  onShowBulk: () => void
  onShowHistory: () => void
  onShowPackages: () => void
  onShowDomains: () => void
  onShowCascade?: () => void
  onShowSettings: () => void
  onToggleTheme: () => void
  onProjectSwitch: () => void
  theme: 'light' | 'dark'
  isRefreshing: boolean
  isRefreshingGit: boolean
  activeView: string
}

export function Sidebar({
  repos,
  domains,
  selectedRepoId,
  onSelectRepo,
  onRefresh,
  onRefreshGit,
  onPullAll,
  onShowGraph,
  onShowBulk,
  onShowHistory,
  onShowPackages,
  onShowDomains,
  onShowCascade,
  onShowSettings,
  onToggleTheme,
  onProjectSwitch,
  theme,
  isRefreshing,
  isRefreshingGit,
  activeView,
}: SidebarProps) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar-bg">
      {/* Header: Title + Project Switcher */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground">RepoHub</span>
          <ProjectSwitcher onProjectSwitch={onProjectSwitch} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onShowSettings}
            title="Settings"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-2 py-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onShowGraph}
            title="Dependency graph"
            className={`rounded p-1 transition-colors ${
              activeView === 'graph'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onShowBulk}
            title="Bulk operations"
            className={`rounded p-1 transition-colors ${
              activeView === 'bulk'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
          </button>
          {onShowCascade && (
            <button
              onClick={onShowCascade}
              title="Cascade updates"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onPullAll}
            title="Pull all repos"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onRefreshGit}
            disabled={isRefreshingGit}
            title="Refresh git status"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground disabled:opacity-50"
          >
            {isRefreshingGit ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitPullRequest className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh repo structure"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground disabled:opacity-50"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* View navigation */}
      <div className="flex border-b border-sidebar-border px-2 py-1.5">
        <button
          onClick={onShowHistory}
          title="History"
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
            activeView === 'history'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
          }`}
        >
          <Clock className="h-3 w-3" />
          History
        </button>
        <button
          onClick={onShowPackages}
          title="Package URLs"
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
            activeView === 'packages'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
          }`}
        >
          <Package className="h-3 w-3" />
          Packages
        </button>
        <button
          onClick={onShowDomains}
          title="Domain mapping"
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
            activeView === 'domains'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
          }`}
        >
          <FolderTree className="h-3 w-3" />
          Domains
        </button>
      </div>

      {/* Repo Tree */}
      <RepoTree
        repos={repos}
        domains={domains}
        selectedRepoId={selectedRepoId}
        onSelectRepo={onSelectRepo}
      />
    </div>
  )
}
