/**
 * GitLab group discovery: list every project in a group (including subgroups)
 * so Pull All can clone them mirroring the GitLab group/subgroup structure.
 *
 * Uses the GitLab REST API v4 with the global `fetch` (no HTTP dependency).
 * ponytail: fetchImpl is injectable so the logic is unit-testable without network.
 */

export interface GitLabProject {
  /** Full namespace path, e.g. "mygroup/backend/core" */
  pathWithNamespace: string
  sshUrl: string
  httpUrl: string
  defaultBranch: string
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
  headers: { get: (name: string) => string | null }
}>

/** Normalize a host into the API base, e.g. "gitlab.com" → "https://gitlab.com/api/v4". */
export function gitlabApiBase(host?: string): string {
  let h = (host || 'https://gitlab.com').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(h)) h = `https://${h}`
  return `${h}/api/v4`
}

/** Strip the configured group prefix so the path mirrors the structure under rootFolder. */
export function groupRelativePath(pathWithNamespace: string, group: string): string {
  const g = group.replace(/^\/+|\/+$/g, '')
  return pathWithNamespace.startsWith(`${g}/`)
    ? pathWithNamespace.slice(g.length + 1)
    : pathWithNamespace
}

/** List all (non-archived) projects in a group and its subgroups, following pagination. */
export async function listGroupProjects(
  opts: { host?: string; group: string; token?: string },
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<GitLabProject[]> {
  const base = gitlabApiBase(opts.host)
  const enc = encodeURIComponent(opts.group.replace(/^\/+|\/+$/g, ''))
  const headers: Record<string, string> = opts.token ? { 'PRIVATE-TOKEN': opts.token } : {}

  const projects: GitLabProject[] = []
  let page = 1
  // Hard page cap so a misconfigured host can't loop forever
  for (let guard = 0; guard < 100; guard++) {
    const url = `${base}/groups/${enc}/projects?include_subgroups=true&archived=false&per_page=100&page=${page}`
    const res = await fetchImpl(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GitLab API ${res.status} for group "${opts.group}": ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break
    for (const p of data as Record<string, string>[]) {
      projects.push({
        pathWithNamespace: p.path_with_namespace!,
        sshUrl: p.ssh_url_to_repo!,
        httpUrl: p.http_url_to_repo!,
        defaultBranch: p.default_branch || 'main',
      })
    }
    const next = res.headers.get('x-next-page')
    if (!next) break
    page = Number(next)
  }
  return projects
}
