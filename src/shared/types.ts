/**
 * Shared types for RepoHub - used by both server and client.
 */

/** Repository type, derived from naming convention */
export type RepoType =
  | 'kernel'
  | 'kernel-plugin'
  | 'frontend-kernel'
  | 'frontend-plugin'
  | 'frontend-ui'
  | 'lib'
  | 'app'
  | 'tool'
  | 'mock'
  | 'integration'

/** Git status for a file */
export type FileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | '?' | '!'

/** A single changed file in git */
export interface ChangedFile {
  path: string
  status: FileStatus
  staged: boolean
}

/** A recent git commit */
export interface RecentCommit {
  hash: string
  message: string
  date: string
  author: string
}

/** Git status summary for a repo */
export interface GitStatus {
  branch: string
  hasUncommittedChanges: boolean
  changedFiles: ChangedFile[]
  stagedCount: number
  modifiedCount: number
  untrackedCount: number
  aheadCount: number
  behindCount: number
  recentCommits: RecentCommit[]
}

/** Sub-group within a domain (e.g. "outbound" under "invoice") */
export interface SubGroup {
  id: string
  path: string
  repoIds: string[]
}

/** Domain grouping (e.g., "core", "invoice", "accounting") */
export interface Domain {
  id: string
  path: string
  repoCount: number
  hasUncommitted: boolean
  subGroups: SubGroup[]
}

/** Internal dependency reference */
export interface InternalDep {
  npmName: string
  repoId: string
  versionSpec: string
}

/** A single repository */
export interface Repo {
  id: string
  path: string
  absolutePath: string
  domain: string
  subGroup?: string
  type: RepoType
  npmPackage: string
  version: string
  dependencies: InternalDep[]
  dependents: string[]
  gitStatus?: GitStatus
}

/** An edge in the dependency graph */
export interface DependencyEdge {
  from: string
  to: string
  versionSpec: string
}

/** Full dependency graph */
export interface DependencyGraph {
  nodes: Repo[]
  edges: DependencyEdge[]
  layers: Record<number, string[]>
}

/** Affected repos analysis result */
export interface AffectedRepo {
  id: string
  layer: number
  dependencyPath: string[]
}

export interface AffectedResult {
  sourceId: string
  affected: AffectedRepo[]
  totalCount: number
}

/** Global config stored in ~/.repoMaintenance/global.json */
export interface GlobalConfig {
  activeProject: string
  projects: string[]
}

/** Summary of a project for listing */
export interface ProjectSummary {
  slug: string
  name: string
  rootFolder: string
  isActive: boolean
}

/** A configurable quick action for bulk operations */
export interface QuickAction {
  label: string
  command: string
}

/** Project configuration stored in ~/.repoMaintenance/projects/<slug>/project.json */
export interface ProjectConfig {
  name: string
  rootFolder: string
  npmOrganizations: string[]
  githubOrganizations: string[]
  npmRegistry: string
  parallelTasks: number
  defaultBranch: string
  lastRefresh?: string
  /** Manual overrides: repoDir → domainName */
  domainOverrides?: Record<string, string>
  /** Repo name → domain path mapping (e.g. "kernel" → "core", "lib-invoice-outbound-de" → "invoice/outbound") */
  repoMapping?: Record<string, string>
  /** Repo names to skip during pull-all */
  ignoreRepos?: string[]
  /** Configurable quick actions for bulk operations */
  quickActions?: QuickAction[]
}

/** Dashboard statistics */
export interface DashboardStats {
  totalRepos: number
  totalDomains: number
  uncommittedCount: number
  totalDependencyEdges: number
}

/** Result of a git diff operation */
export interface FileDiff {
  filePath: string
  status: FileStatus
  hunks: DiffHunk[]
  binary: boolean
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

/** Result of a git diff for an entire repo */
export interface DiffResult {
  repoId: string
  files: FileDiff[]
}

// ──────────────────────────────────────────────
// Cascade types
// ──────────────────────────────────────────────

/** Status of a single cascade step (repo update) */
export type CascadeStepStatus =
  | 'pending'
  | 'updating-deps'
  | 'installing'
  | 'testing'
  | 'committing'
  | 'pushing'
  | 'waiting-ci'
  | 'done'
  | 'failed'
  | 'skipped'

/** A dependency version change within a cascade step */
export interface CascadeDepUpdate {
  npmName: string
  fromVersion: string
  toVersion: string
}

/** A single step in a cascade layer (one repo to update) */
export interface CascadeStep {
  repoId: string
  status: CascadeStepStatus
  commitMessage: string
  depsToUpdate: CascadeDepUpdate[]
  publishedVersion?: string
  error?: string
  startedAt?: string
  completedAt?: string
  ciRunUrl?: string
  ciStatus?: 'pending' | 'running' | 'success' | 'failure' | 'skipped'
}

/** A layer of cascade steps executed together */
export interface CascadeLayer {
  layerIndex: number
  mode: 'parallel' | 'sequential'
  steps: CascadeStep[]
}

/** Pre-execution cascade plan */
export interface CascadePlan {
  sourceRepoId: string
  sourceCommitMessage: string
  layers: CascadeLayer[]
  totalRepos: number
  waitForCi: boolean
  runTests: boolean
  commitPrefix: string
}

/** Overall execution status */
export type CascadeExecutionStatus = 'running' | 'paused' | 'completed' | 'failed' | 'aborted'

/** Live cascade execution state */
export interface CascadeExecution {
  id: string
  plan: CascadePlan
  status: CascadeExecutionStatus
  currentLayerIndex: number
  completedCount: number
  failedCount: number
  skippedCount: number
  startedAt: string
  completedAt?: string
  error?: string
}

/** Persisted cascade history entry */
export interface CascadeHistoryEntry {
  id: string
  sourceRepoId: string
  status: CascadeExecutionStatus
  totalRepos: number
  completedCount: number
  failedCount: number
  startedAt: string
  completedAt?: string
  layers: CascadeLayer[]
}

// ──────────────────────────────────────────────
// Bulk operation types
// ──────────────────────────────────────────────

/** Status of a bulk operation (per-repo or overall) */
export type BulkOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted'

/** Result of running a command on a single repo */
export interface BulkOperationResult {
  repoId: string
  status: BulkOperationStatus
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  coverage?: number
  startedAt: string
  completedAt?: string
}

/** A bulk execution across multiple repos */
export interface BulkExecution {
  id: string
  command: string
  repoIds: string[]
  status: BulkOperationStatus
  results: BulkOperationResult[]
  completedCount: number
  failedCount: number
  startedAt: string
  completedAt?: string
  concurrency: number
}

/** Result of a git operation (commit, push, pull) */
export interface GitOperationResult {
  success: boolean
  message: string
  details?: string
}

/** Pull result for a single repo */
export interface PullResult {
  repoId: string
  success: boolean
  message: string
  changes: number
  status?: PullResultStatus
}

/** Status of a single pull operation */
export type PullResultStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'cloned'
  | 'skipped'
  | 'unmapped'

/** Live pull-all execution state */
export interface PullAllExecution {
  id: string
  status: 'running' | 'completed' | 'aborted'
  results: PullResult[]
  completedCount: number
  failedCount: number
  withChanges: number
  clonedCount: number
  skippedCount: number
  unmappedCount: number
  total: number
  startedAt: string
  completedAt?: string
}

/** Persisted pull-all history entry */
export interface PullAllHistoryEntry {
  id: string
  status: 'completed' | 'aborted'
  total: number
  completedCount: number
  failedCount: number
  withChanges: number
  clonedCount: number
  skippedCount: number
  unmappedCount: number
  startedAt: string
  completedAt?: string
  results: PullResult[]
}

// ──────────────────────────────────────────────
// Package / file URL types
// ──────────────────────────────────────────────

/** A file: URL dependency found in a repo's package.json */
export interface FileUrlDep {
  repoId: string
  repoPath: string
  depName: string
  currentValue: string
  targetRepoPath?: string
}

/** Result of scanning for file: URL dependencies */
export interface FileUrlScanResult {
  repos: FileUrlDep[]
  totalRepos: number
  affectedRepos: number
}
