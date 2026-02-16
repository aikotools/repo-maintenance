/**
 * Service for reading/writing ~/.repoMaintenance/ configuration and cache files.
 * Supports multiple projects, each with their own settings, caches and history.
 */

import { existsSync } from 'fs'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import type {
  CascadeHistoryEntry,
  DependencyGraph,
  GlobalConfig,
  ProjectConfig,
  ProjectSummary,
  PullAllHistoryEntry,
  Repo,
} from '../../shared/types'

const DEFAULT_CONFIG: ProjectConfig = {
  name: '',
  rootFolder: '',
  npmOrganizations: [],
  githubOrganizations: [],
  npmRegistry: 'https://npm.pkg.github.com',
  parallelTasks: 6,
  defaultBranch: 'main',
}

const DEFAULT_GLOBAL: GlobalConfig = {
  activeProject: 'default',
  projects: ['default'],
}

export class ConfigService {
  private projectSlug = 'default'

  constructor(
    private configHome: string,
    private legacyLocations: string[] = []
  ) {}

  // ── Slugify ──

  static slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'default'
  }

  // ── Path helpers ──

  private get globalConfigPath(): string {
    return path.join(this.configHome, 'global.json')
  }

  private get projectsDir(): string {
    return path.join(this.configHome, 'projects')
  }

  private get projectDir(): string {
    return path.join(this.projectsDir, this.projectSlug)
  }

  private get historyDir(): string {
    return path.join(this.projectDir, 'history')
  }

  // ── Initialization ──

  async init(): Promise<void> {
    await mkdir(this.configHome, { recursive: true })

    if (existsSync(this.globalConfigPath)) {
      const global = await this.getGlobalConfig()
      this.projectSlug = global.activeProject
      return
    }

    // Try legacy migration
    for (const loc of this.legacyLocations) {
      const legacyProject = path.join(loc, 'project.json')
      if (existsSync(legacyProject)) {
        await this.migrateLegacy(loc)
        return
      }
    }

    // Fresh start — create default project
    await this.ensureProjectDir('default')
    await this.saveGlobalConfig(DEFAULT_GLOBAL)
    this.projectSlug = 'default'
  }

  private async migrateLegacy(legacyDir: string): Promise<void> {
    // Read legacy config to derive project name
    let slug = 'default'
    try {
      const content = await readFile(path.join(legacyDir, 'project.json'), 'utf-8')
      const config = JSON.parse(content) as Partial<ProjectConfig>
      if (config.name) {
        slug = ConfigService.slugify(config.name)
      }
    } catch {
      // use default slug
    }

    const targetDir = path.join(this.projectsDir, slug)
    await mkdir(targetDir, { recursive: true })

    // Copy all files from legacy dir to project dir
    const entries = await readdir(legacyDir, { withFileTypes: true })
    for (const entry of entries) {
      const src = path.join(legacyDir, entry.name)
      const dest = path.join(targetDir, entry.name)
      await cp(src, dest, { recursive: true })
    }

    this.projectSlug = slug
    await this.saveGlobalConfig({ activeProject: slug, projects: [slug] })
  }

  private async ensureProjectDir(slug: string): Promise<void> {
    await mkdir(path.join(this.projectsDir, slug), { recursive: true })
  }

  // ── Global Config ──

  async getGlobalConfig(): Promise<GlobalConfig> {
    try {
      const content = await readFile(this.globalConfigPath, 'utf-8')
      return { ...DEFAULT_GLOBAL, ...JSON.parse(content) }
    } catch {
      return { ...DEFAULT_GLOBAL }
    }
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    await mkdir(this.configHome, { recursive: true })
    await writeFile(this.globalConfigPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  // ── Multi-project management ──

  getActiveProjectSlug(): string {
    return this.projectSlug
  }

  async listProjectsAsync(): Promise<string[]> {
    const global = await this.getGlobalConfig()
    return global.projects
  }

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const global = await this.getGlobalConfig()
    const summaries: ProjectSummary[] = []

    for (const slug of global.projects) {
      const config = await this.peekProjectConfig(slug)
      summaries.push({
        slug,
        name: config.name || slug,
        rootFolder: config.rootFolder,
        isActive: slug === this.projectSlug,
      })
    }

    return summaries
  }

  async createProject(name: string, rootFolder: string): Promise<string> {
    const slug = ConfigService.slugify(name)
    const global = await this.getGlobalConfig()

    if (global.projects.includes(slug)) {
      throw new Error(`Project "${slug}" already exists`)
    }

    await this.ensureProjectDir(slug)

    // Write initial project config
    const config: ProjectConfig = {
      ...DEFAULT_CONFIG,
      name,
      rootFolder,
    }
    const configPath = path.join(this.projectsDir, slug, 'project.json')
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    global.projects.push(slug)
    await this.saveGlobalConfig(global)

    return slug
  }

  async switchProject(slug: string): Promise<ProjectConfig> {
    const global = await this.getGlobalConfig()
    if (!global.projects.includes(slug)) {
      throw new Error(`Project "${slug}" not found`)
    }

    this.projectSlug = slug
    global.activeProject = slug
    await this.saveGlobalConfig(global)

    return this.getProjectConfig()
  }

  async deleteProject(slug: string): Promise<void> {
    if (slug === this.projectSlug) {
      throw new Error('Cannot delete the active project')
    }

    const global = await this.getGlobalConfig()
    global.projects = global.projects.filter((p) => p !== slug)
    await this.saveGlobalConfig(global)

    const dir = path.join(this.projectsDir, slug)
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true })
    }
  }

  async peekProjectConfig(slug: string): Promise<ProjectConfig> {
    const configPath = path.join(this.projectsDir, slug, 'project.json')
    try {
      const content = await readFile(configPath, 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  // ── Project Config (active project) ──

  async getProjectConfig(): Promise<ProjectConfig> {
    const configPath = path.join(this.projectDir, 'project.json')
    try {
      const content = await readFile(configPath, 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  async saveProjectConfig(config: ProjectConfig): Promise<void> {
    await mkdir(this.projectDir, { recursive: true })
    const configPath = path.join(this.projectDir, 'project.json')
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  // ── Cached Repos ──

  async getCachedRepos(): Promise<Repo[] | null> {
    const reposPath = path.join(this.projectDir, 'repos.json')
    try {
      const content = await readFile(reposPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async saveCachedRepos(repos: Repo[]): Promise<void> {
    await mkdir(this.projectDir, { recursive: true })
    const reposPath = path.join(this.projectDir, 'repos.json')
    await writeFile(reposPath, JSON.stringify(repos, null, 2), 'utf-8')
  }

  // ── Cached Graph ──

  async getCachedGraph(): Promise<DependencyGraph | null> {
    const graphPath = path.join(this.projectDir, 'dependency-graph.json')
    try {
      const content = await readFile(graphPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async saveCachedGraph(graph: DependencyGraph): Promise<void> {
    await mkdir(this.projectDir, { recursive: true })
    const graphPath = path.join(this.projectDir, 'dependency-graph.json')
    await writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8')
  }

  // ── Cascade History ──

  async saveHistory(entry: CascadeHistoryEntry): Promise<void> {
    const dir = this.historyDir
    await mkdir(dir, { recursive: true })
    const filename = `${entry.startedAt.replace(/[:.]/g, '-')}_cascade_${entry.id}.json`
    await writeFile(path.join(dir, filename), JSON.stringify(entry, null, 2), 'utf-8')
  }

  async getHistory(limit = 20): Promise<CascadeHistoryEntry[]> {
    const dir = this.historyDir
    if (!existsSync(dir)) return []

    try {
      const files = await readdir(dir)
      const cascadeFiles = files
        .filter((f) => f.includes('_cascade_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit)

      const entries: CascadeHistoryEntry[] = []
      for (const file of cascadeFiles) {
        try {
          const content = await readFile(path.join(dir, file), 'utf-8')
          entries.push(JSON.parse(content))
        } catch {
          // Skip corrupt files
        }
      }
      return entries
    } catch {
      return []
    }
  }

  // ── Pull All History ──

  async savePullAllHistory(entry: PullAllHistoryEntry): Promise<void> {
    const dir = this.historyDir
    await mkdir(dir, { recursive: true })
    const filename = `${entry.startedAt.replace(/[:.]/g, '-')}_pullall_${entry.id}.json`
    await writeFile(path.join(dir, filename), JSON.stringify(entry, null, 2), 'utf-8')
  }

  async getPullAllHistory(limit = 20): Promise<PullAllHistoryEntry[]> {
    const dir = this.historyDir
    if (!existsSync(dir)) return []

    try {
      const files = await readdir(dir)
      const pullFiles = files
        .filter((f) => f.includes('_pullall_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit)

      const entries: PullAllHistoryEntry[] = []
      for (const file of pullFiles) {
        try {
          const content = await readFile(path.join(dir, file), 'utf-8')
          entries.push(JSON.parse(content))
        } catch {
          // Skip corrupt files
        }
      }
      return entries
    } catch {
      return []
    }
  }

  // ── Import Mapping ──

  /**
   * Parse repo-maintenance.sh script content and extract DOMAIN_REPOS mapping and IGNORE_REPOS list.
   * Returns the parsed mapping and ignore list, and saves them into ProjectConfig.
   */
  async importRepoMapping(
    scriptContent: string
  ): Promise<{ mapping: Record<string, string>; ignore: string[] }> {
    const mapping: Record<string, string> = {}
    const ignore: string[] = []

    // Parse DOMAIN_REPOS=( ... ) — extract "repo:path" entries
    const domainMatch = scriptContent.match(/DOMAIN_REPOS=\(\s*([\s\S]*?)\s*\)/)
    if (domainMatch) {
      const block = domainMatch[1]!
      const entryRegex = /"([^"]+)"/g
      let m
      while ((m = entryRegex.exec(block)) !== null) {
        const entry = m[1]!
        const colonIdx = entry.indexOf(':')
        if (colonIdx > 0) {
          const repoName = entry.slice(0, colonIdx)
          const domainPath = entry.slice(colonIdx + 1)
          mapping[repoName] = domainPath
        }
      }
    }

    // Parse IGNORE_REPOS=( ... ) — extract repo names
    const ignoreMatch = scriptContent.match(/IGNORE_REPOS=\(\s*([\s\S]*?)\s*\)/)
    if (ignoreMatch) {
      const block = ignoreMatch[1]!
      const entryRegex = /"([^"]+)"/g
      let m
      while ((m = entryRegex.exec(block)) !== null) {
        ignore.push(m[1]!)
      }
    }

    // Save into project config
    const config = await this.getProjectConfig()
    config.repoMapping = mapping
    config.ignoreRepos = ignore
    await this.saveProjectConfig(config)

    return { mapping, ignore }
  }
}
