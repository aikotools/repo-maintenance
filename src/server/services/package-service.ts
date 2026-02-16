/**
 * Service for scanning and replacing file: URL dependencies in package.json files.
 * Supports bidirectional conversion: file: → npm versions and npm → file: URLs.
 */

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { FileUrlDep, FileUrlScanResult, Repo } from '../../shared/types'

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  [key: string]: unknown
}

export class PackageService {
  constructor(
    private rootFolder: string,
    private npmOrgs: string[]
  ) {}

  /**
   * Scan all repos for file: URL dependencies.
   */
  async scanFileUrls(repos: Repo[]): Promise<FileUrlScanResult> {
    const allDeps: FileUrlDep[] = []
    const affectedRepoIds = new Set<string>()

    for (const repo of repos) {
      const pkgPath = path.join(repo.absolutePath, 'package.json')
      try {
        const content = await readFile(pkgPath, 'utf-8')
        const pkg: PackageJson = JSON.parse(content)

        const depSections: Record<string, string>[] = [
          pkg.dependencies ?? {},
          pkg.devDependencies ?? {},
          pkg.peerDependencies ?? {},
        ]

        for (const deps of depSections) {
          for (const [name, value] of Object.entries(deps)) {
            if (value.startsWith('file:')) {
              const isInternal = this.npmOrgs.some((org) => name.startsWith(`${org}/`))
              allDeps.push({
                repoId: repo.id,
                repoPath: repo.path,
                depName: name,
                currentValue: value,
                targetRepoPath: isInternal ? this.resolveFileTarget(repo.absolutePath, value) : undefined,
              })
              affectedRepoIds.add(repo.id)
            }
          }
        }
      } catch {
        // Skip repos without valid package.json
      }
    }

    return {
      repos: allDeps,
      totalRepos: repos.length,
      affectedRepos: affectedRepoIds.size,
    }
  }

  /**
   * Replace file: URLs with a fixed npm version (default "1.0.0") for selected repos.
   */
  async replaceFileUrls(
    repos: Repo[],
    repoIds: string[],
    targetVersion = '1.0.0'
  ): Promise<{ updated: number; errors: string[] }> {
    const targetSet = new Set(repoIds)
    let updated = 0
    const errors: string[] = []

    for (const repo of repos) {
      if (!targetSet.has(repo.id)) continue

      const pkgPath = path.join(repo.absolutePath, 'package.json')
      try {
        const content = await readFile(pkgPath, 'utf-8')
        const pkg: PackageJson = JSON.parse(content)
        let changed = false

        for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
          const deps = pkg[section] as Record<string, string> | undefined
          if (!deps) continue

          for (const [name, value] of Object.entries(deps)) {
            if (value.startsWith('file:')) {
              deps[name] = targetVersion
              changed = true
            }
          }
        }

        if (changed) {
          await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
          updated++
        }
      } catch (err) {
        errors.push(`${repo.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return { updated, errors }
  }

  /**
   * Replace npm versions with file: URLs for internal dependencies (for local dev).
   * Computes relative paths between repos.
   */
  async replaceWithFileUrls(
    repos: Repo[]
  ): Promise<{ updated: number; errors: string[] }> {
    // Build npm name → absolute path map
    const npmToAbsPath = new Map<string, string>()
    for (const repo of repos) {
      npmToAbsPath.set(repo.npmPackage, repo.absolutePath)
    }

    let updated = 0
    const errors: string[] = []

    for (const repo of repos) {
      const pkgPath = path.join(repo.absolutePath, 'package.json')
      try {
        const content = await readFile(pkgPath, 'utf-8')
        const pkg: PackageJson = JSON.parse(content)
        let changed = false

        for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
          const deps = pkg[section] as Record<string, string> | undefined
          if (!deps) continue

          for (const [name, value] of Object.entries(deps)) {
            const isInternal = this.npmOrgs.some((org) => name.startsWith(`${org}/`))
            if (!isInternal) continue

            // Skip if already a file: URL
            if (value.startsWith('file:')) continue

            const targetPath = npmToAbsPath.get(name)
            if (!targetPath) continue

            const relativePath = path.relative(repo.absolutePath, targetPath)
            deps[name] = `file:${relativePath}`
            changed = true
          }
        }

        if (changed) {
          await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
          updated++
        }
      } catch (err) {
        errors.push(`${repo.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return { updated, errors }
  }

  private resolveFileTarget(repoAbsPath: string, fileUrl: string): string | undefined {
    try {
      const relativePath = fileUrl.replace(/^file:/, '')
      const absTarget = path.resolve(repoAbsPath, relativePath)
      const relToRoot = path.relative(this.rootFolder, absTarget)
      return relToRoot
    } catch {
      return undefined
    }
  }
}
