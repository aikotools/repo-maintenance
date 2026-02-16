/**
 * Service for building and querying the dependency graph.
 * Provides topological sorting, layer calculation, and affected-repo analysis.
 */

import type {
  AffectedRepo,
  AffectedResult,
  DependencyEdge,
  DependencyGraph,
  Repo,
} from '../../shared/types'

export class DependencyResolver {
  private repoMap: Map<string, Repo>

  constructor(private repos: Repo[]) {
    this.repoMap = new Map(repos.map((r) => [r.id, r]))
  }

  buildGraph(): DependencyGraph {
    const edges: DependencyEdge[] = []

    for (const repo of this.repos) {
      for (const dep of repo.dependencies) {
        if (dep.repoId) {
          edges.push({
            from: repo.id,
            to: dep.repoId,
            versionSpec: dep.versionSpec,
          })
        }
      }
    }

    const layers = this.calculateLayers()

    return {
      nodes: this.repos,
      edges,
      layers,
    }
  }

  getAffected(repoId: string): AffectedResult {
    const affected: AffectedRepo[] = []
    const visited = new Set<string>()

    const bfs = (startIds: string[], layer: number, parentPaths: Map<string, string[]>) => {
      const nextIds: string[] = []
      const nextPaths = new Map<string, string[]>()

      for (const id of startIds) {
        const repo = this.repoMap.get(id)
        if (!repo) continue

        for (const dependentId of repo.dependents) {
          if (visited.has(dependentId)) continue
          visited.add(dependentId)

          const currentPath = parentPaths.get(id) || [repoId]
          const fullPath = [...currentPath, dependentId]

          affected.push({
            id: dependentId,
            layer,
            dependencyPath: fullPath,
          })

          nextIds.push(dependentId)
          nextPaths.set(dependentId, fullPath)
        }
      }

      if (nextIds.length > 0) {
        bfs(nextIds, layer + 1, nextPaths)
      }
    }

    visited.add(repoId)
    const initialPaths = new Map<string, string[]>()
    initialPaths.set(repoId, [repoId])
    bfs([repoId], 1, initialPaths)

    return {
      sourceId: repoId,
      affected,
      totalCount: affected.length,
    }
  }

  getDependencies(repoId: string): string[] {
    const repo = this.repoMap.get(repoId)
    if (!repo) return []
    return repo.dependencies.map((d) => d.repoId).filter(Boolean)
  }

  getDependents(repoId: string): string[] {
    const repo = this.repoMap.get(repoId)
    if (!repo) return []
    return repo.dependents
  }

  topologicalSort(): string[] {
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    for (const repo of this.repos) {
      const depIds = repo.dependencies.map((d) => d.repoId).filter(Boolean)
      inDegree.set(repo.id, depIds.length)

      for (const depId of depIds) {
        const list = adjList.get(depId) || []
        list.push(repo.id)
        adjList.set(depId, list)
      }
    }

    const sorted: string[] = []
    const queue = this.repos.filter((r) => (inDegree.get(r.id) || 0) === 0).map((r) => r.id)

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      sorted.push(nodeId)

      for (const dependent of adjList.get(nodeId) || []) {
        const remaining = (inDegree.get(dependent) || 1) - 1
        inDegree.set(dependent, remaining)
        if (remaining === 0) {
          queue.push(dependent)
        }
      }
    }

    return sorted
  }

  calculateLayers(): Record<number, string[]> {
    const depCount = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    for (const repo of this.repos) {
      const depIds = repo.dependencies.map((d) => d.repoId).filter(Boolean)
      depCount.set(repo.id, depIds.length)

      for (const depId of depIds) {
        const list = adjList.get(depId) || []
        list.push(repo.id)
        adjList.set(depId, list)
      }
    }

    const layers: Record<number, string[]> = {}
    let currentLayer = 0
    let queue = this.repos
      .filter((r) => (depCount.get(r.id) || 0) === 0)
      .map((r) => r.id)

    while (queue.length > 0) {
      layers[currentLayer] = [...queue]
      const nextQueue: string[] = []

      for (const nodeId of queue) {
        for (const dependent of adjList.get(nodeId) || []) {
          const remaining = (depCount.get(dependent) || 1) - 1
          depCount.set(dependent, remaining)
          if (remaining === 0) {
            nextQueue.push(dependent)
          }
        }
      }

      queue = nextQueue
      currentLayer++
    }

    return layers
  }
}
