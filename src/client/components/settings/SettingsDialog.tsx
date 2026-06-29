/**
 * Settings dialog for editing ProjectConfig.
 */

import { useState } from 'react'
import { Check, FileDown, FolderOpen, Loader2, Map, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react'
import type { ProjectConfig, QuickAction } from '../../../shared/types'
import { trpc } from '../../trpc'
import { RepoMappingDialog } from './RepoMappingDialog'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const projectQuery = trpc.project.get.useQuery()

  const isLoading = projectQuery.isLoading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Project Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading settings...</span>
            </div>
          ) : projectQuery.data ? (
            <SettingsForm
              initialData={projectQuery.data}
              onClose={onClose}
              onRefetch={() => projectQuery.refetch()}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SettingsForm({
  initialData,
  onClose,
  onRefetch,
}: {
  initialData: ProjectConfig
  onClose: () => void
  onRefetch: () => void
}) {
  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      onRefetch()
      onClose()
    },
  })
  const browseMutation = trpc.project.browseFolder.useMutation({
    onSuccess: (data) => {
      if (data.path) setRootFolder(data.path)
    },
  })
  const importMappingMutation = trpc.project.importMapping.useMutation({
    onSuccess: () => {
      onRefetch()
    },
  })
  const browseFileMutation = trpc.project.browseFile.useMutation({
    onSuccess: (data) => {
      if (data.path) setWorkspaceFile(data.path)
    },
  })
  const regenerateMutation = trpc.project.regenerateWorkspace.useMutation()
  const projectQuery = trpc.project.get.useQuery()

  // GitHub token (stored in the OS keychain, not project.json)
  const tokenStatusQuery = trpc.git.gitTokenStatus.useQuery()
  const saveGitTokenMutation = trpc.git.saveGitToken.useMutation({
    onSuccess: () => {
      setGithubToken('')
      tokenStatusQuery.refetch()
    },
  })
  const deleteGitTokenMutation = trpc.git.deleteGitToken.useMutation({
    onSuccess: () => tokenStatusQuery.refetch(),
  })
  const [githubToken, setGithubToken] = useState('')

  const [showMappingDialog, setShowMappingDialog] = useState(false)

  const [name, setName] = useState(initialData.name)
  const [workspaceFile, setWorkspaceFile] = useState(initialData.workspaceFile || '')
  const [rootFolder, setRootFolder] = useState(initialData.rootFolder)
  const [parallelTasks, setParallelTasks] = useState(initialData.parallelTasks)
  const [defaultBranch, setDefaultBranch] = useState(initialData.defaultBranch)
  const [npmOrganizations, setNpmOrganizations] = useState(initialData.npmOrganizations.join(', '))
  const [npmRegistry, setNpmRegistry] = useState(
    initialData.npmRegistry || 'https://npm.pkg.github.com'
  )
  const [gitProtocol, setGitProtocol] = useState<'ssh' | 'https'>(
    initialData.gitProtocol || 'ssh'
  )
  const [sourceUrl, setSourceUrl] = useState(initialData.sourceUrl || '')
  const [gitlabToken, setGitlabToken] = useState(initialData.gitlabToken || '')
  const sourceHost = sourceUrl
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  // Anything with a dotted host that isn't github.com is treated as GitLab
  const isGitlab = !!sourceHost && sourceHost !== 'github.com' && sourceHost.includes('.')
  const [quickActions, setQuickActions] = useState<QuickAction[]>(
    initialData.quickActions ?? [
      { label: 'pnpm install', command: 'pnpm install' },
      { label: 'pnpm test', command: 'pnpm test' },
      { label: 'pnpm build', command: 'pnpm build' },
      { label: 'git pull', command: 'git pull' },
    ]
  )

  const hasWorkspace = !!workspaceFile.trim()

  function handleSave() {
    updateMutation.mutate({
      name,
      workspaceFile: workspaceFile.trim() || undefined,
      rootFolder,
      parallelTasks,
      defaultBranch,
      npmOrganizations: npmOrganizations
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      npmRegistry: npmRegistry.trim() || 'https://npm.pkg.github.com',
      gitProtocol,
      sourceUrl: sourceUrl.trim() || undefined,
      gitlabToken: gitlabToken.trim() || undefined,
      quickActions: quickActions.filter((a) => a.label.trim() && a.command.trim()),
    })
  }

  function handleBrowse() {
    browseMutation.mutate({ currentPath: rootFolder || undefined })
  }

  const isSaving = updateMutation.isPending

  return (
    <>
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Project Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* workspace.repos manifest */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          workspace.repos (vcstool manifest)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={workspaceFile}
            onChange={(e) => setWorkspaceFile(e.target.value)}
            placeholder="/path/to/workspace.repos — single source of truth for layout, url & branch"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => browseFileMutation.mutate({ currentPath: workspaceFile || undefined })}
            disabled={browseFileMutation.isPending}
            title="Browse for workspace.repos"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {browseFileMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5" />
            )}
            Browse
          </button>
          {hasWorkspace && (
            <button
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              title="Rewrite workspace.repos from the current on-disk repos"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : regenerateMutation.isSuccess ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Regenerate
            </button>
          )}
        </div>
        {hasWorkspace && (
          <p className="mt-1 text-xs text-muted-foreground">
            Layout, root folder, GitHub org, ignore list and per-repo branch are derived from
            this file. Save, then Refresh to scan.
          </p>
        )}
        {regenerateMutation.isSuccess && regenerateMutation.data && (
          <p className="mt-1 text-xs text-success">
            Wrote {regenerateMutation.data.count} repos to workspace.repos
          </p>
        )}
        {regenerateMutation.error && (
          <p className="mt-1 text-xs text-destructive">{regenerateMutation.error.message}</p>
        )}
      </div>

      {/* Root Folder — derived & read-only when a workspace.repos drives the project */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Root Folder {hasWorkspace && <span className="text-muted-foreground">(derived)</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={rootFolder}
            onChange={(e) => setRootFolder(e.target.value)}
            disabled={hasWorkspace}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleBrowse}
            disabled={browseMutation.isPending || hasWorkspace}
            title="Browse folder"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {browseMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5" />
            )}
            Browse
          </button>
        </div>
      </div>

      {/* Parallel Tasks */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Parallel Tasks (1–20)
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={parallelTasks}
          onChange={(e) => setParallelTasks(Number(e.target.value))}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Default Branch */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Default Branch
        </label>
        <input
          type="text"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* npm Organizations */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          npm Organizations (comma-separated)
        </label>
        <input
          type="text"
          value={npmOrganizations}
          onChange={(e) => setNpmOrganizations(e.target.value)}
          placeholder="@xhubio-saas"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Organization / Group URL — provider auto-detected */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Organization / Group{' '}
          {sourceUrl.trim() && (
            <span className="text-muted-foreground">
              ({isGitlab ? 'GitLab' : 'GitHub'} detected)
            </span>
          )}
        </label>
        <input
          type="text"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="xhubio   ·   https://gitlab.com/mygroup   ·   https://gitlab.firma.de/grp/sub"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>GitHub:</strong> just the org name (e.g. <code>xhubio</code>). <strong>GitLab:</strong>{' '}
          a full URL so the host is known (<code>gitlab.com</code> or self-hosted). Pull All clones
          every repo here; GitLab mirrors its group/subgroup structure.
        </p>
      </div>

      {/* GitLab token — only relevant for GitLab sources */}
      {isGitlab && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            GitLab Token <span className="text-muted-foreground">(private groups)</span>
          </label>
          <input
            type="password"
            value={gitlabToken}
            onChange={(e) => setGitlabToken(e.target.value)}
            placeholder="glpat-… (read_api, read_repository) — or set GITLAB_TOKEN env"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {/* GitHub Token — stored in OS keychain; used to list & clone without the gh CLI */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          GitHub Token{' '}
          {tokenStatusQuery.data?.stored && <span className="text-success">(stored)</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={
              tokenStatusQuery.data?.stored
                ? '•••••••• (replace) — ghp_… / github_pat_…'
                : 'ghp_… / github_pat_… (scopes: repo, read:org)'
            }
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => saveGitTokenMutation.mutate({ token: githubToken.trim() })}
            disabled={!githubToken.trim() || saveGitTokenMutation.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {saveGitTokenMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saveGitTokenMutation.isSuccess ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : null}
            Save
          </button>
          {tokenStatusQuery.data?.stored && (
            <button
              onClick={() => deleteGitTokenMutation.mutate()}
              disabled={deleteGitTokenMutation.isPending}
              title="Remove stored token"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Stored securely in the OS keychain. Lets RepoHub list &amp; clone GitHub repos via the
          API — no <code>gh</code> CLI needed. Scopes: <code>repo</code>, <code>read:org</code>.
        </p>
        {(saveGitTokenMutation.error || deleteGitTokenMutation.error) && (
          <p className="mt-1 text-xs text-destructive">
            {(saveGitTokenMutation.error || deleteGitTokenMutation.error)?.message}
          </p>
        )}
      </div>

      {/* npm Registry */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          npm Registry URL
        </label>
        <input
          type="text"
          value={npmRegistry}
          onChange={(e) => setNpmRegistry(e.target.value)}
          placeholder="https://npm.pkg.github.com"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Git Protocol */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Git Clone Protocol
        </label>
        <select
          value={gitProtocol}
          onChange={(e) => setGitProtocol(e.target.value as 'ssh' | 'https')}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        >
          <option value="ssh">SSH (git@github.com:org/repo.git)</option>
          <option value="https">HTTPS (https://github.com/org/repo.git)</option>
        </select>
      </div>

      {/* Quick Actions */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Quick Actions (Bulk Operations)
        </label>
        <div className="space-y-1.5">
          {quickActions.map((action, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={action.label}
                onChange={(e) => {
                  const next = [...quickActions]
                  next[i] = { ...action, label: e.target.value }
                  setQuickActions(next)
                }}
                placeholder="Label"
                className="w-1/3 rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="text"
                value={action.command}
                onChange={(e) => {
                  const next = [...quickActions]
                  next[i] = { ...action, command: e.target.value }
                  setQuickActions(next)
                }}
                placeholder="Command"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => setQuickActions(quickActions.filter((_, j) => j !== i))}
                title="Remove action"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setQuickActions([...quickActions, { label: '', command: '' }])}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add action
          </button>
        </div>
      </div>

      {/* Repo Mapping — only when NOT workspace-driven (else derived from workspace.repos) */}
      {!hasWorkspace && (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Repo Mapping
        </label>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
            {projectQuery.data?.repoMapping
              ? `${Object.keys(projectQuery.data.repoMapping).length} repos mapped, ${projectQuery.data.ignoreRepos?.length ?? 0} ignored`
              : 'Not configured'}
          </div>
          <button
            onClick={() => setShowMappingDialog(true)}
            title="Edit repo mapping"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Map className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={() => importMappingMutation.mutate({})}
            disabled={importMappingMutation.isPending}
            title="Re-import from repo-maintenance.sh"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {importMappingMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : importMappingMutation.isSuccess ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Import
          </button>
        </div>
        {importMappingMutation.isSuccess && importMappingMutation.data && (
          <p className="mt-1 text-xs text-success">
            Imported {importMappingMutation.data.mappingCount} mappings, {importMappingMutation.data.ignoreCount} ignore rules
          </p>
        )}
        {importMappingMutation.error && (
          <p className="mt-1 text-xs text-destructive">
            {importMappingMutation.error.message}
          </p>
        )}
      </div>
      )}

      {/* Last Refresh (read-only) */}
      {initialData.lastRefresh && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Last Refresh
          </label>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
            {new Date(initialData.lastRefresh).toLocaleString()}
          </div>
        </div>
      )}

      {updateMutation.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {updateMutation.error.message}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {showMappingDialog && (
        <RepoMappingDialog
          onClose={() => {
            setShowMappingDialog(false)
            onRefetch()
          }}
        />
      )}
    </>
  )
}
