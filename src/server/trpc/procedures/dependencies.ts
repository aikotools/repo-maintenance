/**
 * Dependency graph and impact analysis procedures.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../init'

export const dependenciesRouter = router({
  graph: publicProcedure.query(({ ctx }) => {
    if (!ctx.dependencyResolver) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No data available. Run refresh first.',
      })
    }
    return ctx.dependencyResolver.buildGraph()
  }),

  affected: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    if (!ctx.dependencyResolver) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No data available. Run refresh first.',
      })
    }
    return ctx.dependencyResolver.getAffected(input.id)
  }),
})
