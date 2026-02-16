/**
 * Cascade update procedures - plan, execute, monitor, and control cascade updates.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../init'

export const cascadeRouter = router({
  /** Build a cascade plan for a source repo (structure only, options applied at start) */
  plan: publicProcedure
    .input(z.object({ sourceRepoId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.dependencyResolver) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No data available. Run refresh first.',
        })
      }
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      return ctx.cascadeService.createPlan(
        input.sourceRepoId,
        ctx.repos,
        ctx.dependencyResolver
      )
    }),

  /** Start executing a cascade plan */
  start: publicProcedure
    .input(
      z.object({
        sourceRepoId: z.string(),
        waitForCi: z.boolean().default(false),
        runTests: z.boolean().default(false),
        commitPrefix: z.string().default('deps: '),
        // Allow overriding commit messages per step
        commitOverrides: z
          .record(z.string(), z.string())
          .optional()
          .describe('Map of repoId -> custom commit message'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.dependencyResolver) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No data available. Run refresh first.',
        })
      }
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const plan = await ctx.cascadeService.createPlan(
        input.sourceRepoId,
        ctx.repos,
        ctx.dependencyResolver,
        {
          waitForCi: input.waitForCi,
          runTests: input.runTests,
          commitPrefix: input.commitPrefix,
        }
      )

      // Apply commit message overrides
      if (input.commitOverrides) {
        for (const layer of plan.layers) {
          for (const step of layer.steps) {
            const override = input.commitOverrides[step.repoId]
            if (override) {
              step.commitMessage = override
            }
          }
        }
      }

      const executionId = ctx.cascadeService.startExecution(plan, ctx.repos)
      return { id: executionId }
    }),

  /** Get live execution state (polled at 2s intervals by client) */
  execution: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const execution = ctx.cascadeService.getExecution(input.id)
      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Execution ${input.id} not found.`,
        })
      }
      return execution
    }),

  /** List all active and recent executions */
  list: publicProcedure.query(({ ctx }) => {
    if (!ctx.cascadeService) {
      return []
    }
    return ctx.cascadeService.listExecutions()
  }),

  /** Abort a running cascade */
  abort: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const success = ctx.cascadeService.abort(input.id)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot abort: execution not running.',
        })
      }
      return { success: true }
    }),

  /** Pause after current layer completes */
  pause: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const success = ctx.cascadeService.pause(input.id)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot pause: execution not running.',
        })
      }
      return { success: true }
    }),

  /** Resume a paused cascade */
  resume: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const success = ctx.cascadeService.resume(input.id)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot resume: execution not paused.',
        })
      }
      return { success: true }
    }),

  /** Skip a failed step */
  skipStep: publicProcedure
    .input(z.object({ executionId: z.string(), repoId: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const success = ctx.cascadeService.skipStep(input.executionId, input.repoId)
      if (!success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot skip: step not found or not failed.',
        })
      }
      return { success: true }
    }),

  /** Manually set published version for a step */
  setVersion: publicProcedure
    .input(z.object({ executionId: z.string(), repoId: z.string(), version: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.cascadeService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cascade service not initialized.',
        })
      }

      const success = ctx.cascadeService.setPublishedVersion(
        input.executionId,
        input.repoId,
        input.version
      )
      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Step not found.',
        })
      }
      return { success: true }
    }),

  /** Get past cascade history from disk */
  history: publicProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.configService.getHistory(input?.limit ?? 20)
    }),
})
