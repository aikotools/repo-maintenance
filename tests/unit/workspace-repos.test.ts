import { describe, it, expect } from 'vitest'
import {
  commonPrefixDir,
  githubOrgFromUrl,
  parseWorkspaceRepos,
  serializeWorkspaceRepos,
} from '../../src/server/services/workspace-repos'

const SAMPLE = `# header comment
repositories:
  repo/backend/core-backend:
    type: git
    url: git@github.com:xhubio-saas/core-backend.git
    version: main
  repo/integrations/landing:
    type: git
    url: git@github.com:xhubio-saas/landing.git
    version: feature/country-landing-pages
  # repo/integrations/skipped-one — SKIPPED: kein origin-Remote gesetzt
`

describe('workspace.repos parser', () => {
  it('parses entries with path, url and branch', () => {
    const { entries } = parseWorkspaceRepos(SAMPLE)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      path: 'repo/backend/core-backend',
      url: 'git@github.com:xhubio-saas/core-backend.git',
      branch: 'main',
    })
    expect(entries[1]!.branch).toBe('feature/country-landing-pages')
  })

  it('collects SKIPPED entries as ignored repo names', () => {
    expect(parseWorkspaceRepos(SAMPLE).skipped).toEqual(['skipped-one'])
  })

  it('round-trips through serialize → parse', () => {
    const { entries } = parseWorkspaceRepos(SAMPLE)
    const reparsed = parseWorkspaceRepos(serializeWorkspaceRepos(entries))
    expect(reparsed.entries).toEqual(entries)
  })

  it('finds the common prefix directory', () => {
    expect(commonPrefixDir(['repo/backend/x', 'repo/frontend/y'])).toBe('repo')
    expect(commonPrefixDir(['flat-a', 'flat-b'])).toBe('')
  })

  it('extracts github org from ssh and https urls', () => {
    expect(githubOrgFromUrl('git@github.com:org/repo.git')).toBe('org')
    expect(githubOrgFromUrl('https://github.com/org/repo.git')).toBe('org')
    expect(githubOrgFromUrl('git@gitlab.com:org/repo.git')).toBeNull()
  })
})
