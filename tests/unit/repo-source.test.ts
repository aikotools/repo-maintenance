import { describe, it, expect } from 'vitest'
import { parseRepoSource } from '../../src/server/services/repo-source'

describe('parseRepoSource (auto-detect provider)', () => {
  it('detects GitHub from github.com URLs', () => {
    expect(parseRepoSource('https://github.com/myorg')).toEqual({
      provider: 'github',
      host: 'https://github.com',
      owner: 'myorg',
    })
  })

  it('detects GitLab from gitlab.com and self-hosted hosts', () => {
    expect(parseRepoSource('https://gitlab.com/grp/sub')).toEqual({
      provider: 'gitlab',
      host: 'https://gitlab.com',
      owner: 'grp/sub',
    })
    expect(parseRepoSource('gitlab.firma.de/team')).toEqual({
      provider: 'gitlab',
      host: 'https://gitlab.firma.de',
      owner: 'team',
    })
  })

  it('treats a bare handle as a GitHub org', () => {
    expect(parseRepoSource('myorg')).toEqual({
      provider: 'github',
      host: 'https://github.com',
      owner: 'myorg',
    })
    expect(parseRepoSource('@myorg')?.owner).toBe('myorg')
  })

  it('strips trailing slash and .git', () => {
    expect(parseRepoSource('https://github.com/myorg/')?.owner).toBe('myorg')
    expect(parseRepoSource('https://gitlab.com/grp/sub.git')?.owner).toBe('grp/sub')
  })

  it('returns null for empty input', () => {
    expect(parseRepoSource('')).toBeNull()
    expect(parseRepoSource(undefined)).toBeNull()
  })
})
