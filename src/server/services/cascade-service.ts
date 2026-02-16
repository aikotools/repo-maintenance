/**
 * Service for cascade updates - propagates changes through all transitive dependents
 * in topological order. Supports parallel execution within layers, CI monitoring,
 * and pause/abort controls.
 */

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import type {
  CascadeDepUpdate,
  CascadeExecution,
  CascadeHistoryEntry,
  CascadeLayer,
  CascadePlan,
  CascadeStep,
  Repo,
} from '../../shared/types'
import type { ConfigService } from './config-service'
import type { DependencyResolver } from './dependency-resolver'
import { spawnProcess } from './process'
import { TaskQueue } from './task-queue'

interface CascadePlanOptions {
  waitForCi: boolean
  runTests: boolean
  commitPrefix: string
  parallelLimit?: number
}

export class CascadeService {
  private executions = new Map<string, CascadeExecution>()
  private executionRepos = new Map<string, Repo[]>()
  private abortSignals = new Map<string, boolean>()
  private pauseSignals = new Map<string, boolean>()

  constructor(
    private configService: ConfigService,
    private parallelLimit: number
  ) {}

  /**
   * Build a cascade plan from a source repo through all affected repos.
   * Resolves the source repo's published version from npm (single call).
   * For transitive deps, keeps the current version spec (fast, no network).
   */
  async createPlan(
    sourceRepoId: string,
    repos: Repo[],
    resolver: DependencyResolver,
    options?: CascadePlanOptions
  ): Promise<CascadePlan> {
    const affected = resolver.getAffected(sourceRepoId)
    const repoMap = new Map(repos.map((r) => [r.id, r]))
    const sourceRepo = repoMap.get(sourceRepoId)

    // Resolve the source repo's latest published version (single npm call)
    const sourcePublishedVersion = sourceRepo
      ? await this.resolvePublishedVersion(sourceRepo.npmPackage)
      : null
    const sourceVersion = sourcePublishedVersion || sourceRepo?.version || '0.0.0'
    console.log(
      `[Cascade] Source ${sourceRepoId}: local=${sourceRepo?.version}, published=${sourcePublishedVersion}`
    )

    // Group affected repos by layer
    const layerMap = new Map<number, string[]>()
    for (const a of affected.affected) {
      const existing = layerMap.get(a.layer) || []
      existing.push(a.id)
      layerMap.set(a.layer, existing)
    }

    const layers: CascadeLayer[] = []
    const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b)

    // Track resolved versions: only the source repo's published version is known
    // Other repos' versions will be resolved at execution time (after CI publishes them)
    const resolvedVersions = new Map<string, string>()
    if (sourceRepo) {
      resolvedVersions.set(sourceRepo.npmPackage, sourceVersion)
    }

    for (const layerIndex of sortedLayers) {
      const repoIds = layerMap.get(layerIndex) || []
      const steps: CascadeStep[] = repoIds.map((repoId) => {
        const repo = repoMap.get(repoId)
        const depsToUpdate: CascadeDepUpdate[] = []

        if (repo) {
          for (const dep of repo.dependencies) {
            const resolvedVersion = resolvedVersions.get(dep.npmName)
            if (resolvedVersion) {
              depsToUpdate.push({
                npmName: dep.npmName,
                fromVersion: dep.versionSpec,
                toVersion: resolvedVersion,
              })
            }
          }
        }

        const depNames = depsToUpdate.map((d) => d.npmName.split('/').pop()).join(', ')
        const prefix = options?.commitPrefix ?? 'deps: '
        const commitMessage = `${prefix}update ${depNames || repoId}`

        return {
          repoId,
          status: 'pending' as const,
          commitMessage,
          depsToUpdate,
        }
      })

      // For next layers: use the current version spec of repos in this layer
      // (they haven't been republished yet, so we keep their existing version)
      for (const step of steps) {
        const repo = repoMap.get(step.repoId)
        if (repo) {
          resolvedVersions.set(repo.npmPackage, repo.version)
        }
      }

      layers.push({
        layerIndex,
        mode: steps.length > 1 ? 'parallel' : 'sequential',
        steps,
      })
    }

    return {
      sourceRepoId,
      sourceCommitMessage: `Source: ${sourceRepoId} v${sourceVersion}`,
      layers,
      totalRepos: affected.totalCount,
      waitForCi: options?.waitForCi ?? false,
      runTests: options?.runTests ?? false,
      commitPrefix: options?.commitPrefix ?? 'deps: ',
    }
  }

  /**
   * Start executing a cascade plan. Returns execution ID.
   * The execution runs asynchronously in the background.
   */
  startExecution(plan: CascadePlan, repos: Repo[]): string {
    const id = `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const execution: CascadeExecution = {
      id,
      plan,
      status: 'running',
      currentLayerIndex: 0,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      startedAt: new Date().toISOString(),
    }

    this.executions.set(id, execution)
    this.executionRepos.set(id, repos)
    this.abortSignals.set(id, false)
    this.pauseSignals.set(id, false)

    // Start async execution loop (fire and forget)
    this.executeLoop(id).catch((err) => {
      console.error(`[Cascade] Execution ${id} failed:`, err)
      const exec = this.executions.get(id)
      if (exec) {
        exec.status = 'failed'
        exec.error = err instanceof Error ? err.message : String(err)
        exec.completedAt = new Date().toISOString()
      }
    })

    return id
  }

  getExecution(id: string): CascadeExecution | undefined {
    return this.executions.get(id)
  }

  listExecutions(): CascadeExecution[] {
    return Array.from(this.executions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }

  abort(id: string): boolean {
    const exec = this.executions.get(id)
    if (!exec || (exec.status !== 'running' && exec.status !== 'paused')) return false
    this.abortSignals.set(id, true)
    if (exec.status === 'paused') {
      exec.status = 'aborted'
      exec.completedAt = new Date().toISOString()
      this.saveToHistory(exec).catch((err) => {
        console.error('[Cascade] Failed to save history on abort:', err)
      })
    }
    return true
  }

  pause(id: string): boolean {
    const exec = this.executions.get(id)
    if (!exec || exec.status !== 'running') return false
    this.pauseSignals.set(id, true)
    return true
  }

  resume(id: string): boolean {
    const exec = this.executions.get(id)
    if (!exec || exec.status !== 'paused') return false
    this.pauseSignals.set(id, false)
    exec.status = 'running'
    // Re-enter the execution loop with stored repos
    this.executeLoop(id).catch((err) => {
      console.error(`[Cascade] Resume failed for ${id}:`, err)
    })
    return true
  }

  skipStep(executionId: string, repoId: string): boolean {
    const exec = this.executions.get(executionId)
    if (!exec) return false

    for (const layer of exec.plan.layers) {
      const step = layer.steps.find((s) => s.repoId === repoId)
      if (step && step.status === 'failed') {
        step.status = 'skipped'
        step.completedAt = new Date().toISOString()
        exec.skippedCount++
        exec.failedCount--
        return true
      }
    }
    return false
  }

  setPublishedVersion(executionId: string, repoId: string, version: string): boolean {
    const exec = this.executions.get(executionId)
    if (!exec) return false

    for (const layer of exec.plan.layers) {
      const step = layer.steps.find((s) => s.repoId === repoId)
      if (step) {
        step.publishedVersion = version
        return true
      }
    }
    return false
  }

  // ── Private execution logic ──

  private async executeLoop(id: string): Promise<void> {
    const exec = this.executions.get(id)
    if (!exec) return

    const repos = this.executionRepos.get(id) || []
    const repoMap = new Map(repos.map((r) => [r.id, r]))

    for (let i = exec.currentLayerIndex; i < exec.plan.layers.length; i++) {
      // Check abort
      if (this.abortSignals.get(id)) {
        exec.status = 'aborted'
        exec.completedAt = new Date().toISOString()
        await this.saveToHistory(exec)
        return
      }

      // Check pause
      if (this.pauseSignals.get(id)) {
        exec.status = 'paused'
        exec.currentLayerIndex = i
        return
      }

      exec.currentLayerIndex = i
      const layer = exec.plan.layers[i]!

      // Skip layers where all steps are already done/skipped
      const pendingSteps = layer.steps.filter(
        (s) => s.status !== 'done' && s.status !== 'skipped'
      )
      if (pendingSteps.length === 0) continue

      // Execute steps in the layer
      const queue = new TaskQueue(
        layer.mode === 'parallel'
          ? Math.min(this.parallelLimit, pendingSteps.length)
          : 1
      )

      await queue.run(pendingSteps, async (step) => {
        // Check abort before each step
        if (this.abortSignals.get(id)) return

        await this.executeStep(step, repoMap, exec)
      })

      // After layer: check if any failures should stop execution
      const failedSteps = layer.steps.filter((s) => s.status === 'failed')
      if (failedSteps.length > 0) {
        // Don't auto-fail entire cascade; user can skip or abort
        // But pause to let user decide
        exec.status = 'paused'
        exec.currentLayerIndex = i
        console.log(
          `[Cascade] Layer ${i} has ${failedSteps.length} failed steps. Pausing for user action.`
        )
        return
      }

      // Wait for CI if enabled
      if (exec.plan.waitForCi) {
        const ciSteps = layer.steps.filter((s) => s.status === 'done' && !s.publishedVersion)
        for (const step of ciSteps) {
          step.ciStatus = 'pending'
          await this.waitForCi(step, repoMap, id)
        }
      }
    }

    // All layers complete
    exec.status = 'completed'
    exec.completedAt = new Date().toISOString()
    await this.saveToHistory(exec)
    console.log(`[Cascade] Execution ${id} completed successfully.`)
  }

  private async executeStep(
    step: CascadeStep,
    repoMap: Map<string, Repo>,
    exec: CascadeExecution
  ): Promise<void> {
    const repo = repoMap.get(step.repoId)
    if (!repo) {
      step.status = 'failed'
      step.error = 'Repo not found'
      exec.failedCount++
      return
    }

    step.startedAt = new Date().toISOString()

    try {
      // 1. Update deps in package.json
      step.status = 'updating-deps'
      await this.updatePackageJsonDeps(repo.absolutePath, step.depsToUpdate)

      // 2. Install
      step.status = 'installing'
      await this.runCommand(repo.absolutePath, ['pnpm', 'install', '--no-frozen-lockfile'])

      // 3. Test (optional)
      if (exec.plan.runTests) {
        step.status = 'testing'
        await this.runCommand(repo.absolutePath, ['pnpm', 'test'])
      }

      // 4. Commit (skip if nothing changed)
      step.status = 'committing'
      await this.runCommand(repo.absolutePath, ['git', 'add', '-A'])
      const statusOutput = await this.runCommand(repo.absolutePath, [
        'git',
        'status',
        '--porcelain',
      ])
      if (!statusOutput.trim()) {
        // No changes to commit (version was already up to date)
        step.status = 'done'
        step.completedAt = new Date().toISOString()
        exec.completedCount++
        return
      }
      await this.runCommand(repo.absolutePath, ['git', 'commit', '-m', step.commitMessage])

      // 5. Pull rebase + Push
      step.status = 'pushing'
      try {
        await this.runCommand(repo.absolutePath, ['git', 'pull', '--rebase'])
      } catch {
        // pull may fail if no upstream tracking, ignore
      }
      await this.runCommand(repo.absolutePath, ['git', 'push'])

      // Done
      step.status = 'done'
      step.completedAt = new Date().toISOString()
      exec.completedCount++
    } catch (err) {
      step.status = 'failed'
      step.error = err instanceof Error ? err.message : String(err)
      step.completedAt = new Date().toISOString()
      exec.failedCount++
    }
  }

  private async updatePackageJsonDeps(
    repoPath: string,
    depsToUpdate: CascadeDepUpdate[]
  ): Promise<void> {
    if (depsToUpdate.length === 0) return

    const pkgPath = path.join(repoPath, 'package.json')
    const content = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)

    for (const dep of depsToUpdate) {
      if (pkg.dependencies?.[dep.npmName]) {
        pkg.dependencies[dep.npmName] = dep.toVersion
      }
      if (pkg.devDependencies?.[dep.npmName]) {
        pkg.devDependencies[dep.npmName] = dep.toVersion
      }
      if (pkg.peerDependencies?.[dep.npmName]) {
        pkg.peerDependencies[dep.npmName] = dep.toVersion
      }
    }

    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  }

  private async runCommand(cwd: string, cmd: string[]): Promise<string> {
    const { promise } = spawnProcess(cmd, { cwd })
    const result = await promise

    if (result.exitCode !== 0) {
      throw new Error(`Command failed (${cmd.join(' ')}): ${result.stderr || result.stdout}`)
    }

    return result.stdout
  }

  private async waitForCi(
    step: CascadeStep,
    repoMap: Map<string, Repo>,
    executionId: string
  ): Promise<void> {
    const repo = repoMap.get(step.repoId)
    if (!repo) return

    const slug = await this.getGitHubSlug(repo.absolutePath)
    if (!slug) {
      step.ciStatus = 'skipped'
      return
    }

    // Poll CI status every 15 seconds, max 20 minutes
    const maxAttempts = 80
    step.ciStatus = 'pending'

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check abort
      if (this.abortSignals.get(executionId)) return

      await new Promise((resolve) => setTimeout(resolve, 15_000))

      try {
        const result = await this.checkCiStatus(slug)
        step.ciStatus = result.status
        step.ciRunUrl = result.url

        if (result.status === 'success') {
          // Try to resolve published version
          step.publishedVersion = (await this.resolvePublishedVersion(repo.npmPackage)) || undefined
          return
        }
        if (result.status === 'failure') {
          return
        }
      } catch {
        // gh CLI not available or error
        step.ciStatus = 'skipped'
        return
      }
    }

    // Timeout
    step.ciStatus = 'failure'
    step.error = 'CI monitoring timed out after 20 minutes'
  }

  private async getGitHubSlug(repoPath: string): Promise<string | null> {
    try {
      const result = await this.runCommand(repoPath, [
        'git',
        'remote',
        'get-url',
        'origin',
      ])
      const url = result.trim()
      // Parse: https://github.com/org/repo.git or git@github.com:org/repo.git
      const match =
        url.match(/github\.com[/:](.+?)(?:\.git)?$/) ||
        url.match(/github\.com[/:](.+)$/)
      return match?.[1] || null
    } catch {
      return null
    }
  }

  private async checkCiStatus(
    slug: string
  ): Promise<{ status: 'pending' | 'running' | 'success' | 'failure'; url?: string }> {
    try {
      const output = await this.runCommand('.', [
        'gh',
        'run',
        'list',
        '--repo',
        slug,
        '--limit',
        '1',
        '--json',
        'status,conclusion,url',
      ])

      const runs = JSON.parse(output)
      if (!runs || runs.length === 0) {
        return { status: 'pending' }
      }

      const run = runs[0]
      const url = run.url

      if (run.status === 'completed') {
        return {
          status: run.conclusion === 'success' ? 'success' : 'failure',
          url,
        }
      }
      if (run.status === 'in_progress' || run.status === 'queued') {
        return { status: 'running', url }
      }
      return { status: 'pending', url }
    } catch {
      throw new Error('gh CLI unavailable')
    }
  }

  /**
   * Resolve the latest published version of an npm package from the registry.
   * Returns null if not found or registry unavailable.
   */
  private async resolvePublishedVersion(npmPackage: string): Promise<string | null> {
    try {
      const config = await this.configService.getProjectConfig()
      const registry = config.npmRegistry || 'https://npm.pkg.github.com'
      const output = await this.runCommand('.', [
        'npm',
        'view',
        `${npmPackage}@latest`,
        'version',
        `--registry=${registry}`,
      ])
      const version = output.trim()
      return version || null
    } catch {
      return null
    }
  }

  private async saveToHistory(exec: CascadeExecution): Promise<void> {
    const entry: CascadeHistoryEntry = {
      id: exec.id,
      sourceRepoId: exec.plan.sourceRepoId,
      status: exec.status,
      totalRepos: exec.plan.totalRepos,
      completedCount: exec.completedCount,
      failedCount: exec.failedCount,
      startedAt: exec.startedAt,
      completedAt: exec.completedAt,
      layers: exec.plan.layers,
    }

    try {
      await this.configService.saveHistory(entry)
    } catch (err) {
      console.error('[Cascade] Failed to save history:', err)
    }
  }
}
