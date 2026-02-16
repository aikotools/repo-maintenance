/**
 * Git procedures - status, diff, commit, push, pull.
 * pullAll now uses PullAllService for background execution with progress.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../init'

export const gitRouter = router({
  status: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const repo = ctx.repos.find((r) => r.id === input.id)
    if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

    const status = await ctx.gitService.getStatus(repo.absolutePath)
    repo.gitStatus = status
    return status
  }),

  statusAll: publicProcedure.mutation(async ({ ctx }) => {
    const paths = ctx.repos.map((r) => r.absolutePath)
    const results = await ctx.gitService.getStatusAll(paths)

    // Update all repos with their git status
    for (const repo of ctx.repos) {
      const status = results.get(repo.absolutePath)
      if (status) {
        repo.gitStatus = status
      }
    }

    // Update domain hasUncommitted flags
    for (const domain of ctx.domains) {
      domain.hasUncommitted = ctx.repos.some(
        (r) => r.domain === domain.id && r.gitStatus?.hasUncommittedChanges
      )
    }

    const uncommittedCount = ctx.repos.filter((r) => r.gitStatus?.hasUncommittedChanges).length

    return { uncommittedCount, total: ctx.repos.length }
  }),

  diff: publicProcedure
    .input(z.object({ id: z.string(), filePath: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.getDiff(repo.absolutePath, input.filePath)
    }),

  stageFiles: publicProcedure
    .input(z.object({ id: z.string(), files: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.stageFiles(repo.absolutePath, input.files)
    }),

  unstageFiles: publicProcedure
    .input(z.object({ id: z.string(), files: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.unstageFiles(repo.absolutePath, input.files)
    }),

  stageAll: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.stageAll(repo.absolutePath)
    }),

  commit: publicProcedure
    .input(z.object({ id: z.string(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.commit(repo.absolutePath, input.message)
    }),

  push: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const repo = ctx.repos.find((r) => r.id === input.id)
    if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

    return ctx.gitService.push(repo.absolutePath)
  }),

  pull: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const repo = ctx.repos.find((r) => r.id === input.id)
    if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

    return ctx.gitService.pull(repo.absolutePath)
  }),

  /** Add a file path to .gitignore */
  addToGitignore: publicProcedure
    .input(z.object({ id: z.string(), filePath: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repo = ctx.repos.find((r) => r.id === input.id)
      if (!repo)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Repo ${input.id} not found` })

      return ctx.gitService.addToGitignore(repo.absolutePath, input.filePath)
    }),

  /** Start a background pull-all execution. Returns { id } for polling. */
  pullAll: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.pullAllService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'PullAll service not initialized.',
      })
    }

    const config = await ctx.configService.getProjectConfig()
    const id = ctx.pullAllService.startPullAll(ctx.repos, config)
    return { id }
  }),

  /** Poll pull-all execution status (called every 2s by client). */
  pullAllStatus: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      if (!ctx.pullAllService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'PullAll service not initialized.',
        })
      }

      const execution = ctx.pullAllService.getExecution(input.id)
      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Pull-all execution ${input.id} not found.`,
        })
      }
      return execution
    }),

  /** Abort a running pull-all execution. */
  pullAllAbort: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.pullAllService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'PullAll service not initialized.',
        })
      }

      const success = ctx.pullAllService.abort(input.id)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot abort: execution not running.',
        })
      }
      return { success: true }
    }),

  /** Get pull-all history entries. */
  pullAllHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.configService.getPullAllHistory(input?.limit ?? 20)
    }),
})
