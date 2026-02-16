/**
 * Service for scanning the repo/ directory and extracting package info.
 * Builds the complete list of repos with their metadata, domains, and internal dependencies.
 */

import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'
import type { Domain, InternalDep, Repo, RepoType } from '../../shared/types'

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

  async scan(domainOverrides?: Record<string, string>): Promise<{ repos: Repo[]; domains: Domain[] }> {
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

  private async scanDomain(domainPath: string, domainName: string, repos: Repo[]): Promise<void> {
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
