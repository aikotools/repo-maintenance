/**
 * tRPC context - holds all services and in-memory state.
 * No auth needed since this is a local-only tool.
 */

import type { Domain, Repo } from '../../shared/types'
import type { BulkService } from '../services/bulk-service'
import type { CascadeService } from '../services/cascade-service'
import type { ConfigService } from '../services/config-service'
import type { DependencyResolver } from '../services/dependency-resolver'
import type { GitService } from '../services/git-service'
import type { PackageService } from '../services/package-service'
import type { PullAllService } from '../services/pull-all-service'
import type { RepoScanner } from '../services/repo-scanner'

export interface AppContext {
  configService: ConfigService
  scanner: RepoScanner
  gitService: GitService
  repos: Repo[]
  domains: Domain[]
  dependencyResolver: DependencyResolver | null
  cascadeService: CascadeService | null
  bulkService: BulkService | null
  pullAllService: PullAllService | null
  packageService: PackageService | null
}
