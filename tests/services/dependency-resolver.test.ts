import { describe, it, expect } from 'vitest'
import { DependencyResolver } from '../../src/server/services/dependency-resolver'
import type { Repo } from '../../src/shared/types'

function makeRepo(id: string, deps: { repoId: string }[] = [], dependents: string[] = []): Repo {
  return {
    id,
    path: `domain/${id}`,
    absolutePath: `/root/domain/${id}`,
    domain: 'test',
    type: 'lib',
    npmPackage: `@test/${id}`,
    version: '1.0.0',
    dependencies: deps.map((d) => ({
      npmName: `@test/${d.repoId}`,
      repoId: d.repoId,
      versionSpec: '^1.0.0',
    })),
    dependents,
  }
}

describe('DependencyResolver', () => {
  describe('buildGraph', () => {
    it('should build edges from dependencies', () => {
      const repos = [
        makeRepo('lib-a'),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
        makeRepo('lib-c', [{ repoId: 'lib-a' }, { repoId: 'lib-b' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const graph = resolver.buildGraph()

      expect(graph.edges).toHaveLength(3)
      expect(graph.edges).toContainEqual({
        from: 'lib-b',
        to: 'lib-a',
        versionSpec: '^1.0.0',
      })
      expect(graph.edges).toContainEqual({
        from: 'lib-c',
        to: 'lib-a',
        versionSpec: '^1.0.0',
      })
      expect(graph.edges).toContainEqual({
        from: 'lib-c',
        to: 'lib-b',
        versionSpec: '^1.0.0',
      })
    })

    it('should build empty graph for repos without dependencies', () => {
      const repos = [makeRepo('lib-a'), makeRepo('lib-b')]
      const resolver = new DependencyResolver(repos)
      const graph = resolver.buildGraph()

      expect(graph.edges).toHaveLength(0)
      expect(graph.nodes).toHaveLength(2)
    })
  })

  describe('calculateLayers', () => {
    it('should assign layer 0 to repos with no dependencies', () => {
      const repos = [makeRepo('lib-a'), makeRepo('lib-b')]
      const resolver = new DependencyResolver(repos)
      const layers = resolver.calculateLayers()

      expect(layers[0]).toContain('lib-a')
      expect(layers[0]).toContain('lib-b')
    })

    it('should calculate correct layers for a chain', () => {
      const repos = [
        makeRepo('lib-a'),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
        makeRepo('lib-c', [{ repoId: 'lib-b' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const layers = resolver.calculateLayers()

      expect(layers[0]).toEqual(['lib-a'])
      expect(layers[1]).toEqual(['lib-b'])
      expect(layers[2]).toEqual(['lib-c'])
    })

    it('should place siblings with same deps in same layer', () => {
      const repos = [
        makeRepo('lib-base'),
        makeRepo('lib-x', [{ repoId: 'lib-base' }]),
        makeRepo('lib-y', [{ repoId: 'lib-base' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const layers = resolver.calculateLayers()

      expect(layers[0]).toEqual(['lib-base'])
      expect(layers[1]!.sort()).toEqual(['lib-x', 'lib-y'])
    })
  })

  describe('topologicalSort', () => {
    it('should sort repos so dependencies come first', () => {
      const repos = [
        makeRepo('lib-c', [{ repoId: 'lib-b' }]),
        makeRepo('lib-a'),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const sorted = resolver.topologicalSort()

      expect(sorted.indexOf('lib-a')).toBeLessThan(sorted.indexOf('lib-b'))
      expect(sorted.indexOf('lib-b')).toBeLessThan(sorted.indexOf('lib-c'))
    })

    it('should handle independent repos', () => {
      const repos = [makeRepo('lib-a'), makeRepo('lib-b'), makeRepo('lib-c')]
      const resolver = new DependencyResolver(repos)
      const sorted = resolver.topologicalSort()

      expect(sorted).toHaveLength(3)
      expect(sorted).toContain('lib-a')
      expect(sorted).toContain('lib-b')
      expect(sorted).toContain('lib-c')
    })
  })

  describe('getAffected', () => {
    it('should find direct dependents', () => {
      const repos = [
        makeRepo('lib-a', [], ['lib-b', 'lib-c']),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
        makeRepo('lib-c', [{ repoId: 'lib-a' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const result = resolver.getAffected('lib-a')

      expect(result.totalCount).toBe(2)
      expect(result.affected.map((a) => a.id).sort()).toEqual(['lib-b', 'lib-c'])
      expect(result.affected.every((a) => a.layer === 1)).toBe(true)
    })

    it('should find transitive dependents with correct layers', () => {
      const repos = [
        makeRepo('lib-a', [], ['lib-b']),
        makeRepo('lib-b', [{ repoId: 'lib-a' }], ['lib-c']),
        makeRepo('lib-c', [{ repoId: 'lib-b' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const result = resolver.getAffected('lib-a')

      expect(result.totalCount).toBe(2)
      const libB = result.affected.find((a) => a.id === 'lib-b')!
      const libC = result.affected.find((a) => a.id === 'lib-c')!
      expect(libB.layer).toBe(1)
      expect(libC.layer).toBe(2)
    })

    it('should return empty for leaf repos', () => {
      const repos = [
        makeRepo('lib-a', [], ['lib-b']),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const result = resolver.getAffected('lib-b')

      expect(result.totalCount).toBe(0)
      expect(result.affected).toEqual([])
    })

    it('should include dependency paths', () => {
      const repos = [
        makeRepo('lib-a', [], ['lib-b']),
        makeRepo('lib-b', [{ repoId: 'lib-a' }], ['lib-c']),
        makeRepo('lib-c', [{ repoId: 'lib-b' }]),
      ]
      const resolver = new DependencyResolver(repos)
      const result = resolver.getAffected('lib-a')

      const libC = result.affected.find((a) => a.id === 'lib-c')!
      expect(libC.dependencyPath).toEqual(['lib-a', 'lib-b', 'lib-c'])
    })

    it('should return empty for unknown repo', () => {
      const repos = [makeRepo('lib-a')]
      const resolver = new DependencyResolver(repos)
      const result = resolver.getAffected('nonexistent')

      expect(result.totalCount).toBe(0)
    })
  })

  describe('getDependencies / getDependents', () => {
    it('should return dependency IDs', () => {
      const repos = [
        makeRepo('lib-a'),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
      ]
      const resolver = new DependencyResolver(repos)

      expect(resolver.getDependencies('lib-b')).toEqual(['lib-a'])
      expect(resolver.getDependencies('lib-a')).toEqual([])
    })

    it('should return dependent IDs', () => {
      const repos = [
        makeRepo('lib-a', [], ['lib-b']),
        makeRepo('lib-b', [{ repoId: 'lib-a' }]),
      ]
      const resolver = new DependencyResolver(repos)

      expect(resolver.getDependents('lib-a')).toEqual(['lib-b'])
      expect(resolver.getDependents('lib-b')).toEqual([])
    })

    it('should return empty arrays for unknown repos', () => {
      const resolver = new DependencyResolver([])

      expect(resolver.getDependencies('nonexistent')).toEqual([])
      expect(resolver.getDependents('nonexistent')).toEqual([])
    })
  })
})
