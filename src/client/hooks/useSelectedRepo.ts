/**
 * Hook to manage the currently selected repo in the sidebar.
 */

import { useCallback, useState } from 'react'

export function useSelectedRepo() {
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)

  const selectRepo = useCallback((id: string | null) => {
    setSelectedRepoId(id)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedRepoId(null)
  }, [])

  return { selectedRepoId, selectRepo, clearSelection }
}
