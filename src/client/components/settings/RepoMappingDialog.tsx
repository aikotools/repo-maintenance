/**
 * Dialog for viewing and editing the repo mapping configuration.
 * Three tabs: Mapped repos, Ignored repos, Unmapped repos.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  EyeOff,
  Loader2,
  Map,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { trpc } from '../../trpc'

interface RepoMappingDialogProps {
  onClose: () => void
}

type Tab = 'mapped' | 'ignored' | 'unmapped'

/** Known domain paths for autocompletion */
const KNOWN_DOMAINS = [
  'core',
  'invoice',
  'invoice/outbound',
  'invoice/inbound',
  'invoice/validators',
  'invoice/gov-api',
  'customer',
  'product',
  'quote',
  'receipt',
  'supplier',
  'pdf',
  'billing',
  'communication',
  'bank',
  'api-key',
  'accounting',
  'accounting/tax',
  'accounting/export',
  'apps',
  'apps/invoice',
  'apps/invoice-api',
  'integrations',
  'mocks',
  'tools',
]

export function RepoMappingDialog({ onClose }: RepoMappingDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('mapped')
  const [search, setSearch] = useState('')

  const projectQuery = trpc.project.get.useQuery()
  const updateMappingMutation = trpc.project.updateRepoMapping.useMutation({
    onSuccess: () => projectQuery.refetch(),
  })
  const updateIgnoreMutation = trpc.project.updateIgnoreRepos.useMutation({
    onSuccess: () => projectQuery.refetch(),
  })

  const config = projectQuery.data

  // Local editable state — initialized from server data
  const [localMapping, setLocalMapping] = useState<Record<string, string>>(
    config?.repoMapping ?? {}
  )
  const [localIgnore, setLocalIgnore] = useState<string[]>(config?.ignoreRepos ?? [])
  const [dirty, setDirty] = useState(false)

  // Unmapped repos from the last pull-all history
  const historyQuery = trpc.git.pullAllHistory.useQuery({ limit: 1 })
  const unmappedRepos = useMemo(() => {
    const lastEntry = historyQuery.data?.[0]
    if (!lastEntry) return []
    return lastEntry.results
      .filter((r) => r.status === 'unmapped')
      .map((r) => r.repoId)
  }, [historyQuery.data])

  const filteredMapping = useMemo(() => {
    const entries = Object.entries(localMapping)
    if (!search) return entries
    const q = search.toLowerCase()
    return entries.filter(
      ([repo, domain]) =>
        repo.toLowerCase().includes(q) || domain.toLowerCase().includes(q)
    )
  }, [localMapping, search])

  const filteredIgnore = useMemo(() => {
    if (!search) return localIgnore
    const q = search.toLowerCase()
    return localIgnore.filter((r) => r.toLowerCase().includes(q))
  }, [localIgnore, search])

  const filteredUnmapped = useMemo(() => {
    if (!search) return unmappedRepos
    const q = search.toLowerCase()
    return unmappedRepos.filter((r) => r.toLowerCase().includes(q))
  }, [unmappedRepos, search])

  function handleSetMapping(repo: string, domain: string) {
    setLocalMapping((prev) => ({ ...prev, [repo]: domain }))
    setDirty(true)
  }

  function handleRemoveMapping(repo: string) {
    setLocalMapping((prev) => {
      const next = { ...prev }
      delete next[repo]
      return next
    })
    setDirty(true)
  }

  function handleMoveToIgnore(repo: string) {
    handleRemoveMapping(repo)
    if (!localIgnore.includes(repo)) {
      setLocalIgnore((prev) => [...prev, repo])
    }
    setDirty(true)
  }

  function handleRemoveIgnore(repo: string) {
    setLocalIgnore((prev) => prev.filter((r) => r !== repo))
    setDirty(true)
  }

  function handleMoveIgnoreToMapping(repo: string) {
    handleRemoveIgnore(repo)
    // Add to mapping with empty domain — user needs to fill it
    setLocalMapping((prev) => ({ ...prev, [repo]: '' }))
    setDirty(true)
    setActiveTab('mapped')
  }

  function handleMapUnmapped(repo: string, domain: string) {
    setLocalMapping((prev) => ({ ...prev, [repo]: domain }))
    setDirty(true)
  }

  function handleIgnoreUnmapped(repo: string) {
    if (!localIgnore.includes(repo)) {
      setLocalIgnore((prev) => [...prev, repo])
    }
    setDirty(true)
  }

  function handleAddNewMapping() {
    const name = prompt('Repo name:')
    if (!name) return
    setLocalMapping((prev) => ({ ...prev, [name]: '' }))
    setDirty(true)
  }

  function handleSave() {
    updateMappingMutation.mutate({ repoMapping: localMapping })
    updateIgnoreMutation.mutate({ ignoreRepos: localIgnore })
    setDirty(false)
  }

  const isSaving = updateMappingMutation.isPending || updateIgnoreMutation.isPending
  const isLoading = projectQuery.isLoading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="flex w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-xl"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Repo Mapping</h3>
            {dirty && (
              <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                unsaved
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center justify-between border-b border-border px-4">
          <div className="flex gap-4">
            <TabButton
              label={`Mapped (${Object.keys(localMapping).length})`}
              active={activeTab === 'mapped'}
              onClick={() => setActiveTab('mapped')}
            />
            <TabButton
              label={`Ignored (${localIgnore.length})`}
              active={activeTab === 'ignored'}
              onClick={() => setActiveTab('ignored')}
            />
            <TabButton
              label={`Unmapped (${unmappedRepos.length})`}
              active={activeTab === 'unmapped'}
              onClick={() => setActiveTab('unmapped')}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-3 px-4 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : (
            <>
              {activeTab === 'mapped' && (
                <MappedTab
                  entries={filteredMapping}
                  onSetDomain={handleSetMapping}
                  onRemove={handleRemoveMapping}
                  onMoveToIgnore={handleMoveToIgnore}
                  onAdd={handleAddNewMapping}
                />
              )}
              {activeTab === 'ignored' && (
                <IgnoredTab
                  repos={filteredIgnore}
                  onRemove={handleRemoveIgnore}
                  onMoveToMapping={handleMoveIgnoreToMapping}
                />
              )}
              {activeTab === 'unmapped' && (
                <UnmappedTab
                  repos={filteredUnmapped}
                  onMap={handleMapUnmapped}
                  onIgnore={handleIgnoreUnmapped}
                  localMapping={localMapping}
                  localIgnore={localIgnore}
                />
              )}
            </>
          )}
        </div>

        {/* Domain suggestions datalist */}
        <datalist id="domain-suggestions">
          {KNOWN_DOMAINS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {Object.keys(localMapping).length} mapped, {localIgnore.length} ignored
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab button ──

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 py-2.5 text-sm transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

// ── Mapped tab ──

function MappedTab({
  entries,
  onSetDomain,
  onRemove,
  onMoveToIgnore,
  onAdd,
}: {
  entries: [string, string][]
  onSetDomain: (repo: string, domain: string) => void
  onRemove: (repo: string) => void
  onMoveToIgnore: (repo: string) => void
  onAdd: () => void
}) {
  return (
    <div>
      {/* Column header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <div className="w-[280px]">Repo Name</div>
        <div className="w-4" />
        <div className="flex-1">Domain Path</div>
        <div className="w-16" />
      </div>

      {entries.map(([repo, domain]) => (
        <MappingRow
          key={repo}
          repo={repo}
          domain={domain}
          onSetDomain={(d) => onSetDomain(repo, d)}
          onRemove={() => onRemove(repo)}
          onMoveToIgnore={() => onMoveToIgnore(repo)}
        />
      ))}

      {entries.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No mapped repos found.
        </div>
      )}

      {/* Add button */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
        >
          <Plus className="h-3 w-3" />
          Add mapping
        </button>
      </div>
    </div>
  )
}

function MappingRow({
  repo,
  domain,
  onSetDomain,
  onRemove,
  onMoveToIgnore,
}: {
  repo: string
  domain: string
  onSetDomain: (domain: string) => void
  onRemove: () => void
  onMoveToIgnore: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1 last:border-b-0">
      <span className="w-[280px] truncate font-mono text-xs">{repo}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <input
          type="text"
          value={domain}
          onChange={(e) => onSetDomain(e.target.value)}
          list="domain-suggestions"
          placeholder="e.g. core, invoice/outbound"
          className={`w-full rounded border px-2 py-0.5 font-mono text-xs focus:border-primary focus:outline-none ${
            domain ? 'border-border bg-background' : 'border-yellow-500/50 bg-yellow-500/5'
          }`}
        />
      </div>
      <div className="flex w-16 justify-end gap-1">
        <button
          onClick={onMoveToIgnore}
          title="Move to ignored"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <EyeOff className="h-3 w-3" />
        </button>
        <button
          onClick={onRemove}
          title="Remove mapping"
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ── Ignored tab ──

function IgnoredTab({
  repos,
  onRemove,
  onMoveToMapping,
}: {
  repos: string[]
  onRemove: (repo: string) => void
  onMoveToMapping: (repo: string) => void
}) {
  return (
    <div>
      {repos.map((repo) => (
        <div
          key={repo}
          className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
        >
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{repo}</span>
          <button
            onClick={() => onMoveToMapping(repo)}
            title="Move to mapping"
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-primary hover:bg-primary/10"
          >
            <Map className="h-3 w-3" />
            Map
          </button>
          <button
            onClick={() => onRemove(repo)}
            title="Remove from ignore list"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}

      {repos.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No ignored repos.
        </div>
      )}
    </div>
  )
}

// ── Unmapped tab ──

function UnmappedTab({
  repos,
  onMap,
  onIgnore,
  localMapping,
  localIgnore,
}: {
  repos: string[]
  onMap: (repo: string, domain: string) => void
  onIgnore: (repo: string) => void
  localMapping: Record<string, string>
  localIgnore: string[]
}) {
  // Filter out repos that were already handled in this session
  const pending = repos.filter(
    (r) => !localMapping[r] && !localIgnore.includes(r)
  )
  const handled = repos.filter(
    (r) => localMapping[r] !== undefined || localIgnore.includes(r)
  )

  return (
    <div>
      {pending.length === 0 && handled.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No unmapped repos from last Pull All.
        </div>
      )}

      {pending.map((repo) => (
        <UnmappedRow
          key={repo}
          repo={repo}
          onMap={(domain) => onMap(repo, domain)}
          onIgnore={() => onIgnore(repo)}
        />
      ))}

      {handled.length > 0 && (
        <>
          <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Assigned in this session ({handled.length})
          </div>
          {handled.map((repo) => (
            <div
              key={repo}
              className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
              <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                {repo}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {localMapping[repo] !== undefined
                  ? `→ ${localMapping[repo] || '(empty)'}`
                  : 'ignored'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function UnmappedRow({
  repo,
  onMap,
  onIgnore,
}: {
  repo: string
  onMap: (domain: string) => void
  onIgnore: () => void
}) {
  const [domain, setDomain] = useState('')

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
      <span className="w-[220px] truncate font-mono text-xs">{repo}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        list="domain-suggestions"
        placeholder="domain path..."
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 font-mono text-xs focus:border-primary focus:outline-none"
      />
      <button
        onClick={() => {
          if (domain.trim()) onMap(domain.trim())
        }}
        disabled={!domain.trim()}
        title="Assign to domain"
        className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20 disabled:opacity-30"
      >
        <Map className="h-3 w-3" />
        Map
      </button>
      <button
        onClick={onIgnore}
        title="Ignore this repo"
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
      >
        <EyeOff className="h-3 w-3" />
        Ignore
      </button>
    </div>
  )
}
