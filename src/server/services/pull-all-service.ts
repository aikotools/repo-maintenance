/**
 * Service for pulling all repos in parallel with progress tracking,
 * cancellation support, "no tracking information" fallback,
 * and GitHub-based clone-missing + pull-existing flow.
 * Follows the BulkService fire-and-forget pattern.
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import simpleGit from 'simple-git'
import type { PullAllExecution, ProjectConfig, Repo, WorkspaceEntry } from '../../shared/types'
import type { ConfigService } from './config-service'
import type { GitAuthService } from './git-auth-service'
import { spawnProcess } from './process'
import { TaskQueue } from './task-queue'
import { githubOrgFromUrl } from './workspace-repos'
import { groupRelativePath, listGroupProjects } from './gitlab-service'
import { parseRepoSource } from './repo-source'

/** Internal item representing what to do for each GitHub repo */
interface ExecutionItem {
  name: string
  action: 'pull' | 'clone' | 'skip' | 'unmapped'
  /** Set when action=pull — the existing local repo */
  repo?: Repo
  /** Set when action=clone — the target directory relative to rootFolder (e.g. "core") */
  targetDir?: string
}

export class PullAllService {
  private executions = new Map<string, PullAllExecution>()
  private abortControllers = new Map<string, AbortController>()

  constructor(
    private defaultConcurrency: number,
    private configService: ConfigService,
    private gitAuthService: GitAuthService
  ) {}

  /**
   * Start pulling all repos in the background.
   * If repoMapping is configured, fetches GitHub repos, clones missing, and pulls existing.
   * Otherwise falls back to pulling only locally known repos.
   * Returns execution ID for polling.
   */
  startPullAll(repos: Repo[], config: ProjectConfig): string {
    const id = `pull-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const execution: PullAllExecution = {
      id,
      status: 'running',
      results: [],
      completedCount: 0,
      failedCount: 0,
      withChanges: 0,
      clonedCount: 0,
      skippedCount: 0,
      unmappedCount: 0,
      total: 0,
      startedAt: new Date().toISOString(),
    }

    this.executions.set(id, execution)
    const controller = new AbortController()
    this.abortControllers.set(id, controller)

    // Fire-and-forget: resolve config (auto-import if needed) then execute
    this.resolveConfigAndExecute(id, repos, config, controller.signal).catch((err) => {
      console.error(`[PullAll] Execution ${id} failed:`, err)
      const exec = this.executions.get(id)
      if (exec && exec.status === 'running') {
        exec.status = 'completed'
        exec.completedAt = new Date().toISOString()
      }
    })

    return id
  }

  getExecution(id: string): PullAllExecution | undefined {
    return this.executions.get(id)
  }

  abort(id: string): boolean {
    const exec = this.executions.get(id)
    if (!exec || exec.status !== 'running') return false

    const controller = this.abortControllers.get(id)
    if (controller) controller.abort()

    exec.status = 'aborted'
    exec.completedAt = new Date().toISOString()

    for (const result of exec.results) {
      if (result.status === 'pending') {
        result.status = 'aborted'
        result.message = 'Aborted'
      }
    }

    this.saveToHistory(exec)
    return true
  }

  // ── Config resolution: auto-import mapping if repo-maintenance.sh exists ──

  private async resolveConfigAndExecute(
    executionId: string,
    repos: Repo[],
    config: ProjectConfig,
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    // Workspace.repos drives everything when configured: clone url@branch / pull,
    // no GitHub API needed.
    const ws = this.configService.loadWorkspace(config)
    if (ws && ws.entries.length > 0) {
      await this.executeWithWorkspace(executionId, config, ws, signal)
      return
    }

    // Explicit org/group URL: auto-detect the provider from the host.
    const source = parseRepoSource(config.sourceUrl)
    if (source?.provider === 'gitlab') {
      await this.executeWithGitLab(executionId, repos, config, source.host, source.owner, signal)
      return
    }
    // GitHub org from the URL (first path segment) overrides githubOrganizations below.
    const sourceGithubOrg =
      source?.provider === 'github' ? source.owner.split('/')[0] : undefined

    let effectiveConfig = config

    // Auto-import mapping from repo-maintenance.sh if not yet configured
    const hasMapping = config.repoMapping && Object.keys(config.repoMapping).length > 0
    if (!hasMapping) {
      const scriptPath = path.join(config.rootFolder, 'repo-maintenance.sh')
      if (existsSync(scriptPath)) {
        try {
          console.log('[PullAll] Auto-importing repo mapping from repo-maintenance.sh...')
          const scriptContent = readFileSync(scriptPath, 'utf-8')
          const result = await this.configService.importRepoMapping(scriptContent)
          console.log(
            `[PullAll] Imported ${Object.keys(result.mapping).length} mappings, ${result.ignore.length} ignore rules`
          )
          // Reload config with the newly imported mapping
          effectiveConfig = await this.configService.getProjectConfig()
        } catch (err) {
          console.error('[PullAll] Failed to auto-import mapping:', err)
        }
      }
    }

    const hasMappingNow =
      effectiveConfig.repoMapping && Object.keys(effectiveConfig.repoMapping).length > 0
    const hasGitHubOrg =
      !!sourceGithubOrg ||
      (effectiveConfig.githubOrganizations && effectiveConfig.githubOrganizations.length > 0)

    if (hasMappingNow || hasGitHubOrg) {
      await this.executeWithGitHub(executionId, repos, effectiveConfig, sourceGithubOrg, signal)
    } else {
      // Fallback: only pull locally known repos (old behavior)
      exec.results = repos.map((r) => ({
        repoId: r.path,
        success: false,
        message: '',
        changes: 0,
        status: 'pending' as const,
      }))
      exec.total = repos.length
      await this.executeLocalOnly(executionId, repos, effectiveConfig.defaultBranch, signal)
    }
  }

  // ── GitHub-based flow: fetch repos, clone missing, pull existing ──

  private async executeWithGitHub(
    executionId: string,
    localRepos: Repo[],
    config: ProjectConfig,
    orgOverride: string | undefined,
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    // Tolerate a leading "@" (npm-style) that users often paste — invalid for `gh`.
    const org = (orgOverride || config.githubOrganizations[0])?.replace(/^@+/, '')
    if (!org) {
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
      return
    }

    // 1. Fetch GitHub repos
    let githubRepos: string[]
    try {
      githubRepos = await this.fetchGithubRepos(org)
    } catch (err) {
      console.error('[PullAll] Failed to fetch GitHub repos:', err)
      // Fallback to local-only pull
      exec.results = localRepos.map((r) => ({
        repoId: r.path,
        success: false,
        message: '',
        changes: 0,
        status: 'pending' as const,
      }))
      exec.total = localRepos.length
      await this.executeLocalOnly(executionId, localRepos, config.defaultBranch, signal)
      return
    }

    if (signal.aborted) return

    // 2. Build local lookup: repo directory name → Repo
    const localMap = new Map<string, Repo>()
    for (const repo of localRepos) {
      const dirName = path.basename(repo.absolutePath)
      localMap.set(dirName, repo)
    }

    // 3. Build execution items from GitHub repos
    const hasMapping = config.repoMapping && Object.keys(config.repoMapping).length > 0
    const items: ExecutionItem[] = []
    for (const ghRepo of githubRepos) {
      if (config.ignoreRepos?.includes(ghRepo)) {
        items.push({ name: ghRepo, action: 'skip' })
      } else if (localMap.has(ghRepo)) {
        items.push({ name: ghRepo, action: 'pull', repo: localMap.get(ghRepo)! })
      } else if (config.repoMapping?.[ghRepo]) {
        items.push({
          name: ghRepo,
          action: 'clone',
          targetDir: config.repoMapping[ghRepo],
        })
      } else if (!hasMapping || orgOverride) {
        // No mapping, or an explicit source URL was given ("clone the whole org") —
        // clone unmapped repos into the root folder instead of skipping them.
        items.push({ name: ghRepo, action: 'clone', targetDir: '.' })
      } else {
        items.push({ name: ghRepo, action: 'unmapped' })
      }
    }

    // 4. Initialize execution results
    exec.results = items.map((item) => {
      const repoId =
        item.action === 'pull'
          ? item.repo!.path
          : item.action === 'clone'
            ? `${item.targetDir}/${item.name}`
            : item.name

      if (item.action === 'skip') {
        exec.skippedCount++
        return {
          repoId,
          success: true,
          message: 'Ignored',
          changes: 0,
          status: 'skipped' as const,
        }
      }
      if (item.action === 'unmapped') {
        exec.unmappedCount++
        return {
          repoId,
          success: true,
          message: 'No mapping defined',
          changes: 0,
          status: 'unmapped' as const,
        }
      }
      return {
        repoId,
        success: false,
        message: '',
        changes: 0,
        status: 'pending' as const,
      }
    })
    exec.total = items.length

    // 5. Execute clone/pull items in parallel
    const actionItems = items.filter((i) => i.action === 'pull' || i.action === 'clone')
    const queue = new TaskQueue(this.defaultConcurrency)

    await queue.run(actionItems, async (item) => {
      if (signal.aborted) return

      const result = exec.results.find(
        (r) =>
          r.repoId ===
          (item.action === 'pull'
            ? item.repo!.path
            : `${item.targetDir}/${item.name}`)
      )
      if (!result) return

      result.status = 'running'

      try {
        if (item.action === 'pull') {
          const pullResult = await this.pullWithFallback(
            item.repo!.absolutePath,
            config.defaultBranch
          )
          result.success = pullResult.success
          result.message = pullResult.message
          result.changes = pullResult.changes
          result.status = pullResult.success ? 'completed' : 'failed'

          if (pullResult.success) {
            exec.completedCount++
            if (pullResult.changes > 0) exec.withChanges++
          } else {
            exec.failedCount++
          }
        } else if (item.action === 'clone') {
          const cloneResult = await this.cloneRepo(
            org,
            item.name,
            path.join(config.rootFolder, item.targetDir!, item.name),
            config.gitProtocol || 'ssh'
          )
          result.success = cloneResult.success
          result.message = cloneResult.message
          result.changes = 0
          result.status = cloneResult.success ? 'cloned' : 'failed'

          if (cloneResult.success) {
            exec.clonedCount++
          } else {
            exec.failedCount++
          }
        }
      } catch (err) {
        if (signal.aborted) return
        result.status = 'failed'
        result.success = false
        result.message = `Failed (${item.name}): ${err instanceof Error ? err.message : String(err)}`
        exec.failedCount++
      }
    })

    if (exec.status === 'running') {
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
    }

    this.saveToHistory(exec)
  }

  // ── workspace.repos flow: clone missing (url@branch), pull existing ──

  private async executeWithWorkspace(
    executionId: string,
    config: ProjectConfig,
    ws: { entries: WorkspaceEntry[]; skipped: string[]; workspaceDir: string },
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    const ignore = new Set([...(config.ignoreRepos ?? []), ...ws.skipped])
    const protocol = config.gitProtocol || 'ssh'

    interface WsItem {
      name: string
      absPath: string
      branch: string
      url: string
      action: 'pull' | 'clone' | 'skip'
    }

    const items: WsItem[] = ws.entries.map((entry) => {
      const absPath = path.join(ws.workspaceDir, entry.path)
      const name = path.basename(entry.path)
      const action = ignore.has(name)
        ? 'skip'
        : existsSync(path.join(absPath, '.git'))
          ? 'pull'
          : 'clone'
      return { name, absPath, branch: entry.branch, url: entry.url, action }
    })

    exec.results = items.map((item) => {
      if (item.action === 'skip') {
        exec.skippedCount++
        return { repoId: item.name, success: true, message: 'Ignored', changes: 0, status: 'skipped' as const }
      }
      return { repoId: item.name, success: false, message: '', changes: 0, status: 'pending' as const }
    })
    exec.total = items.length

    const actionItems = items.filter((i) => i.action !== 'skip')
    const queue = new TaskQueue(this.defaultConcurrency)

    await queue.run(actionItems, async (item) => {
      if (signal.aborted) return
      const result = exec.results.find((r) => r.repoId === item.name)
      if (!result) return
      result.status = 'running'

      try {
        if (item.action === 'pull') {
          // ponytail: pull only, no auto-checkout — switching branches with local
          // work would be destructive; branch is used as the tracking fallback.
          const r = await this.pullWithFallback(item.absPath, item.branch)
          result.success = r.success
          result.message = r.message
          result.changes = r.changes
          result.status = r.success ? 'completed' : 'failed'
          if (r.success) {
            exec.completedCount++
            if (r.changes > 0) exec.withChanges++
          } else {
            exec.failedCount++
          }
        } else {
          const r = await this.cloneFromUrl(item.url, item.absPath, item.branch, protocol)
          result.success = r.success
          result.message = r.message
          result.status = r.success ? 'cloned' : 'failed'
          if (r.success) exec.clonedCount++
          else exec.failedCount++
        }
      } catch (err) {
        if (signal.aborted) return
        result.status = 'failed'
        result.success = false
        result.message = `Failed (${item.name}): ${err instanceof Error ? err.message : String(err)}`
        exec.failedCount++
      }
    })

    if (exec.status === 'running') {
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
    }
    this.saveToHistory(exec)
  }

  /** Clone from a full git URL into targetPath, checking out `branch`. */
  private async cloneFromUrl(
    url: string,
    targetPath: string,
    branch: string,
    protocol: 'ssh' | 'https'
  ): Promise<{ success: boolean; message: string }> {
    if (existsSync(path.join(targetPath, '.git'))) {
      return { success: true, message: 'Already exists locally' }
    }

    const org = githubOrgFromUrl(url)
    const name = path.basename(targetPath)
    const cloneUrl =
      protocol === 'https' && org ? await this.gitAuthService.buildAuthUrl(org, name) : url
    const env = this.gitAuthService.getGitEnv()

    const args = ['git', 'clone', cloneUrl, targetPath, '--quiet']
    if (branch) args.push('--branch', branch)
    const { promise } = spawnProcess(args, { env })
    const result = await promise

    if (result.exitCode !== 0) {
      const stderr = result.stderr.replace(/x-access-token:[^@]+@/, 'x-access-token:***@')
      return { success: false, message: `Clone failed (${protocol}): ${stderr.trim()}` }
    }

    // Don't persist a tokenized remote
    if (protocol === 'https' && org) {
      try {
        await simpleGit(targetPath).remote(['set-url', 'origin', `https://github.com/${org}/${name}.git`])
      } catch {
        // non-critical
      }
    }
    return { success: true, message: `Cloned (${branch || 'default'})` }
  }

  // ── GitLab flow: clone all group projects mirroring the group structure ──

  private async executeWithGitLab(
    executionId: string,
    localRepos: Repo[],
    config: ProjectConfig,
    host: string,
    group: string,
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    const token = config.gitlabToken || process.env.GITLAB_TOKEN
    const protocol = config.gitProtocol || 'ssh'
    const ignore = new Set(config.ignoreRepos ?? [])

    // Already-cloned repos keep their existing location — local layout wins.
    // The GitLab group/subgroup structure is only used as the clone target for
    // repos that don't exist locally yet.
    const localByName = new Map<string, Repo>()
    for (const r of localRepos) localByName.set(path.basename(r.absolutePath), r)

    let projects
    try {
      projects = await listGroupProjects({ host, group, token })
    } catch (err) {
      console.error('[PullAll] GitLab listing failed:', err)
      exec.results = [
        {
          repoId: group,
          success: false,
          message: err instanceof Error ? err.message : String(err),
          changes: 0,
          status: 'failed' as const,
        },
      ]
      exec.total = 1
      exec.failedCount = 1
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
      this.saveToHistory(exec)
      return
    }

    if (signal.aborted) return

    interface GlItem {
      relPath: string
      name: string
      absPath: string
      defaultBranch: string
      sshUrl: string
      httpUrl: string
      action: 'pull' | 'clone' | 'skip'
    }

    const items: GlItem[] = projects.map((p) => {
      const relPath = groupRelativePath(p.pathWithNamespace, group)
      const name = path.basename(relPath)
      const mirrorPath = path.join(config.rootFolder, relPath)
      // Prefer an existing local checkout (anywhere) over the mirrored path.
      const existing =
        localByName.get(name) ??
        (existsSync(path.join(mirrorPath, '.git')) ? { absolutePath: mirrorPath } : undefined)

      let action: GlItem['action']
      let absPath: string
      if (ignore.has(name)) {
        action = 'skip'
        absPath = existing?.absolutePath ?? mirrorPath
      } else if (existing) {
        action = 'pull' // keep existing location
        absPath = existing.absolutePath
      } else {
        action = 'clone' // new repo → mirror the GitLab structure
        absPath = mirrorPath
      }
      return { relPath, name, absPath, defaultBranch: p.defaultBranch, sshUrl: p.sshUrl, httpUrl: p.httpUrl, action }
    })

    exec.results = items.map((item) => {
      if (item.action === 'skip') {
        exec.skippedCount++
        return { repoId: item.relPath, success: true, message: 'Ignored', changes: 0, status: 'skipped' as const }
      }
      return { repoId: item.relPath, success: false, message: '', changes: 0, status: 'pending' as const }
    })
    exec.total = items.length

    const actionItems = items.filter((i) => i.action !== 'skip')
    const queue = new TaskQueue(this.defaultConcurrency)

    await queue.run(actionItems, async (item) => {
      if (signal.aborted) return
      const result = exec.results.find((r) => r.repoId === item.relPath)
      if (!result) return
      result.status = 'running'

      try {
        if (item.action === 'pull') {
          const r = await this.pullWithFallback(item.absPath, item.defaultBranch)
          result.success = r.success
          result.message = r.message
          result.changes = r.changes
          result.status = r.success ? 'completed' : 'failed'
          if (r.success) {
            exec.completedCount++
            if (r.changes > 0) exec.withChanges++
          } else {
            exec.failedCount++
          }
        } else {
          const r = await this.cloneGitLab(item.sshUrl, item.httpUrl, item.absPath, protocol, token)
          result.success = r.success
          result.message = r.message
          result.status = r.success ? 'cloned' : 'failed'
          if (r.success) exec.clonedCount++
          else exec.failedCount++
        }
      } catch (err) {
        if (signal.aborted) return
        result.status = 'failed'
        result.success = false
        result.message = `Failed (${item.name}): ${err instanceof Error ? err.message : String(err)}`
        exec.failedCount++
      }
    })

    if (exec.status === 'running') {
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
    }
    this.saveToHistory(exec)
  }

  /** Clone a GitLab project; git creates the nested parent dirs to mirror the structure. */
  private async cloneGitLab(
    sshUrl: string,
    httpUrl: string,
    targetPath: string,
    protocol: 'ssh' | 'https',
    token?: string
  ): Promise<{ success: boolean; message: string }> {
    if (existsSync(path.join(targetPath, '.git'))) {
      return { success: true, message: 'Already exists locally' }
    }

    let url = protocol === 'https' ? httpUrl : sshUrl
    if (protocol === 'https' && token && httpUrl.startsWith('https://')) {
      url = httpUrl.replace('https://', `https://oauth2:${token}@`)
    }
    const env = this.gitAuthService.getGitEnv()

    const { promise } = spawnProcess(['git', 'clone', url, targetPath, '--quiet'], { env })
    const result = await promise

    if (result.exitCode !== 0) {
      const stderr = result.stderr.replace(/oauth2:[^@]+@/, 'oauth2:***@')
      return { success: false, message: `Clone failed (${protocol}): ${stderr.trim()}` }
    }

    // Don't persist a tokenized remote
    if (protocol === 'https' && token) {
      try {
        await simpleGit(targetPath).remote(['set-url', 'origin', httpUrl])
      } catch {
        // non-critical
      }
    }
    return { success: true, message: `Cloned (${protocol})` }
  }

  // ── Fallback: pull only local repos (old behavior) ──

  private async executeLocalOnly(
    executionId: string,
    repos: Repo[],
    defaultBranch: string,
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    const queue = new TaskQueue(this.defaultConcurrency)

    await queue.run(repos, async (repo) => {
      if (signal.aborted) return

      const resultIndex = exec.results.findIndex((r) => r.repoId === repo.path)
      if (resultIndex === -1) return

      const result = exec.results[resultIndex]!
      result.status = 'running'

      try {
        const pullResult = await this.pullWithFallback(repo.absolutePath, defaultBranch)
        result.success = pullResult.success
        result.message = pullResult.message
        result.changes = pullResult.changes
        result.status = pullResult.success ? 'completed' : 'failed'

        if (pullResult.success) {
          exec.completedCount++
          if (pullResult.changes > 0) {
            exec.withChanges++
          }
        } else {
          exec.failedCount++
        }
      } catch (err) {
        if (signal.aborted) return
        result.status = 'failed'
        result.success = false
        result.message = `Pull failed (${repo.path}): ${err instanceof Error ? err.message : String(err)}`
        exec.failedCount++
      }
    })

    if (exec.status === 'running') {
      exec.status = 'completed'
      exec.completedAt = new Date().toISOString()
    }

    this.saveToHistory(exec)
  }

  // ── Helper methods ──

  /**
   * Fetch all non-archived repo names from a GitHub organization via `gh` CLI.
   */
  private async fetchGithubRepos(org: string): Promise<string[]> {
    const { promise } = spawnProcess([
      'gh', 'repo', 'list', org, '--limit', '200', '--no-archived', '--json', 'name', '--jq', '.[].name',
    ])
    const result = await promise

    if (result.exitCode !== 0) {
      throw new Error(`gh repo list failed (exit ${result.exitCode}): ${result.stderr}`)
    }

    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort()
  }

  /**
   * Clone a repo from GitHub into the target path.
   * Supports both SSH and HTTPS protocols based on gitProtocol config.
   * For HTTPS, uses authenticated URL from GitAuthService.
   */
  private async cloneRepo(
    org: string,
    name: string,
    targetPath: string,
    protocol: 'ssh' | 'https' = 'ssh'
  ): Promise<{ success: boolean; message: string }> {
    // If target already exists with .git, treat as already cloned
    if (existsSync(path.join(targetPath, '.git'))) {
      return { success: true, message: 'Already exists locally' }
    }

    const url =
      protocol === 'https'
        ? await this.gitAuthService.buildAuthUrl(org, name)
        : `git@github.com:${org}/${name}.git`

    const env = this.gitAuthService.getGitEnv()

    const { promise } = spawnProcess(
      ['git', 'clone', url, targetPath, '--quiet'],
      { env }
    )
    const result = await promise

    if (result.exitCode !== 0) {
      // Sanitize error message — never expose tokens
      const stderr = result.stderr.replace(/x-access-token:[^@]+@/, 'x-access-token:***@')
      return { success: false, message: `Clone failed (${protocol}): ${stderr.trim()}` }
    }

    // Replace authenticated remote URL with plain URL (don't persist tokens in .git/config)
    if (protocol === 'https') {
      const plainUrl = `https://github.com/${org}/${name}.git`
      try {
        const git = simpleGit(targetPath)
        await git.remote(['set-url', 'origin', plainUrl])
      } catch {
        // Non-critical — clone succeeded
      }
    }

    return { success: true, message: `Cloned successfully (${protocol})` }
  }

  /**
   * Pull a repo. If it fails with "no tracking information", retry with
   * explicit origin + defaultBranch.
   */
  private async pullWithFallback(
    repoPath: string,
    defaultBranch: string
  ): Promise<{ success: boolean; message: string; changes: number }> {
    const env = this.gitAuthService.getGitEnv()
    const git = simpleGit(repoPath).env(env)

    try {
      const result = await git.pull()
      return {
        success: true,
        message: result.summary.changes
          ? `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`
          : 'Already up to date',
        changes: result.summary.changes,
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)

      // Fallback: try explicit origin + defaultBranch
      if (errMsg.includes('no tracking information') || errMsg.includes('There is no tracking')) {
        try {
          const result = await git.pull('origin', defaultBranch)
          return {
            success: true,
            message: result.summary.changes
              ? `${result.summary.changes} changes (via origin/${defaultBranch})`
              : `Already up to date (via origin/${defaultBranch})`,
            changes: result.summary.changes,
          }
        } catch (retryErr) {
          return {
            success: false,
            message: `Pull failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
            changes: 0,
          }
        }
      }

      return {
        success: false,
        message: `Pull failed: ${errMsg}`,
        changes: 0,
      }
    }
  }

  private saveToHistory(exec: PullAllExecution): void {
    this.configService
      .savePullAllHistory({
        id: exec.id,
        status: exec.status === 'aborted' ? 'aborted' : 'completed',
        total: exec.total,
        completedCount: exec.completedCount,
        failedCount: exec.failedCount,
        withChanges: exec.withChanges,
        clonedCount: exec.clonedCount,
        skippedCount: exec.skippedCount,
        unmappedCount: exec.unmappedCount,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
        results: exec.results,
      })
      .catch((err) => {
        console.error('[PullAll] Failed to save history:', err)
      })
  }
}
