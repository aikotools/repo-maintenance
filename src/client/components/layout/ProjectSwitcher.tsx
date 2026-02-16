/**
 * Project switcher dropdown for the sidebar header.
 * Lists all projects, allows switching and creating new ones.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import { trpc } from '../../trpc'
import type { ProjectSummary } from '../../../shared/types'

interface ProjectSwitcherProps {
  onProjectSwitch: () => void
}

export function ProjectSwitcher({ onProjectSwitch }: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const projectsQuery = trpc.project.listProjects.useQuery()
  const switchMutation = trpc.project.switchProject.useMutation({
    onSuccess: () => {
      projectsQuery.refetch()
      onProjectSwitch()
    },
  })
  const createMutation = trpc.project.createProject.useMutation({
    onSuccess: () => {
      projectsQuery.refetch()
      setShowCreate(false)
    },
  })
  const deleteMutation = trpc.project.deleteProject.useMutation({
    onSuccess: () => {
      projectsQuery.refetch()
    },
  })

  const projects = projectsQuery.data ?? []
  const activeProject = projects.find((p) => p.isActive)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowCreate(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  function handleSwitch(slug: string) {
    switchMutation.mutate({ slug })
    setIsOpen(false)
  }

  function handleDelete(e: React.MouseEvent, slug: string) {
    e.stopPropagation()
    if (confirm(`Delete project "${slug}"?`)) {
      deleteMutation.mutate({ slug })
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        title="Switch project"
      >
        <span className="max-w-[80px] truncate">{activeProject?.name ?? 'Project'}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-sidebar-bg shadow-lg">
          {/* Project list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {projects.map((p) => (
              <ProjectRow
                key={p.slug}
                project={p}
                onSwitch={() => handleSwitch(p.slug)}
                onDelete={(e) => handleDelete(e, p.slug)}
              />
            ))}
          </div>

          {/* Divider + Create */}
          <div className="border-t border-border p-1">
            {showCreate ? (
              <CreateProjectForm
                onSubmit={(name, rootFolder) => createMutation.mutate({ name, rootFolder })}
                onCancel={() => setShowCreate(false)}
                isLoading={createMutation.isPending}
              />
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New project...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectRow({
  project,
  onSwitch,
  onDelete,
}: {
  project: ProjectSummary
  onSwitch: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSwitch}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSwitch() }}
      className={`group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        project.isActive
          ? 'bg-primary/10 text-primary'
          : 'text-foreground hover:bg-sidebar-hover'
      }`}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{project.name}</div>
        {project.rootFolder && (
          <div className="truncate text-[10px] text-muted-foreground">{project.rootFolder}</div>
        )}
      </div>
      {!project.isActive && (
        <button
          onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title="Delete project"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function CreateProjectForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (name: string, rootFolder: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [name, setName] = useState('')
  const [rootFolder, setRootFolder] = useState('')
  const browseMutation = trpc.project.browseFolder.useMutation()

  async function handleBrowse() {
    const result = await browseMutation.mutateAsync({ currentPath: rootFolder || undefined })
    if (result.path) setRootFolder(result.path)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim(), rootFolder)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5 p-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          New project
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full rounded border border-border bg-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        autoFocus
      />
      <div className="flex gap-1">
        <input
          type="text"
          value={rootFolder}
          onChange={(e) => setRootFolder(e.target.value)}
          placeholder="Root folder path"
          className="min-w-0 flex-1 rounded border border-border bg-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleBrowse}
          className="shrink-0 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
        >
          ...
        </button>
      </div>
      <button
        type="submit"
        disabled={!name.trim() || isLoading}
        className="w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
