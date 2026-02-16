/**
 * Shared process spawning helper using Node.js child_process.
 * Replaces all Bun.spawn usage for Node.js compatibility.
 */

import { spawn } from 'child_process'

export interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Spawn a process and collect stdout/stderr.
 * Returns a promise that resolves when the process exits.
 */
export function spawnProcess(
  cmd: string[],
  options?: { cwd?: string; signal?: AbortSignal }
): { promise: Promise<SpawnResult>; kill: () => void } {
  const [command, ...args] = cmd
  const proc = spawn(command!, args, {
    cwd: options?.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const kill = () => {
    try {
      proc.kill()
    } catch {
      // process may already be dead
    }
  }

  // Wire up abort signal
  if (options?.signal) {
    if (options.signal.aborted) {
      kill()
    } else {
      options.signal.addEventListener('abort', kill, { once: true })
    }
  }

  const promise = new Promise<SpawnResult>((resolve, reject) => {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []

    proc.stdout?.on('data', (chunk: Uint8Array) => stdoutChunks.push(chunk))
    proc.stderr?.on('data', (chunk: Uint8Array) => stderrChunks.push(chunk))

    proc.on('error', (err) => reject(err))

    proc.on('close', (code) => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', kill)
      }
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      })
    })
  })

  return { promise, kill }
}
