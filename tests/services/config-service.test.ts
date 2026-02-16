import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { ConfigService } from '../../src/server/services/config-service'

describe('ConfigService', () => {
  let configHome: string
  let service: ConfigService

  beforeEach(async () => {
    configHome = await mkdtemp(path.join(tmpdir(), 'repohub-test-'))
    service = new ConfigService(configHome)
    await service.init()
  })

  afterEach(async () => {
    await rm(configHome, { recursive: true, force: true })
  })

  // ── Slugify ──

  describe('slugify', () => {
    it('should convert name to kebab-case', () => {
      expect(ConfigService.slugify('My Project')).toBe('my-project')
    })

    it('should strip special characters', () => {
      expect(ConfigService.slugify('Hello World!!! @#$')).toBe('hello-world')
    })

    it('should return "default" for empty input', () => {
      expect(ConfigService.slugify('')).toBe('default')
      expect(ConfigService.slugify('!!!')).toBe('default')
    })

    it('should truncate to 64 characters', () => {
      const long = 'a'.repeat(100)
      expect(ConfigService.slugify(long).length).toBeLessThanOrEqual(64)
    })
  })

  // ── Init & Global Config ──

  describe('init', () => {
    it('should create global.json with default project on fresh start', async () => {
      const global = await service.getGlobalConfig()
      expect(global.activeProject).toBe('default')
      expect(global.projects).toEqual(['default'])
    })

    it('should create projects directory', () => {
      expect(existsSync(path.join(configHome, 'projects', 'default'))).toBe(true)
    })

    it('should read existing global.json on subsequent init', async () => {
      // Create a project first
      await service.createProject('second', '/tmp/second')
      await service.switchProject('second')

      // Re-init from same configHome
      const service2 = new ConfigService(configHome)
      await service2.init()

      expect(service2.getActiveProjectSlug()).toBe('second')
    })
  })

  // ── Legacy Migration ──

  describe('legacy migration', () => {
    it('should migrate legacy config to projects/<slug>/', async () => {
      // Set up legacy location
      const legacyDir = path.join(configHome, 'legacy-loc')
      await mkdir(legacyDir, { recursive: true })
      await writeFile(
        path.join(legacyDir, 'project.json'),
        JSON.stringify({ name: 'xhubio-saas', rootFolder: '/my/root' }),
        'utf-8'
      )
      await writeFile(path.join(legacyDir, 'repos.json'), '[]', 'utf-8')

      // New configHome
      const freshHome = await mkdtemp(path.join(tmpdir(), 'repohub-migrate-'))
      const migrated = new ConfigService(freshHome, [legacyDir])
      await migrated.init()

      expect(migrated.getActiveProjectSlug()).toBe('xhubio-saas')
      const config = await migrated.getProjectConfig()
      expect(config.name).toBe('xhubio-saas')
      expect(config.rootFolder).toBe('/my/root')

      // Check repos.json was copied
      const repos = await migrated.getCachedRepos()
      expect(repos).toEqual([])

      await rm(freshHome, { recursive: true, force: true })
    })

    it('should use "default" slug when legacy has no name', async () => {
      const legacyDir = path.join(configHome, 'legacy-noname')
      await mkdir(legacyDir, { recursive: true })
      await writeFile(
        path.join(legacyDir, 'project.json'),
        JSON.stringify({ rootFolder: '/some/path' }),
        'utf-8'
      )

      const freshHome = await mkdtemp(path.join(tmpdir(), 'repohub-migrate2-'))
      const migrated = new ConfigService(freshHome, [legacyDir])
      await migrated.init()

      expect(migrated.getActiveProjectSlug()).toBe('default')

      await rm(freshHome, { recursive: true, force: true })
    })
  })

  // ── Project Config ──

  describe('getProjectConfig', () => {
    it('should return defaults when no config exists', async () => {
      const config = await service.getProjectConfig()
      expect(config.name).toBe('')
      expect(config.rootFolder).toBe('')
      expect(config.npmOrganizations).toEqual([])
      expect(config.githubOrganizations).toEqual([])
      expect(config.npmRegistry).toBe('https://npm.pkg.github.com')
      expect(config.parallelTasks).toBe(6)
      expect(config.defaultBranch).toBe('main')
    })

    it('should merge saved config with defaults', async () => {
      await service.saveProjectConfig({
        name: 'my-project',
        rootFolder: '/my/root',
        npmOrganizations: ['@my-org'],
        githubOrganizations: [],
        npmRegistry: 'https://registry.npmjs.org',
        parallelTasks: 10,
        defaultBranch: 'develop',
      })

      const config = await service.getProjectConfig()
      expect(config.name).toBe('my-project')
      expect(config.rootFolder).toBe('/my/root')
      expect(config.parallelTasks).toBe(10)
      expect(config.defaultBranch).toBe('develop')
    })
  })

  describe('saveProjectConfig', () => {
    it('should create project directory and save config', async () => {
      await service.saveProjectConfig({
        name: 'test',
        rootFolder: '/test',
        npmOrganizations: [],
        githubOrganizations: [],
        parallelTasks: 4,
        defaultBranch: 'main',
      })

      const configPath = path.join(configHome, 'projects', 'default', 'project.json')
      const content = await readFile(configPath, 'utf-8')
      const saved = JSON.parse(content)

      expect(saved.name).toBe('test')
      expect(saved.parallelTasks).toBe(4)
    })

    it('should overwrite existing config', async () => {
      await service.saveProjectConfig({
        name: 'first',
        rootFolder: '',
        npmOrganizations: [],
        githubOrganizations: [],
        parallelTasks: 6,
        defaultBranch: 'main',
      })

      await service.saveProjectConfig({
        name: 'second',
        rootFolder: '/updated',
        npmOrganizations: ['@org'],
        githubOrganizations: [],
        parallelTasks: 8,
        defaultBranch: 'main',
      })

      const config = await service.getProjectConfig()
      expect(config.name).toBe('second')
      expect(config.rootFolder).toBe('/updated')
      expect(config.parallelTasks).toBe(8)
    })
  })

  // ── Multi-project management ──

  describe('multi-project', () => {
    it('should create a new project', async () => {
      const slug = await service.createProject('My New Project', '/tmp/proj')
      expect(slug).toBe('my-new-project')

      const global = await service.getGlobalConfig()
      expect(global.projects).toContain('my-new-project')
    })

    it('should reject duplicate project slug', async () => {
      await service.createProject('alpha', '/tmp/a')
      await expect(service.createProject('alpha', '/tmp/b')).rejects.toThrow('already exists')
    })

    it('should switch active project', async () => {
      await service.createProject('other', '/tmp/other')
      // Save config for the new project
      await service.switchProject('other')
      await service.saveProjectConfig({
        name: 'other',
        rootFolder: '/tmp/other',
        npmOrganizations: [],
        githubOrganizations: [],
        parallelTasks: 3,
        defaultBranch: 'main',
      })

      const config = await service.switchProject('other')
      expect(service.getActiveProjectSlug()).toBe('other')
      expect(config.rootFolder).toBe('/tmp/other')

      const global = await service.getGlobalConfig()
      expect(global.activeProject).toBe('other')
    })

    it('should throw when switching to non-existent project', async () => {
      await expect(service.switchProject('nope')).rejects.toThrow('not found')
    })

    it('should delete a non-active project', async () => {
      await service.createProject('to-delete', '/tmp/del')
      await service.deleteProject('to-delete')

      const global = await service.getGlobalConfig()
      expect(global.projects).not.toContain('to-delete')
      expect(existsSync(path.join(configHome, 'projects', 'to-delete'))).toBe(false)
    })

    it('should throw when deleting the active project', async () => {
      await expect(service.deleteProject('default')).rejects.toThrow('Cannot delete the active')
    })

    it('should list project summaries', async () => {
      await service.saveProjectConfig({
        name: 'Default Project',
        rootFolder: '/root',
        npmOrganizations: [],
        githubOrganizations: [],
        parallelTasks: 6,
        defaultBranch: 'main',
      })
      await service.createProject('second', '/root2')

      const summaries = await service.listProjectSummaries()
      expect(summaries).toHaveLength(2)
      expect(summaries[0]!.slug).toBe('default')
      expect(summaries[0]!.isActive).toBe(true)
      expect(summaries[1]!.slug).toBe('second')
      expect(summaries[1]!.isActive).toBe(false)
    })

    it('should peek at another projects config without switching', async () => {
      await service.createProject('peek-me', '/tmp/peek')
      const config = await service.peekProjectConfig('peek-me')
      expect(config.name).toBe('peek-me')
      expect(config.rootFolder).toBe('/tmp/peek')
      // Active project unchanged
      expect(service.getActiveProjectSlug()).toBe('default')
    })
  })

  // ── Cached data is per-project ──

  describe('per-project caches', () => {
    it('should store repos per project', async () => {
      const repos = [
        {
          id: 'lib-a',
          path: 'test/lib-a',
          absolutePath: '/root/test/lib-a',
          domain: 'test',
          type: 'lib' as const,
          npmPackage: '@test/lib-a',
          version: '1.0.0',
          dependencies: [],
          dependents: [],
        },
      ]

      await service.saveCachedRepos(repos)
      const cached = await service.getCachedRepos()
      expect(cached).toHaveLength(1)

      // Switch to new project — cache should be empty
      await service.createProject('empty-proj', '/tmp/empty')
      await service.switchProject('empty-proj')
      const emptyCached = await service.getCachedRepos()
      expect(emptyCached).toBeNull()

      // Switch back — cache should still be there
      await service.switchProject('default')
      const backCached = await service.getCachedRepos()
      expect(backCached).toHaveLength(1)
    })
  })

  // ── Cached repos ──

  describe('cachedRepos', () => {
    it('should return null when no cache exists', async () => {
      const repos = await service.getCachedRepos()
      expect(repos).toBeNull()
    })

    it('should save and retrieve cached repos', async () => {
      const repos = [
        {
          id: 'lib-a',
          path: 'test/lib-a',
          absolutePath: '/root/test/lib-a',
          domain: 'test',
          type: 'lib' as const,
          npmPackage: '@test/lib-a',
          version: '1.0.0',
          dependencies: [],
          dependents: [],
        },
      ]

      await service.saveCachedRepos(repos)
      const cached = await service.getCachedRepos()

      expect(cached).toHaveLength(1)
      expect(cached![0]!.id).toBe('lib-a')
    })
  })

  // ── Cached graph ──

  describe('cachedGraph', () => {
    it('should return null when no cache exists', async () => {
      const graph = await service.getCachedGraph()
      expect(graph).toBeNull()
    })

    it('should save and retrieve cached graph', async () => {
      const graph = {
        nodes: [],
        edges: [{ from: 'a', to: 'b', versionSpec: '^1.0.0' }],
        layers: { 0: ['b'], 1: ['a'] },
      }

      await service.saveCachedGraph(graph)
      const cached = await service.getCachedGraph()

      expect(cached!.edges).toHaveLength(1)
      expect(cached!.layers[0]).toEqual(['b'])
    })
  })

  // ── Import mapping ──

  describe('importRepoMapping', () => {
    it('should parse DOMAIN_REPOS mapping from shell script', async () => {
      const script = `
DOMAIN_REPOS=(
  "kernel:core"
  "frontend-kernel:core"
  "lib-invoice-interface:invoice"
  "lib-invoice-outbound-de:invoice/outbound"
)
IGNORE_REPOS=(
  "old-repo"
  "deprecated-lib"
)
`
      const result = await service.importRepoMapping(script)

      expect(result.mapping).toEqual({
        kernel: 'core',
        'frontend-kernel': 'core',
        'lib-invoice-interface': 'invoice',
        'lib-invoice-outbound-de': 'invoice/outbound',
      })
      expect(result.ignore).toEqual(['old-repo', 'deprecated-lib'])
    })

    it('should handle empty arrays', async () => {
      const script = `
DOMAIN_REPOS=()
IGNORE_REPOS=()
`
      const result = await service.importRepoMapping(script)

      expect(result.mapping).toEqual({})
      expect(result.ignore).toEqual([])
    })

    it('should handle script without IGNORE_REPOS', async () => {
      const script = `
DOMAIN_REPOS=(
  "my-lib:core"
)
`
      const result = await service.importRepoMapping(script)

      expect(result.mapping).toEqual({ 'my-lib': 'core' })
      expect(result.ignore).toEqual([])
    })

    it('should save mapping into project config', async () => {
      const script = `
DOMAIN_REPOS=(
  "lib-a:domain-x"
)
IGNORE_REPOS=(
  "skip-me"
)
`
      await service.importRepoMapping(script)
      const config = await service.getProjectConfig()

      expect(config.repoMapping).toEqual({ 'lib-a': 'domain-x' })
      expect(config.ignoreRepos).toEqual(['skip-me'])
    })
  })
})
