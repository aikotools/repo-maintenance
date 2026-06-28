/**
 * Parse and serialize a vcstool `workspace.repos` manifest — the single source of
 * truth for where each repo lives (path), its git URL and its branch.
 *
 * Format (regular YAML subset emitted by gen-workspace-repos.sh):
 *   repositories:
 *     repo/backend/core-backend:
 *       type: git
 *       url: git@github.com:org/core-backend.git
 *       version: main
 *     # repo/integrations/foo — SKIPPED: kein origin-Remote gesetzt
 *
 * ponytail: hand-rolled line parser instead of a YAML dependency — the format is
 * fixed and regular; add a YAML lib only if manifests start using real YAML features.
 */

import path from 'path'
import type { WorkspaceEntry } from '../../shared/types'

export interface ParsedWorkspace {
  entries: WorkspaceEntry[]
  /** Repo names that are commented out / marked SKIPPED — used as the ignore list */
  skipped: string[]
}

export function parseWorkspaceRepos(content: string): ParsedWorkspace {
  const entries: WorkspaceEntry[] = []
  const skipped: string[] = []
  let cur: { path: string; url?: string; branch?: string } | null = null

  const flush = () => {
    if (cur && cur.url) {
      entries.push({ path: cur.path, url: cur.url, branch: cur.branch || 'main' })
    }
    cur = null
  }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ')

    // "# <path> — SKIPPED: ..." marker → ignore by repo name
    if (/SKIPPED/.test(line)) {
      const m = line.match(/^\s*#\s*(\S+)/)
      if (m) skipped.push(path.basename(m[1]!))
      continue
    }
    if (/^\s*#/.test(line) || !line.trim()) continue

    // Path header: exactly 2-space indent, a non-space at col 2, ends with ":".
    // (Nested keys type/url/version are 4-space indented and don't match.)
    const header = line.match(/^ {2}(\S[^:]*):\s*$/)
    if (header) {
      flush()
      cur = { path: header[1]! }
      continue
    }

    if (!cur) continue
    const url = line.match(/^\s+url:\s*(.+?)\s*$/)
    if (url) {
      cur.url = url[1]!
      continue
    }
    const version = line.match(/^\s+version:\s*(.+?)\s*$/)
    if (version) cur.branch = version[1]!
  }
  flush()

  return { entries, skipped }
}

const HEADER = `# workspace.repos — vcstool-Manifest für den Workspace.
# Eine Stelle definiert, wo jedes Repo relativ zum Workspace-Root liegt.
# Generiert/gepflegt von RepoHub.`

export function serializeWorkspaceRepos(entries: WorkspaceEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))
  const body = sorted
    .map(
      (e) =>
        `  ${e.path}:\n    type: git\n    url: ${e.url}\n    version: ${e.branch || 'main'}`
    )
    .join('\n')
  return `${HEADER}\nrepositories:\n${body}\n`
}

/**
 * Longest common leading directory across all entry paths (excluding the repo
 * name itself). For `repo/backend/x` + `repo/frontend/y` → "repo". This is the
 * offset between the workspace root (where workspace.repos lives) and the scan
 * rootFolder, so domains line up with the on-disk layout.
 */
export function commonPrefixDir(paths: string[]): string {
  if (paths.length === 0) return ''
  const segs = paths.map((p) => p.split('/').slice(0, -1))
  let prefix = segs[0]!
  for (const s of segs) {
    let i = 0
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++
    prefix = prefix.slice(0, i)
  }
  return prefix.join('/')
}

/** Extract the GitHub org from a git URL (ssh or https). Null if not GitHub. */
export function githubOrgFromUrl(url: string): string | null {
  const m = url.match(/github\.com[:/]([^/]+)\//)
  return m ? m[1]! : null
}
