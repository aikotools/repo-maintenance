import { describe, it, expect } from 'vitest'
import type {
  Repo,
  RepoType,
  BulkExecution,
  CascadePlan,
  DependencyGraph,
  GitStatus,
  ProjectConfig,
} from '../../src/shared/types'

describe('Shared types', () => {
  it('should allow creating a valid Repo object', () => {
    const repo: Repo = {
      id: 'lib-invoice-interface',
      path: 'invoice/lib-invoice-interface',
      absolutePath: '/home/user/repo/invoice/lib-invoice-interface',
      domain: 'invoice',
      type: 'lib',
      npmPackage: '@xhubio-saas/lib-invoice-interface',
      version: '1.0.0',
      dependencies: [],
      dependents: ['kernel-plugin-invoice'],
    }

    expect(repo.id).toBe('lib-invoice-interface')
    expect(repo.type).toBe('lib')
    expect(repo.dependencies).toHaveLength(0)
  })

  it('should support all RepoType values', () => {
    const types: RepoType[] = [
      'kernel',
      'kernel-plugin',
      'frontend-kernel',
      'frontend-plugin',
      'frontend-ui',
      'lib',
      'app',
      'tool',
      'mock',
      'integration',
    ]

    expect(types).toHaveLength(10)
  })

  it('should allow creating a valid ProjectConfig', () => {
    const config: ProjectConfig = {
      name: 'saas-coding-kernel',
      rootFolder: '/home/user/saas-coding-kernel',
      npmOrganizations: ['@xhubio-saas'],
      githubOrganizations: ['xhubio-saas'],
      parallelTasks: 6,
      defaultBranch: 'main',
    }

    expect(config.parallelTasks).toBe(6)
  })

  it('should allow creating a DependencyGraph', () => {
    const graph: DependencyGraph = {
      nodes: [],
      edges: [],
      layers: { 0: ['lib-a'], 1: ['lib-b'] },
    }

    expect(Object.keys(graph.layers)).toHaveLength(2)
  })

  it('should allow optional fields on GitStatus', () => {
    const status: GitStatus = {
      branch: 'main',
      hasUncommittedChanges: false,
      changedFiles: [],
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      aheadCount: 0,
      behindCount: 0,
      recentCommits: [],
    }

    expect(status.hasUncommittedChanges).toBe(false)
  })

  it('should allow creating a BulkExecution', () => {
    const exec: BulkExecution = {
      id: 'bulk-1',
      command: 'pnpm test',
      repoIds: ['lib-a'],
      status: 'completed',
      results: [],
      completedCount: 1,
      failedCount: 0,
      startedAt: new Date().toISOString(),
      concurrency: 4,
    }

    expect(exec.status).toBe('completed')
  })

  it('should allow creating a CascadePlan', () => {
    const plan: CascadePlan = {
      sourceRepoId: 'lib-invoice-interface',
      sourceCommitMessage: 'feat: update interface',
      layers: [],
      totalRepos: 5,
      waitForCi: true,
      runTests: true,
      commitPrefix: 'chore',
    }

    expect(plan.totalRepos).toBe(5)
  })
})
