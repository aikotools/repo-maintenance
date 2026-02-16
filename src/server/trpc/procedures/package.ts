/**
 * Package procedures - scan and replace file: URL dependencies.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../init'

export const packageRouter = router({
  /** Scan all repos for file: URL dependencies */
  scanFileUrls: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.packageService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Package service not initialized.',
      })
    }
    return ctx.packageService.scanFileUrls(ctx.repos)
  }),

  /** Replace file: URLs with npm version for selected repos */
  replaceFileUrls: publicProcedure
    .input(
      z.object({
        repoIds: z.array(z.string()).min(1),
        targetVersion: z.string().default('1.0.0'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.packageService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Package service not initialized.',
        })
      }
      return ctx.packageService.replaceFileUrls(ctx.repos, input.repoIds, input.targetVersion)
    }),

  /** Replace npm versions with file: URLs for local dev */
  replaceWithFileUrls: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.packageService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Package service not initialized.',
      })
    }
    return ctx.packageService.replaceWithFileUrls(ctx.repos)
  }),
})
