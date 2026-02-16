/**
 * Service for git operations using simple-git.
 * Provides status, branch info, and recent commits for repos.
 */

import { appendFile, readFile } from 'fs/promises'
import path from 'path'
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git'
import type {
  ChangedFile,
  DiffHunk,
  DiffLine,
  DiffResult,
  FileDiff,
  GitOperationResult,
  GitStatus,
  PullResult,
  RecentCommit,
} from '../../shared/types'
import { TaskQueue } from './task-queue'

export class GitService {
  private queue: TaskQueue

  constructor(parallelLimit: number) {
    this.queue = new TaskQueue(parallelLimit)
  }

  async getStatus(repoPath: string): Promise<GitStatus> {
    const git: SimpleGit = simpleGit(repoPath)

    try {
      // Verify git root matches expected path (prevents parent repo leaking through)
      const toplevel = (await git.revparse(['--show-toplevel'])).trim()
      if (path.resolve(toplevel) !== path.resolve(repoPath)) {
        return {
          branch: 'no-git',
          hasUncommittedChanges: false,
          changedFiles: [],
          stagedCount: 0,
          modifiedCount: 0,
          untrackedCount: 0,
          aheadCount: 0,
          behindCount: 0,
          recentCommits: [],
        }
      }

      const [status, branch, commits] = await Promise.all([
        git.status(),
        this.getCurrentBranch(repoPath),
        this.getRecentCommits(repoPath, 5),
      ])

      const changedFiles = this.parseStatus(status)

      return {
        branch,
        hasUncommittedChanges: !status.isClean(),
        changedFiles,
        stagedCount: status.staged.length,
        modifiedCount: status.modified.length + status.renamed.length,
        untrackedCount: status.not_added.length,
        aheadCount: status.ahead,
        behindCount: status.behind,
        recentCommits: commits,
      }
    } catch {
      // Not a git repo or git error
      return {
        branch: 'unknown',
        hasUncommittedChanges: false,
        changedFiles: [],
        stagedCount: 0,
        modifiedCount: 0,
        untrackedCount: 0,
        aheadCount: 0,
        behindCount: 0,
        recentCommits: [],
      }
    }
  }

  async getStatusAll(repoPaths: string[]): Promise<Map<string, GitStatus>> {
    const results = await this.queue.run(repoPaths, async (repoPath) => {
      return this.getStatus(repoPath)
    })

    const map = new Map<string, GitStatus>()
    for (const { item, result } of results) {
      if (result) map.set(item, result)
    }
    return map
  }

  async getRecentCommits(repoPath: string, count = 5): Promise<RecentCommit[]> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      const log = await git.log({ maxCount: count })
      return log.all.map((entry) => ({
        hash: entry.hash.substring(0, 7),
        message: entry.message,
        date: entry.date,
        author: entry.author_name,
      }))
    } catch {
      return []
    }
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      const branchSummary = await git.branch()
      return branchSummary.current
    } catch {
      return 'unknown'
    }
  }

  async getDiff(repoPath: string, filePath?: string): Promise<DiffResult> {
    const git: SimpleGit = simpleGit(repoPath)
    const repoId = repoPath.split('/').pop() || ''

    try {
      // Get both staged and unstaged diffs
      const args = filePath ? ['--', filePath] : []
      const [unstagedDiff, stagedDiff] = await Promise.all([
        git.diff(args),
        git.diff(['--cached', ...args]),
      ])

      const unstagedFiles = this.parseDiffOutput(unstagedDiff)
      const stagedFiles = this.parseDiffOutput(stagedDiff)

      // Merge: staged files override unstaged for same path
      const fileMap = new Map<string, FileDiff>()
      for (const f of unstagedFiles) fileMap.set(f.filePath, f)
      for (const f of stagedFiles) fileMap.set(f.filePath, f)

      return { repoId, files: Array.from(fileMap.values()) }
    } catch {
      return { repoId, files: [] }
    }
  }

  async stageFiles(repoPath: string, files: string[]): Promise<GitOperationResult> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      await git.add(files)
      return { success: true, message: `Staged ${files.length} file(s)` }
    } catch (err) {
      return { success: false, message: `Failed to stage files: ${(err as Error).message}` }
    }
  }

  async unstageFiles(repoPath: string, files: string[]): Promise<GitOperationResult> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      await git.reset(['HEAD', '--', ...files])
      return { success: true, message: `Unstaged ${files.length} file(s)` }
    } catch (err) {
      return { success: false, message: `Failed to unstage files: ${(err as Error).message}` }
    }
  }

  async stageAll(repoPath: string): Promise<GitOperationResult> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      await git.add(['-A'])
      return { success: true, message: 'Staged all files' }
    } catch (err) {
      return { success: false, message: `Failed to stage all: ${(err as Error).message}` }
    }
  }

  async commit(repoPath: string, message: string): Promise<GitOperationResult> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      const result = await git.commit(message)
      return {
        success: true,
        message: `Committed: ${result.commit || 'done'}`,
        details: result.summary
          ? `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`
          : undefined,
      }
    } catch (err) {
      return { success: false, message: `Commit failed: ${(err as Error).message}` }
    }
  }

  async push(repoPath: string): Promise<GitOperationResult> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      await git.push()
      return { success: true, message: 'Pushed successfully' }
    } catch (err) {
      return { success: false, message: `Push failed: ${(err as Error).message}` }
    }
  }

  async pull(repoPath: string): Promise<PullResult> {
    const git: SimpleGit = simpleGit(repoPath)
    const repoId = repoPath.split('/').pop() || ''
    try {
      const result = await git.pull()
      return {
        repoId,
        success: true,
        message: result.summary.changes
          ? `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`
          : 'Already up to date',
        changes: result.summary.changes,
      }
    } catch (err) {
      return {
        repoId,
        success: false,
        message: `Pull failed: ${(err as Error).message}`,
        changes: 0,
      }
    }
  }

  async pullAll(repoPaths: string[]): Promise<PullResult[]> {
    const results = await this.queue.run(repoPaths, async (repoPath) => {
      return this.pull(repoPath)
    })
    return results.map((r) => r.result!).filter(Boolean)
  }

  async addToGitignore(repoPath: string, filePath: string): Promise<GitOperationResult> {
    try {
      const gitignorePath = path.join(repoPath, '.gitignore')
      // Read existing content to check for trailing newline
      let existing = ''
      try {
        existing = await readFile(gitignorePath, 'utf-8')
      } catch {
        // .gitignore doesn't exist yet — will be created
      }

      const needsNewline = existing.length > 0 && !existing.endsWith('\n')
      const entry = `${needsNewline ? '\n' : ''}${filePath}\n`
      await appendFile(gitignorePath, entry, 'utf-8')

      return { success: true, message: `Added '${filePath}' to .gitignore` }
    } catch (err) {
      return {
        success: false,
        message: `Failed to update .gitignore: ${(err as Error).message}`,
      }
    }
  }

  private parseDiffOutput(diffText: string): FileDiff[] {
    if (!diffText.trim()) return []

    const files: FileDiff[] = []
    // Split by "diff --git" markers
    const fileSections = diffText.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      const lines = section.split('\n')
      // Extract file path from first line: "a/path b/path"
      const firstLine = lines[0] || ''
      const match = firstLine.match(/a\/(.+?)\s+b\/(.+)/)
      const filePath = match?.[2] ?? firstLine

      // Check for binary
      if (section.includes('Binary files')) {
        files.push({ filePath, status: 'M', hunks: [], binary: true })
        continue
      }

      // Detect status from diff
      let status: 'M' | 'A' | 'D' = 'M'
      if (section.includes('new file mode')) status = 'A'
      if (section.includes('deleted file mode')) status = 'D'

      const hunks: DiffHunk[] = []
      let currentHunk: DiffHunk | null = null
      let oldLine = 0
      let newLine = 0

      for (const line of lines) {
        if (line.startsWith('@@')) {
          // Hunk header: @@ -old,count +new,count @@
          const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
          if (hunkMatch) {
            oldLine = parseInt(hunkMatch[1]!)
            newLine = parseInt(hunkMatch[2]!)
            currentHunk = { header: line, lines: [] }
            hunks.push(currentHunk)
          }
          continue
        }

        if (!currentHunk) continue

        if (line.startsWith('+')) {
          const dl: DiffLine = { type: 'add', content: line.substring(1), newLineNum: newLine++ }
          currentHunk.lines.push(dl)
        } else if (line.startsWith('-')) {
          const dl: DiffLine = { type: 'remove', content: line.substring(1), oldLineNum: oldLine++ }
          currentHunk.lines.push(dl)
        } else if (line.startsWith(' ') || line === '') {
          const dl: DiffLine = {
            type: 'context',
            content: line.substring(1),
            oldLineNum: oldLine++,
            newLineNum: newLine++,
          }
          currentHunk.lines.push(dl)
        }
      }

      files.push({ filePath, status, hunks, binary: false })
    }

    return files
  }

  private parseStatus(status: StatusResult): ChangedFile[] {
    const files: ChangedFile[] = []

    for (const file of status.staged) {
      files.push({ path: file, status: 'M', staged: true })
    }
    for (const file of status.modified) {
      if (!status.staged.includes(file)) {
        files.push({ path: file, status: 'M', staged: false })
      }
    }
    for (const file of status.not_added) {
      files.push({ path: file, status: '?', staged: false })
    }
    for (const file of status.deleted) {
      files.push({ path: file, status: 'D', staged: false })
    }
    for (const file of status.created) {
      files.push({ path: file, status: 'A', staged: true })
    }
    for (const { to } of status.renamed) {
      files.push({ path: to, status: 'R', staged: true })
    }

    return files
  }
}
