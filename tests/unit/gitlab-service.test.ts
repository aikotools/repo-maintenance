import { describe, it, expect } from 'vitest'
import {
  gitlabApiBase,
  groupRelativePath,
  listGroupProjects,
} from '../../src/server/services/gitlab-service'

describe('gitlab-service', () => {
  it('normalizes the API base', () => {
    expect(gitlabApiBase()).toBe('https://gitlab.com/api/v4')
    expect(gitlabApiBase('gitlab.firma.de')).toBe('https://gitlab.firma.de/api/v4')
    expect(gitlabApiBase('https://gl.example.com/')).toBe('https://gl.example.com/api/v4')
  })

  it('strips the group prefix so structure mirrors under rootFolder', () => {
    expect(groupRelativePath('mygroup/backend/core', 'mygroup')).toBe('backend/core')
    expect(groupRelativePath('mygroup/proj', '/mygroup/')).toBe('proj')
    // unrelated path falls back to itself
    expect(groupRelativePath('other/proj', 'mygroup')).toBe('other/proj')
  })

  it('lists projects across paginated responses with the auth header', async () => {
    const seen: { url: string; token?: string }[] = []
    const pages: Record<number, unknown[]> = {
      1: [
        {
          path_with_namespace: 'g/backend/core',
          ssh_url_to_repo: 'git@gl:g/backend/core.git',
          http_url_to_repo: 'https://gl/g/backend/core.git',
          default_branch: 'main',
        },
        // archived + marked-for-deletion projects must be filtered out
        {
          path_with_namespace: 'g/old/archived',
          ssh_url_to_repo: 'git@gl:g/old/archived.git',
          http_url_to_repo: 'https://gl/g/old/archived.git',
          archived: true,
        },
        {
          path_with_namespace: 'g/old/pending-delete',
          ssh_url_to_repo: 'git@gl:g/old/pending-delete.git',
          http_url_to_repo: 'https://gl/g/old/pending-delete.git',
          marked_for_deletion_on: '2026-01-01',
        },
      ],
      2: [
        {
          path_with_namespace: 'g/web/app',
          ssh_url_to_repo: 'git@gl:g/web/app.git',
          http_url_to_repo: 'https://gl/g/web/app.git',
          default_branch: 'develop',
        },
      ],
    }
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
      seen.push({ url, token: init?.headers?.['PRIVATE-TOKEN'] })
      const page = Number(new URL(url).searchParams.get('page'))
      const data = pages[page] ?? []
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => '',
        headers: { get: (n: string) => (n === 'x-next-page' && page === 1 ? '2' : null) },
      }
    }

    const projects = await listGroupProjects({ group: 'g', token: 'secret' }, fetchImpl)
    // page 1 had 3 entries but archived + pending-deletion are filtered out
    expect(projects).toHaveLength(2)
    expect(projects.map((p) => p.pathWithNamespace)).toEqual(['g/backend/core', 'g/web/app'])
    expect(projects[1]).toEqual({
      pathWithNamespace: 'g/web/app',
      sshUrl: 'git@gl:g/web/app.git',
      httpUrl: 'https://gl/g/web/app.git',
      defaultBranch: 'develop',
    })
    expect(seen).toHaveLength(2)
    expect(seen[0]!.token).toBe('secret')
    expect(seen[0]!.url).toContain('include_subgroups=true')
  })

  it('throws with status on API error', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => 'Group Not Found',
      headers: { get: () => null },
    })
    await expect(listGroupProjects({ group: 'nope' }, fetchImpl)).rejects.toThrow(/404/)
  })
})
