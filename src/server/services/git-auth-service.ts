/**
 * Service for managing HTTPS git authentication.
 * Stores PAT securely in the OS credential store:
 *   - macOS: Keychain (via `security`)
 *   - Windows: Credential Manager (via PowerShell)
 *   - Linux: libsecret (via `secret-tool`)
 */

import { platform } from 'os'
import { spawnProcess } from './process'

const CREDENTIAL_ACCOUNT = 'repo-maintenance'
const CREDENTIAL_SERVICE = 'github-pat'

export class GitAuthService {
  private readonly os = platform()

  /**
   * Check if HTTPS auth is available via gh CLI or stored PAT.
   */
  async checkAuth(): Promise<{ ok: boolean; method: 'gh' | 'pat' | 'none' }> {
    // 1. Check gh CLI auth
    if (await this.isGhAuthenticated()) {
      return { ok: true, method: 'gh' }
    }

    // 2. Check stored PAT
    const pat = await this.getToken()
    if (pat) {
      return { ok: true, method: 'pat' }
    }

    return { ok: false, method: 'none' }
  }

  /**
   * Store a PAT in the OS credential store.
   */
  async storeToken(token: string): Promise<void> {
    switch (this.os) {
      case 'darwin':
        return this.storeMacOS(token)
      case 'win32':
        return this.storeWindows(token)
      default:
        return this.storeLinux(token)
    }
  }

  /**
   * Read PAT from the OS credential store.
   */
  async getToken(): Promise<string | null> {
    try {
      switch (this.os) {
        case 'darwin':
          return await this.getTokenMacOS()
        case 'win32':
          return await this.getTokenWindows()
        default:
          return await this.getTokenLinux()
      }
    } catch {
      return null
    }
  }

  /**
   * Delete PAT from the OS credential store.
   */
  async deleteToken(): Promise<void> {
    switch (this.os) {
      case 'darwin':
        return this.deleteMacOS()
      case 'win32':
        return this.deleteWindows()
      default:
        return this.deleteLinux()
    }
  }

  /**
   * Build the HTTPS clone URL with embedded token.
   */
  async buildAuthUrl(org: string, name: string): Promise<string> {
    // Try gh CLI token first
    const ghToken = await this.getGhToken()
    if (ghToken) {
      return `https://x-access-token:${ghToken}@github.com/${org}/${name}.git`
    }

    // Try stored PAT
    const pat = await this.getToken()
    if (pat) {
      return `https://x-access-token:${pat}@github.com/${org}/${name}.git`
    }

    // No auth available — return plain URL (will likely fail for private repos)
    return `https://github.com/${org}/${name}.git`
  }

  /**
   * Get environment variables for git processes to prevent hanging.
   */
  getGitEnv(): Record<string, string> {
    return { GIT_TERMINAL_PROMPT: '0' }
  }

  // ── gh CLI helpers ──

  private async isGhAuthenticated(): Promise<boolean> {
    try {
      const { promise } = spawnProcess(['gh', 'auth', 'status'])
      const result = await promise
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  private async getGhToken(): Promise<string | null> {
    try {
      const { promise } = spawnProcess(['gh', 'auth', 'token'])
      const result = await promise
      if (result.exitCode !== 0) return null
      const token = result.stdout.trim()
      return token || null
    } catch {
      return null
    }
  }

  // ── macOS: Keychain via `security` ──

  private async storeMacOS(token: string): Promise<void> {
    // Delete existing entry first (ignore errors if it doesn't exist)
    await spawnProcess([
      'security',
      'delete-generic-password',
      '-a',
      CREDENTIAL_ACCOUNT,
      '-s',
      CREDENTIAL_SERVICE,
    ]).promise.catch(() => {})

    const result = await spawnProcess([
      'security',
      'add-generic-password',
      '-a',
      CREDENTIAL_ACCOUNT,
      '-s',
      CREDENTIAL_SERVICE,
      '-w',
      token,
    ]).promise

    if (result.exitCode !== 0) {
      throw new Error(`Failed to store token in Keychain: ${result.stderr.trim()}`)
    }
  }

  private async getTokenMacOS(): Promise<string | null> {
    const result = await spawnProcess([
      'security',
      'find-generic-password',
      '-a',
      CREDENTIAL_ACCOUNT,
      '-s',
      CREDENTIAL_SERVICE,
      '-w',
    ]).promise

    if (result.exitCode !== 0) return null
    const token = result.stdout.trim()
    return token || null
  }

  private async deleteMacOS(): Promise<void> {
    await spawnProcess([
      'security',
      'delete-generic-password',
      '-a',
      CREDENTIAL_ACCOUNT,
      '-s',
      CREDENTIAL_SERVICE,
    ]).promise.catch(() => {})
  }

  // ── Windows: Credential Manager via PowerShell ──

  private async storeWindows(token: string): Promise<void> {
    // Use cmdkey to store the credential
    // Delete first, then add
    await spawnProcess([
      'cmdkey',
      `/delete:${CREDENTIAL_SERVICE}`,
    ]).promise.catch(() => {})

    const result = await spawnProcess([
      'cmdkey',
      `/generic:${CREDENTIAL_SERVICE}`,
      `/user:${CREDENTIAL_ACCOUNT}`,
      `/pass:${token}`,
    ]).promise

    if (result.exitCode !== 0) {
      throw new Error(`Failed to store token in Credential Manager: ${result.stderr.trim()}`)
    }
  }

  private async getTokenWindows(): Promise<string | null> {
    // cmdkey /list can't retrieve the password, use PowerShell CredentialManager
    const script = `
      $cred = Get-StoredCredential -Target '${CREDENTIAL_SERVICE}' -ErrorAction SilentlyContinue
      if ($cred) { $cred.GetNetworkCredential().Password } else { '' }
    `.trim()

    const result = await spawnProcess([
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]).promise

    if (result.exitCode !== 0) {
      // Fallback: try with cmdkey-based approach using a helper
      return this.getTokenWindowsFallback()
    }

    const token = result.stdout.trim()
    return token || null
  }

  private async getTokenWindowsFallback(): Promise<string | null> {
    // If CredentialManager module isn't available, use .NET directly
    const script = `
      Add-Type -AssemblyName System.Runtime.InteropServices
      $target = '${CREDENTIAL_SERVICE}'
      [void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
      try {
        $vault = New-Object Windows.Security.Credentials.PasswordVault
        $cred = $vault.Retrieve($target, '${CREDENTIAL_ACCOUNT}')
        $cred.RetrievePassword()
        Write-Output $cred.Password
      } catch { Write-Output '' }
    `.trim()

    const result = await spawnProcess([
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]).promise

    const token = result.stdout.trim()
    return token || null
  }

  private async deleteWindows(): Promise<void> {
    await spawnProcess([
      'cmdkey',
      `/delete:${CREDENTIAL_SERVICE}`,
    ]).promise.catch(() => {})
  }

  // ── Linux: libsecret via `secret-tool` ──

  private async storeLinux(token: string): Promise<void> {
    // secret-tool reads the secret from stdin
    // We use echo piped to secret-tool, but since spawnProcess ignores stdin,
    // we use a shell wrapper
    const result = await spawnProcess([
      'bash',
      '-c',
      `echo -n '${token.replace(/'/g, "'\\''")}' | secret-tool store --label='${CREDENTIAL_SERVICE}' service '${CREDENTIAL_SERVICE}' account '${CREDENTIAL_ACCOUNT}'`,
    ]).promise

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to store token via secret-tool: ${result.stderr.trim()}. ` +
          'Ensure libsecret-tools is installed (apt install libsecret-tools).'
      )
    }
  }

  private async getTokenLinux(): Promise<string | null> {
    const result = await spawnProcess([
      'secret-tool',
      'lookup',
      'service',
      CREDENTIAL_SERVICE,
      'account',
      CREDENTIAL_ACCOUNT,
    ]).promise

    if (result.exitCode !== 0) return null
    const token = result.stdout.trim()
    return token || null
  }

  private async deleteLinux(): Promise<void> {
    await spawnProcess([
      'secret-tool',
      'clear',
      'service',
      CREDENTIAL_SERVICE,
      'account',
      CREDENTIAL_ACCOUNT,
    ]).promise.catch(() => {})
  }
}
