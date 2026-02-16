/**
 * Bulk operation procedures - execute commands across multiple repos in parallel.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../init'

export const bulkRouter = router({
  /** Filter repos by domain, type, and search text */
  filterRepos: publicProcedure
    .input(
      z.object({
        domains: z.array(z.string()).optional(),
        types: z.array(z.string()).optional(),
        search: z.string().optional(),
      })
    )
    .query(({ ctx, input }) => {
      let filtered = ctx.repos

      if (input.domains && input.domains.length > 0) {
        filtered = filtered.filter((r) => input.domains!.includes(r.domain))
      }

      if (input.types && input.types.length > 0) {
        filtered = filtered.filter((r) => input.types!.includes(r.type))
      }

      if (input.search && input.search.trim()) {
        const term = input.search.toLowerCase()
        filtered = filtered.filter(
          (r) =>
            r.id.toLowerCase().includes(term) ||
            r.npmPackage.toLowerCase().includes(term) ||
            r.domain.toLowerCase().includes(term)
        )
      }

      return filtered.map((r) => ({
        id: r.id,
        domain: r.domain,
        type: r.type,
        npmPackage: r.npmPackage,
        absolutePath: r.absolutePath,
      }))
    }),

  /** Start a bulk command execution */
  execute: publicProcedure
    .input(
      z.object({
        command: z.string().min(1),
        repoIds: z.array(z.string()).min(1),
        concurrency: z.number().min(1).max(20).default(4),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.bulkService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Bulk service not initialized.',
        })
      }

      const repoMap = new Map(ctx.repos.map((r) => [r.id, r]))
      const repos = input.repoIds
        .map((id) => repoMap.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)

      if (repos.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid repos found for the given IDs.',
        })
      }

      const id = ctx.bulkService.startExecution(input.command, repos, {
        concurrency: input.concurrency,
      })

      return { id }
    }),

  /** Get live execution state (polled at 2s intervals by client) */
  execution: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      if (!ctx.bulkService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Bulk service not initialized.',
        })
      }

      const execution = ctx.bulkService.getExecution(input.id)
      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Execution ${input.id} not found.`,
        })
      }
      return execution
    }),

  /** List all executions */
  list: publicProcedure.query(({ ctx }) => {
    if (!ctx.bulkService) return []
    return ctx.bulkService.listExecutions()
  }),

  /** Abort a running execution */
  abort: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.bulkService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Bulk service not initialized.',
        })
      }

      const success = ctx.bulkService.abort(input.id)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot abort: execution not running.',
        })
      }
      return { success: true }
    }),
})
