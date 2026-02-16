/**
 * Repository list, detail, and refresh procedures.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { DependencyResolver } from '../../services/dependency-resolver'
import { publicProcedure, router } from '../init'

export const reposRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return { repos: ctx.repos, domains: ctx.domains }
  }),

  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const config = await ctx.configService.getProjectConfig()
    const { repos, domains } = await ctx.scanner.scan(config.domainOverrides)

    const resolver = new DependencyResolver(repos)
    const graph = resolver.buildGraph()

    // Update in-memory state
    ctx.repos = repos
    ctx.domains = domains
    ctx.dependencyResolver = resolver

    // Persist to cache
    await ctx.configService.saveCachedRepos(repos)
    await ctx.configService.saveCachedGraph(graph)

    // Auto-build repoMapping from scanned directory structure
    const repoMapping: Record<string, string> = {}
    for (const repo of repos) {
      const domainPath = repo.subGroup ? `${repo.domain}/${repo.subGroup}` : repo.domain
      repoMapping[repo.id] = domainPath
    }
    config.repoMapping = repoMapping

    // Update lastRefresh timestamp
    config.lastRefresh = new Date().toISOString()
    await ctx.configService.saveProjectConfig(config)

    return { repoCount: repos.length, domainCount: domains.length }
  }),

  detail: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const repo = ctx.repos.find((r) => r.id === input.id)
    if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })
    return repo
  }),
})
