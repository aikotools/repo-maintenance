/**
 * Project configuration procedures.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { z } from 'zod'
import { BulkService } from '../../services/bulk-service'
import { CascadeService } from '../../services/cascade-service'
import { DependencyResolver } from '../../services/dependency-resolver'
import { GitService } from '../../services/git-service'
import { PackageService } from '../../services/package-service'
import { PullAllService } from '../../services/pull-all-service'
import { RepoScanner } from '../../services/repo-scanner'
import type { AppContext } from '../context'
import { publicProcedure, router } from '../init'

/** Re-initialize all services based on config values */
function reinitializeContext(ctx: AppContext, config: { rootFolder?: string; npmOrganizations?: string[]; parallelTasks?: number }): void {
  const rootFolder = config.rootFolder || ''
  ctx.scanner = new RepoScanner(rootFolder, config.npmOrganizations || [])
  ctx.gitService = new GitService(config.parallelTasks || 6)
  ctx.cascadeService = new CascadeService(ctx.configService, config.parallelTasks || 6)
  ctx.bulkService = new BulkService(config.parallelTasks || 6)
  ctx.pullAllService = new PullAllService(config.parallelTasks || 6, ctx.configService)
  ctx.packageService = new PackageService(rootFolder, config.npmOrganizations || [])
  ctx.repos = []
  ctx.domains = []
  ctx.dependencyResolver = null
}

/** Load cached repos/domains/graph into context */
export async function loadCachedData(ctx: AppContext): Promise<void> {
  const cachedRepos = await ctx.configService.getCachedRepos()
  if (cachedRepos && cachedRepos.length > 0) {
    ctx.repos = cachedRepos
    ctx.dependencyResolver = new DependencyResolver(cachedRepos)
    ctx.dependencyResolver.buildGraph()
    // Rebuild domains from cached repos
    const domainMap = new Map<string, { id: string; path: string; repoCount: number; hasUncommitted: boolean; subGroups: { id: string; path: string; repoIds: string[] }[] }>()
    for (const repo of cachedRepos) {
      if (!domainMap.has(repo.domain)) {
        domainMap.set(repo.domain, {
          id: repo.domain,
          path: `${repo.domain}/`,
          repoCount: 0,
          hasUncommitted: false,
          subGroups: [],
        })
      }
      domainMap.get(repo.domain)!.repoCount++
    }
    ctx.domains = Array.from(domainMap.values()).sort((a, b) => a.id.localeCompare(b.id))
  } else {
    ctx.repos = []
    ctx.domains = []
    ctx.dependencyResolver = null
  }
}

export const projectRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    return ctx.configService.getProjectConfig()
  }),

  update: publicProcedure
    .input(
      z.object({
        name: z.string().optional(),
        rootFolder: z.string().optional(),
        npmOrganizations: z.array(z.string()).optional(),
        githubOrganizations: z.array(z.string()).optional(),
        npmRegistry: z.string().optional(),
        parallelTasks: z.number().min(1).max(20).optional(),
        defaultBranch: z.string().optional(),
        domainOverrides: z.record(z.string(), z.string()).optional(),
        quickActions: z
          .array(z.object({ label: z.string(), command: z.string() }))
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.rootFolder) {
        if (!existsSync(input.rootFolder) || !statSync(input.rootFolder).isDirectory()) {
          throw new Error(`Folder does not exist: ${input.rootFolder}`)
        }
      }
      const current = await ctx.configService.getProjectConfig()
      const updated = { ...current, ...input }
      await ctx.configService.saveProjectConfig(updated)

      reinitializeContext(ctx, updated)

      return updated
    }),

  importMapping: publicProcedure
    .input(z.object({ scriptPath: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      // Find repo-maintenance.sh: use provided path or auto-detect in rootFolder
      const config = await ctx.configService.getProjectConfig()
      const scriptPath =
        input?.scriptPath ||
        path.join(config.rootFolder, 'repo-maintenance.sh')

      if (!existsSync(scriptPath)) {
        throw new Error(`Script not found: ${scriptPath}`)
      }

      const scriptContent = readFileSync(scriptPath, 'utf-8')
      const result = await ctx.configService.importRepoMapping(scriptContent)

      return {
        mappingCount: Object.keys(result.mapping).length,
        ignoreCount: result.ignore.length,
      }
    }),

  /** Update the full repo mapping (replace all entries) */
  updateRepoMapping: publicProcedure
    .input(z.object({ repoMapping: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.configService.getProjectConfig()
      config.repoMapping = input.repoMapping
      await ctx.configService.saveProjectConfig(config)
      return { count: Object.keys(input.repoMapping).length }
    }),

  /** Update the full ignore list (replace all entries) */
  updateIgnoreRepos: publicProcedure
    .input(z.object({ ignoreRepos: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.configService.getProjectConfig()
      config.ignoreRepos = input.ignoreRepos
      await ctx.configService.saveProjectConfig(config)
      return { count: input.ignoreRepos.length }
    }),

  browseFolder: publicProcedure
    .input(z.object({ currentPath: z.string().optional() }).optional())
    .mutation(({ input }) => {
      const startDir = input?.currentPath || process.env.HOME || '/'
      try {
        const script = `
          set defaultDir to POSIX file "${startDir}" as alias
          set chosenFolder to choose folder with prompt "Select root folder" default location defaultDir
          return POSIX path of chosenFolder
        `
        const result = execSync(`osascript -e '${script}'`, {
          timeout: 60_000,
          encoding: 'utf-8',
        }).trim()
        return { path: result.replace(/\/$/, '') }
      } catch {
        return { path: null }
      }
    }),

  // ── Multi-project endpoints ──

  listProjects: publicProcedure.query(async ({ ctx }) => {
    return ctx.configService.listProjectSummaries()
  }),

  createProject: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        rootFolder: z.string(),
        npmOrganizations: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.rootFolder && !existsSync(input.rootFolder)) {
        throw new Error(`Folder does not exist: ${input.rootFolder}`)
      }
      const slug = await ctx.configService.createProject(input.name, input.rootFolder)

      // If npm orgs provided, save them into the new project config
      if (input.npmOrganizations?.length) {
        const config = await ctx.configService.peekProjectConfig(slug)
        config.npmOrganizations = input.npmOrganizations
        // We need to switch temporarily to save, then switch back
        const currentSlug = ctx.configService.getActiveProjectSlug()
        await ctx.configService.switchProject(slug)
        await ctx.configService.saveProjectConfig(config)
        await ctx.configService.switchProject(currentSlug)
      }

      return { slug }
    }),

  switchProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.configService.switchProject(input.slug)
      reinitializeContext(ctx, config)
      await loadCachedData(ctx)
      return config
    }),

  deleteProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.configService.deleteProject(input.slug)
      return { success: true }
    }),
})
