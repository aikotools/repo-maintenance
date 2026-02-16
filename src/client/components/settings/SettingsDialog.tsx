/**
 * Settings dialog for editing ProjectConfig.
 */

import { useState } from 'react'
import { Check, FileDown, FolderOpen, Loader2, Map, Settings, X } from 'lucide-react'
import type { ProjectConfig } from '../../../shared/types'
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
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
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
        <div className="space-y-4 p-4">
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
  const projectQuery = trpc.project.get.useQuery()

  const [showMappingDialog, setShowMappingDialog] = useState(false)

  const [name, setName] = useState(initialData.name)
  const [rootFolder, setRootFolder] = useState(initialData.rootFolder)
  const [parallelTasks, setParallelTasks] = useState(initialData.parallelTasks)
  const [defaultBranch, setDefaultBranch] = useState(initialData.defaultBranch)
  const [npmOrganizations, setNpmOrganizations] = useState(initialData.npmOrganizations.join(', '))
  const [githubOrganizations, setGithubOrganizations] = useState(
    initialData.githubOrganizations.join(', ')
  )
  const [npmRegistry, setNpmRegistry] = useState(
    initialData.npmRegistry || 'https://npm.pkg.github.com'
  )

  function handleSave() {
    updateMutation.mutate({
      name,
      rootFolder,
      parallelTasks,
      defaultBranch,
      npmOrganizations: npmOrganizations
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      githubOrganizations: githubOrganizations
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      npmRegistry: npmRegistry.trim() || 'https://npm.pkg.github.com',
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

      {/* Root Folder */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Root Folder
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={rootFolder}
            onChange={(e) => setRootFolder(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleBrowse}
            disabled={browseMutation.isPending}
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

      {/* GitHub Organizations */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          GitHub Organizations (comma-separated)
        </label>
        <input
          type="text"
          value={githubOrganizations}
          onChange={(e) => setGithubOrganizations(e.target.value)}
          placeholder="xhubio"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
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

      {/* Repo Mapping */}
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
