/**
 * Interactive dependency graph using React Flow.
 * Supports domain filtering, focus mode, and affected mode.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DependencyGraph as GraphData, Repo } from '../../../shared/types'
import { GraphNode, type RepoNodeData } from './GraphNode'
import { GraphControls, type GraphMode } from './GraphControls'

interface DependencyGraphProps {
  graph: GraphData
  repos: Repo[]
  onSelectRepo: (id: string) => void
}

const nodeTypes = { repo: GraphNode }

/** Lay out nodes in layers (top-to-bottom), grouping by domain within each layer */
function computeLayout(
  graph: GraphData,
  filteredNodeIds: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const NODE_WIDTH = 180
  const NODE_HEIGHT = 36
  const LAYER_GAP = 100
  const NODE_GAP = 24

  // Build repo lookup
  const repoMap = new Map(graph.nodes.map((r) => [r.id, r]))

  // Filter layers to only include visible nodes
  const layerEntries = Object.entries(graph.layers)
    .map(([layer, ids]) => ({
      layer: parseInt(layer),
      ids: ids.filter((id) => filteredNodeIds.has(id)),
    }))
    .filter((l) => l.ids.length > 0)
    .sort((a, b) => a.layer - b.layer)

  // Group nodes within each layer by domain for visual coherence
  for (const entry of layerEntries) {
    entry.ids.sort((a, b) => {
      const ra = repoMap.get(a)
      const rb = repoMap.get(b)
      const domainCmp = (ra?.domain || '').localeCompare(rb?.domain || '')
      if (domainCmp !== 0) return domainCmp
      return a.localeCompare(b)
    })
  }

  // Calculate positions
  const nodes: Node[] = []
  let y = 0

  for (const entry of layerEntries) {
    const layerWidth = entry.ids.length * (NODE_WIDTH + NODE_GAP) - NODE_GAP
    const startX = -layerWidth / 2

    entry.ids.forEach((id, i) => {
      const repo = repoMap.get(id)
      if (!repo) return

      nodes.push({
        id,
        type: 'repo',
        position: { x: startX + i * (NODE_WIDTH + NODE_GAP), y },
        data: {
          label: id,
          domain: repo.domain,
          type: repo.type,
          hasUncommitted: repo.gitStatus?.hasUncommittedChanges || false,
          isFocused: false,
          isAffected: false,
          isDimmed: false,
          dependentCount: repo.dependents.length,
        } satisfies RepoNodeData,
      })
    })

    y += NODE_HEIGHT + LAYER_GAP
  }

  // Build node-to-layer lookup
  const nodeLayer = new Map<string, number>()
  for (const entry of layerEntries) {
    for (const id of entry.ids) {
      nodeLayer.set(id, entry.layer)
    }
  }

  // Edges — pick handles based on relative vertical position so edges don't loop over nodes
  const edges: Edge[] = graph.edges
    .filter((e) => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to))
    .map((e) => {
      const sourceLayer = nodeLayer.get(e.from) ?? 0
      const targetLayer = nodeLayer.get(e.to) ?? 0
      const goingDown = sourceLayer <= targetLayer

      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        sourceHandle: goingDown ? 'bottom-source' : 'top-source',
        targetHandle: goingDown ? 'top-target' : 'bottom-target',
        type: 'default',
        label: e.versionSpec,
        labelStyle: { fontSize: 9, fill: '#71717a' },
        labelBgStyle: { fill: '#0a0a0f', fillOpacity: 0.8 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: '#3f3f46', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#3f3f46' },
        animated: false,
      }
    })

  return { nodes, edges }
}

export function DependencyGraph({ graph, repos, onSelectRepo }: DependencyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [mode, setMode] = useState<GraphMode>('full')
  const [focusRepoId, setFocusRepoId] = useState<string | null>(null)

  // Get unique domains
  const domains = useMemo(() => {
    const d = new Set(repos.map((r) => r.domain))
    return Array.from(d).sort()
  }, [repos])

  // Build the set of repos with uncommitted changes
  const uncommittedIds = useMemo(
    () => new Set(repos.filter((r) => r.gitStatus?.hasUncommittedChanges).map((r) => r.id)),
    [repos]
  )

  // Compute which nodes to show based on filters and mode
  const filteredNodeIds = useMemo(() => {
    const allIds = new Set(graph.nodes.map((n) => n.id))

    // Domain filter
    let ids = allIds
    if (selectedDomain) {
      ids = new Set(graph.nodes.filter((n) => n.domain === selectedDomain).map((n) => n.id))
    }

    // Focus mode: show selected repo + all deps and dependents
    if (mode === 'focus' && focusRepoId) {
      const focusSet = new Set<string>()
      focusSet.add(focusRepoId)

      // Walk dependencies (downward)
      const walkDeps = (id: string) => {
        const repo = graph.nodes.find((n) => n.id === id)
        if (!repo) return
        for (const dep of repo.dependencies) {
          if (dep.repoId && !focusSet.has(dep.repoId)) {
            focusSet.add(dep.repoId)
            walkDeps(dep.repoId)
          }
        }
      }

      // Walk dependents (upward)
      const walkDependents = (id: string) => {
        const repo = graph.nodes.find((n) => n.id === id)
        if (!repo) return
        for (const depId of repo.dependents) {
          if (!focusSet.has(depId)) {
            focusSet.add(depId)
            walkDependents(depId)
          }
        }
      }

      walkDeps(focusRepoId)
      walkDependents(focusRepoId)

      // Intersect with domain filter
      ids = new Set([...ids].filter((id) => focusSet.has(id)))
    }

    return ids
  }, [graph, selectedDomain, mode, focusRepoId])

  // Compute affected set for affected mode
  const affectedIds = useMemo(() => {
    if (mode !== 'affected') return new Set<string>()

    const affected = new Set<string>()
    // For each uncommitted repo, walk dependents
    const walkDependents = (id: string) => {
      const repo = graph.nodes.find((n) => n.id === id)
      if (!repo) return
      for (const depId of repo.dependents) {
        if (!affected.has(depId) && !uncommittedIds.has(depId)) {
          affected.add(depId)
          walkDependents(depId)
        }
      }
    }

    for (const id of uncommittedIds) {
      affected.add(id)
      walkDependents(id)
    }

    return affected
  }, [graph, mode, uncommittedIds])

  // Layout and apply visual states
  useEffect(() => {
    const layout = computeLayout(graph, filteredNodeIds)

    // Apply visual states
    const updatedNodes = layout.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isFocused: mode === 'focus' && node.id === focusRepoId,
        isAffected: mode === 'affected' && affectedIds.has(node.id),
        isDimmed:
          (mode === 'affected' && affectedIds.size > 0 && !affectedIds.has(node.id)) ||
          (mode === 'focus' && focusRepoId !== null && !filteredNodeIds.has(node.id)),
        hasUncommitted: uncommittedIds.has(node.id),
      },
    }))

    // Color affected edges
    const updatedEdges = layout.edges.map((edge) => {
      if (mode === 'affected' && affectedIds.has(edge.source) && affectedIds.has(edge.target)) {
        return {
          ...edge,
          style: { stroke: '#eab308', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#eab308' },
          animated: true,
        }
      }
      return edge
    })

    setNodes(updatedNodes)
    setEdges(updatedEdges)
  }, [graph, filteredNodeIds, affectedIds, mode, focusRepoId, uncommittedIds, setNodes, setEdges])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (mode === 'full' || mode === 'affected') {
        // Enter focus mode on click
        setFocusRepoId(node.id)
        setMode('focus')
      } else if (mode === 'focus') {
        if (node.id === focusRepoId) {
          // Double-click on focused node -> navigate to detail
          onSelectRepo(node.id)
        } else {
          // Click another node -> refocus
          setFocusRepoId(node.id)
        }
      }
    },
    [mode, focusRepoId, onSelectRepo]
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectRepo(node.id)
    },
    [onSelectRepo]
  )

  const handleClearFocus = useCallback(() => {
    setFocusRepoId(null)
    setMode('full')
  }, [])

  return (
    <div className="relative h-full w-full">
      <GraphControls
        domains={domains}
        selectedDomain={selectedDomain}
        onDomainChange={setSelectedDomain}
        mode={mode}
        onModeChange={(m) => {
          setMode(m)
          if (m !== 'focus') setFocusRepoId(null)
        }}
        focusRepoId={focusRepoId}
        onClearFocus={handleClearFocus}
        nodeCount={nodes.length}
        edgeCount={edges.length}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a2e" />
        <Controls
          position="bottom-right"
          className="!border-border !bg-card/90 !shadow-lg [&>button]:!border-border [&>button]:!bg-transparent [&>button]:!fill-muted-foreground hover:[&>button]:!bg-accent"
        />
        <MiniMap
          position="bottom-left"
          className="!border-border !bg-card/90"
          nodeColor={(node) => {
            const data = node.data as unknown as RepoNodeData
            if (data.hasUncommitted) return '#eab308'
            if (data.isAffected) return '#f97316'
            switch (data.type) {
              case 'kernel':
                return '#ef4444'
              case 'kernel-plugin':
                return '#f97316'
              case 'frontend-kernel':
                return '#3b82f6'
              case 'frontend-plugin':
                return '#0ea5e9'
              case 'lib':
                return '#22c55e'
              case 'app':
                return '#a855f7'
              default:
                return '#71717a'
            }
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  )
}
