/**
 * Service for bulk command execution across multiple repos.
 * Runs commands in parallel with controlled concurrency, captures output,
 * and parses vitest coverage from stdout.
 */

import type { BulkExecution, Repo } from '../../shared/types'
import { spawnProcess } from './process'
import { TaskQueue } from './task-queue'

export class BulkService {
  private executions = new Map<string, BulkExecution>()
  private abortControllers = new Map<string, AbortController>()

  constructor(private defaultConcurrency: number) {}

  /**
   * Start a bulk command execution across selected repos.
   * Returns execution ID. Runs asynchronously in the background.
   */
  startExecution(
    command: string,
    repos: Repo[],
    options?: { concurrency?: number }
  ): string {
    const id = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const concurrency = options?.concurrency ?? this.defaultConcurrency

    const execution: BulkExecution = {
      id,
      command,
      repoIds: repos.map((r) => r.id),
      status: 'running',
      results: repos.map((r) => ({
        repoId: r.id,
        status: 'pending',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        duration: 0,
        startedAt: '',
      })),
      completedCount: 0,
      failedCount: 0,
      startedAt: new Date().toISOString(),
      concurrency,
    }

    this.executions.set(id, execution)
    const controller = new AbortController()
    this.abortControllers.set(id, controller)

    this.executeAll(id, command, repos, concurrency, controller.signal).catch((err) => {
      console.error(`[Bulk] Execution ${id} failed:`, err)
      const exec = this.executions.get(id)
      if (exec && exec.status === 'running') {
        exec.status = 'failed'
        exec.completedAt = new Date().toISOString()
      }
    })

    return id
  }

  getExecution(id: string): BulkExecution | undefined {
    return this.executions.get(id)
  }

  listExecutions(): BulkExecution[] {
    return Array.from(this.executions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }

  abort(id: string): boolean {
    const exec = this.executions.get(id)
    if (!exec || exec.status !== 'running') return false

    const controller = this.abortControllers.get(id)
    if (controller) controller.abort()

    exec.status = 'aborted'
    exec.completedAt = new Date().toISOString()

    // Mark all pending results as aborted
    for (const result of exec.results) {
      if (result.status === 'pending') {
        result.status = 'aborted'
      }
    }

    return true
  }

  // ── Private execution logic ──

  private async executeAll(
    executionId: string,
    command: string,
    repos: Repo[],
    concurrency: number,
    signal: AbortSignal
  ): Promise<void> {
    const exec = this.executions.get(executionId)
    if (!exec) return

    const queue = new TaskQueue(concurrency)

    await queue.run(repos, async (repo) => {
      if (signal.aborted) return

      const resultIndex = exec.results.findIndex((r) => r.repoId === repo.id)
      if (resultIndex === -1) return

      const result = exec.results[resultIndex]!
      result.status = 'running'
      result.startedAt = new Date().toISOString()

      try {
        const outcome = await this.runCommand(command, repo.absolutePath, signal)
        result.exitCode = outcome.exitCode
        result.stdout = outcome.stdout
        result.stderr = outcome.stderr
        result.success = outcome.exitCode === 0
        result.status = outcome.exitCode === 0 ? 'completed' : 'failed'
        result.duration = outcome.duration
        result.completedAt = new Date().toISOString()

        // Parse vitest coverage if present
        const coverage = this.parseCoverage(outcome.stdout)
        if (coverage !== null) {
          result.coverage = coverage
        }

        if (result.success) {
          exec.completedCount++
        } else {
          exec.failedCount++
        }
      } catch (err) {
        if (signal.aborted) return
        result.status = 'failed'
        result.success = false
        result.exitCode = -1
        result.stderr = err instanceof Error ? err.message : String(err)
        result.completedAt = new Date().toISOString()
        exec.failedCount++
      }
    })

    // Finalize execution
    if (exec.status === 'running') {
      exec.status = exec.failedCount > 0 ? 'completed' : 'completed'
      exec.completedAt = new Date().toISOString()
    }
  }

  private async runCommand(
    command: string,
    cwd: string,
    signal: AbortSignal
  ): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
    const startTime = Date.now()

    // Split command but handle quoted strings
    const args = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [command]
    const cleanArgs = args.map((a) => a.replace(/^["']|["']$/g, ''))

    const { promise } = spawnProcess(cleanArgs, { cwd, signal })
    const result = await promise
    const duration = Date.now() - startTime

    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, duration }
  }

  /**
   * Parse vitest coverage percentage from stdout.
   * Looks for the "All files" line in vitest's coverage table:
   *   All files | 94.23 | 88.12 | 100 | 94.23
   */
  parseCoverage(stdout: string): number | null {
    // Match vitest V8/istanbul coverage table: "All files | XX.XX |"
    const match = stdout.match(/All files\s*\|\s*([\d.]+)\s*\|/)
    if (match?.[1]) {
      const value = parseFloat(match[1])
      if (!isNaN(value) && value >= 0 && value <= 100) {
        return value
      }
    }
    return null
  }
}
