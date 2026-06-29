/**
 * Detect the git host provider from a single "organization / group URL" so the
 * user enters one field and the tool figures out GitHub vs GitLab automatically.
 *
 *   https://github.com/myorg        → github, host github.com, owner "myorg"
 *   https://gitlab.com/grp/sub      → gitlab, host gitlab.com, owner "grp/sub"
 *   https://gitlab.firma.de/team    → gitlab (self-hosted), owner "team"
 *   myorg                           → github (bare owner, backward compatible)
 */

export interface RepoSource {
  provider: 'github' | 'gitlab'
  /** Base URL incl. scheme, e.g. "https://gitlab.firma.de" */
  host: string
  /** Org (GitHub) or full group path incl. subgroups (GitLab) */
  owner: string
}

export function parseRepoSource(input: string | undefined): RepoSource | null {
  const raw = (input || '').trim()
  if (!raw) return null

  // Bare handle without host/path → assume a GitHub org (backward compatible).
  if (!/^https?:\/\//.test(raw) && !raw.includes('/') && !raw.includes('.')) {
    return { provider: 'github', host: 'https://github.com', owner: raw.replace(/^@+/, '') }
  }

  const s = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }

  const owner = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  if (!owner) return null

  const provider = u.hostname === 'github.com' ? 'github' : 'gitlab'
  return { provider, host: `${u.protocol}//${u.host}`, owner }
}
