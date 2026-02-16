/**
 * Root tRPC router - combines all procedure routers.
 */

import { router } from './init'
import { bulkRouter } from './procedures/bulk'
import { cascadeRouter } from './procedures/cascade'
import { dependenciesRouter } from './procedures/dependencies'
import { gitRouter } from './procedures/git'
import { packageRouter } from './procedures/package'
import { projectRouter } from './procedures/project'
import { reposRouter } from './procedures/repos'

export const appRouter = router({
  project: projectRouter,
  repos: reposRouter,
  dependencies: dependenciesRouter,
  git: gitRouter,
  cascade: cascadeRouter,
  bulk: bulkRouter,
  package: packageRouter,
})

export type AppRouter = typeof appRouter
