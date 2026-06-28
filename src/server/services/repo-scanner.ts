/**
 * Service for scanning the repo/ directory and extracting package info.
 * Builds the complete list of repos with their metadata, domains, and internal dependencies.
 */

import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'
import type { Domain, InternalDep, Repo, RepoType, WorkspaceEntry } from '../../shared/types'

/** workspace.repos data passed to scan() to surface not-yet-cloned repos */
export interface WorkspaceMerge {
  entries: WorkspaceEntry[]
  /** Directory the entry paths are relative to (where workspace.repos lives) */
  workspaceDir: string
}

/** Known sub-group directories within domains */
const KNOWN_SUB_GROUPS = new Set([
  'outbound',
  'inbound',
  'validators',
  'gov-api',
  'tax',
  'export',
])

/** Directories to skip during scanning */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.repoMaintenance'])

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export class RepoScanner {
  constructor(
    private rootFolder: string,
    private npmOrgs: string[]
  ) {}

  async scan(
    domainOverrides?: Record<string, string>,
    workspace?: WorkspaceMerge
  ): Promise<{ repos: Repo[]; domains: Domain[] }> {
    const repoDir = this.rootFolder
    const repos: Repo[] = []

    // Scan all domain directories under repo/
    const domainDirs = await this.listDirs(repoDir)

    for (const domainName of domainDirs) {
      const domainPath = path.join(repoDir, domainName)
      await this.scanDomain(domainPath, domainName, repos)
    }

    // Apply domain overrides (repoId → domain)
    if (domainOverrides) {
      for (const repo of repos) {
        const override = domainOverrides[repo.id]
        if (override) {
          repo.domain = override
        }
      }
    }

    // Merge workspace.repos: attach url/branch to on-disk repos, add missing ones
    if (workspace) {
      this.mergeWorkspace(repos, workspace)
    }

    // Build npm name -> repo ID lookup
    const npmToRepo = new Map<string, string>()
    for (const repo of repos) {
      npmToRepo.set(repo.npmPackage, repo.id)
    }

    // Resolve dependency repo IDs
    for (const repo of repos) {
      for (const dep of repo.dependencies) {
        const repoId = npmToRepo.get(dep.npmName)
        if (repoId) {
          dep.repoId = repoId
        }
      }
      // Filter out deps that don't map to a known repo
      repo.dependencies = repo.dependencies.filter((d) => d.repoId)
    }

    // Compute dependents (reverse lookup)
    for (const repo of repos) {
      for (const dep of repo.dependencies) {
        const depRepo = repos.find((r) => r.id === dep.repoId)
        if (depRepo && !depRepo.dependents.includes(repo.id)) {
          depRepo.dependents.push(repo.id)
        }
      }
    }

    // Build domain structure
    const domains = this.buildDomains(repos)

    return { repos, domains }
  }

  /**
   * Reconcile scanned repos with the workspace.repos manifest:
   * attach url/branch to repos already on disk, and append `missing` placeholders
   * for entries that aren't cloned yet so they show up (and can be cloned).
   */
  private mergeWorkspace(repos: Repo[], workspace: WorkspaceMerge): void {
    const byAbs = new Map(repos.map((r) => [r.absolutePath, r]))

    for (const entry of workspace.entries) {
      const absolutePath = path.join(workspace.workspaceDir, entry.path)
      const existing = byAbs.get(absolutePath)
      if (existing) {
        existing.url = entry.url
        existing.branch = entry.branch
        continue
      }

      const relativePath = path.relative(this.rootFolder, absolutePath)
      const parts = relativePath.split(path.sep)
      const dirName = path.basename(absolutePath)
      const subGroup = parts.length > 2 && KNOWN_SUB_GROUPS.has(parts[1]!) ? parts[1] : undefined

      repos.push({
        id: dirName,
        path: relativePath,
        absolutePath,
        domain: parts[0] ?? dirName,
        subGroup,
        type: this.detectRepoType(dirName, dirName),
        npmPackage: '',
        version: '—',
        dependencies: [],
        dependents: [],
        missing: true,
        url: entry.url,
        branch: entry.branch,
      })
    }
  }

  private async scanDomain(domainPath: string, domainName: string, repos: Repo[]): Promise<void> {
    // Check if the domain directory itself is a repo (flat structure: rootFolder/repo/)
    const directRepo = await this.tryParseRepo(domainPath, domainName)
    if (directRepo) {
      repos.push(directRepo)
      return
    }

    const entries = await this.listDirs(domainPath)

    for (const entry of entries) {
      const entryPath = path.join(domainPath, entry)

      if (KNOWN_SUB_GROUPS.has(entry)) {
        // This is a sub-group (e.g. invoice/outbound/) - scan its children
        const subEntries = await this.listDirs(entryPath)
        for (const subEntry of subEntries) {
          const subPath = path.join(entryPath, subEntry)
          const repo = await this.tryParseRepo(subPath, domainName, entry)
          if (repo) repos.push(repo)
        }
      } else if (domainName === 'apps') {
        // apps/ has nested structure: apps/invoice/saas-invoice-backend
        const appEntries = await this.listDirs(entryPath)
        for (const appEntry of appEntries) {
          const appPath = path.join(entryPath, appEntry)
          const repo = await this.tryParseRepo(appPath, domainName, entry)
          if (repo) repos.push(repo)
        }
        // Also check if the entry itself is a repo (e.g. apps/invoice.xhub-customer-saas)
        const directRepo = await this.tryParseRepo(entryPath, domainName)
        if (directRepo) repos.push(directRepo)
      } else {
        // Direct repo directory
        const repo = await this.tryParseRepo(entryPath, domainName)
        if (repo) repos.push(repo)
      }
    }
  }

  private async tryParseRepo(
    repoPath: string,
    domain: string,
    subGroup?: string
  ): Promise<Repo | null> {
    const pkgPath = path.join(repoPath, 'package.json')
    try {
      const content = await readFile(pkgPath, 'utf-8')
      const pkg: PackageJson = JSON.parse(content)

      if (!pkg.name) return null

      const relativePath = path.relative(this.rootFolder, repoPath)
      const dirName = path.basename(repoPath)

      // Extract internal dependencies
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.peerDependencies,
        ...pkg.devDependencies,
      }
      const internalDeps = this.filterInternalDeps(allDeps)

      return {
        id: dirName,
        path: relativePath,
        absolutePath: repoPath,
        domain,
        subGroup,
        type: this.detectRepoType(pkg.name, dirName),
        npmPackage: pkg.name,
        version: pkg.version || '0.0.0',
        dependencies: internalDeps,
        dependents: [],
      }
    } catch {
      return null
    }
  }

  detectRepoType(npmName: string, dirName: string): RepoType {
    const name = npmName.replace(/^@[^/]+\//, '')

    if (name === 'kernel') return 'kernel'
    if (name === 'frontend-kernel') return 'frontend-kernel'
    if (name.startsWith('kernel-plugin-')) return 'kernel-plugin'
    if (name.startsWith('frontend-plugin-')) return 'frontend-plugin'
    if (name.startsWith('frontend-ui-') || name === 'frontend-ui-components') return 'frontend-ui'
    if (name.startsWith('frontend-app-')) return 'frontend-ui'
    if (name.startsWith('lib-')) return 'lib'
    if (name.startsWith('saas-')) return 'app'
    if (name.startsWith('tool-')) return 'tool'
    if (name.startsWith('mock-')) return 'mock'
    if (dirName.includes('xhub-')) return 'integration'
    return 'lib'
  }

  private filterInternalDeps(deps: Record<string, string> | undefined): InternalDep[] {
    if (!deps) return []
    const result: InternalDep[] = []

    for (const [name, version] of Object.entries(deps)) {
      const isInternal = this.npmOrgs.some((org) => name.startsWith(`${org}/`))
      if (isInternal) {
        result.push({
          npmName: name,
          repoId: '',
          versionSpec: version,
        })
      }
    }

    return result
  }

  private buildDomains(repos: Repo[]): Domain[] {
    const domainMap = new Map<string, Domain>()

    for (const repo of repos) {
      if (!domainMap.has(repo.domain)) {
        domainMap.set(repo.domain, {
          id: repo.domain,
          path: `${repo.domain}/`,
          repoCount: 0,
          hasUncommitted: false,
          subGroups: [],
        })
      }

      const domain = domainMap.get(repo.domain)!
      domain.repoCount++

      if (repo.subGroup) {
        let subGroup = domain.subGroups.find((sg) => sg.id === repo.subGroup)
        if (!subGroup) {
          subGroup = {
            id: repo.subGroup,
            path: `${repo.domain}/${repo.subGroup}/`,
            repoIds: [],
          }
          domain.subGroups.push(subGroup)
        }
        subGroup.repoIds.push(repo.id)
      }
    }

    return Array.from(domainMap.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  private async listDirs(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath)
      const dirs: string[] = []
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
        const entryPath = path.join(dirPath, entry)
        const s = await stat(entryPath)
        if (s.isDirectory()) {
          dirs.push(entry)
        }
      }
      return dirs.sort()
    } catch {
      return []
    }
  }
}
