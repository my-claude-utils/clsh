import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import ngrok from '@ngrok/ngrok'
// @ts-expect-error -- qrcode-terminal has no type declarations
import qrcode from 'qrcode-terminal'

export type TunnelMethod = 'ngrok' | 'tailscale' | 'ssh' | 'local'

export interface TunnelResult {
  url: string
  method: TunnelMethod
}

let activeNgrokListener: ngrok.Listener | null = null
let activeSSHProcess: ChildProcess | null = null
let activeTailscaleServe = false

// Tunnel state for monitoring and recovery
interface TunnelConfig {
  port: number
  ngrokAuthtoken?: string
  ngrokStaticDomain?: string
  forcedMethod?: TunnelMethod
  noLocalFallback?: boolean
}
let savedConfig: TunnelConfig | null = null
let currentTunnel: TunnelResult | null = null
/** Set to true when an SSH process dies after a tunnel was established. */
let tunnelDead = false

/**
 * Returns the first non-internal IPv4 address for this machine.
 * Used so phones on the same Wi-Fi can connect without any tunnel.
 */
function getLocalIP(): string | null {
  const nets = networkInterfaces()
  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return null
}

/**
 * Runs a tailscale CLI command with a hard-kill timeout.
 * Uses SIGKILL to ensure the process dies even if SIGTERM is ignored
 * (common when tailscaled runs as root and CLI needs elevated access).
 */
function runTailscaleCmd(
  args: string[],
  timeoutMs: number,
  { sudo = false } = {},
): { ok: boolean; stdout: string; stderr: string } {
  const cmd = sudo ? 'sudo' : 'tailscale'
  const cmdArgs = sudo ? ['-n', 'tailscale', ...args] : args
  const result = spawnSync(cmd, cmdArgs, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function getTailscaleFQDN(): string | null {
  const { ok, stdout } = runTailscaleCmd(['status', '--json'], 3_000)
  if (!ok) return null
  try {
    const status = JSON.parse(stdout) as { Self?: { DNSName?: string } }
    const dnsName = status.Self?.DNSName
    if (!dnsName) return null
    return dnsName.replace(/\.$/, '')
  } catch {
    return null
  }
}

/**
 * Exposes a local port via `tailscale serve`, creating an HTTPS reverse proxy
 * through the Tailscale daemon. More reliable than raw IP access in WSL2 with
 * userspace networking, where incoming connections to the Tailscale IP on
 * arbitrary ports may not be routed to local services.
 */
function setupTailscaleServe(port: number): string | null {
  console.log('  Checking tailscale serve...')
  const fqdn = getTailscaleFQDN()
  if (!fqdn) {
    console.log('  tailscale serve: could not get FQDN, skipping')
    return null
  }

  // Reset any previous serve config
  const reset = runTailscaleCmd(['serve', 'reset'], 3_000)
  if (!reset.ok) {
    // Non-fatal — try sudo reset before giving up
    const sudoReset = runTailscaleCmd(['serve', 'reset'], 3_000, { sudo: true })
    if (!sudoReset.ok) {
      console.log(
        `  tailscale serve reset failed: ${(sudoReset.stderr || reset.stderr).trim() || 'unknown error'}`,
      )
    }
  }

  let { ok, stderr } = runTailscaleCmd(['serve', '--bg', String(port)], 5_000)
  if (!ok) {
    // Daemon socket is often root-owned in WSL — retry with sudo
    console.log(`  tailscale serve failed (${stderr.trim() || 'no output'}), retrying with sudo...`)
    ;({ ok, stderr } = runTailscaleCmd(['serve', '--bg', String(port)], 5_000, { sudo: true }))
  }
  if (!ok) {
    console.log(
      `  tailscale serve: sudo also failed (${stderr.trim() || 'no output'}), falling back to raw IP`,
    )
    return null
  }

  activeTailscaleServe = true
  return `https://${fqdn}`
}

/**
 * Returns the Tailscale IP if available (100.64.0.0/10 CGNAT range).
 * Checks for interfaces named "tailscale0" (macOS/Linux) or containing "Tailscale" (Windows).
 * Tailscale traffic is end-to-end encrypted via WireGuard — no third party can see it.
 */
function getTailscaleIP(): string | null {
  const nets = networkInterfaces()
  for (const [name, interfaces] of Object.entries(nets)) {
    if (!interfaces) continue
    if (!name.toLowerCase().includes('tailscale')) continue

    for (const iface of interfaces) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      // Validate 100.64.0.0/10 range (Tailscale CGNAT)
      const parts = iface.address.split('.')
      const first = parseInt(parts[0], 10)
      const second = parseInt(parts[1], 10)
      if (first === 100 && second >= 64 && second <= 127) {
        return iface.address
      }
    }
  }
  return null
}

/**
 * Creates a public tunnel via localhost.run using SSH.
 * SSH is pre-installed on macOS — no account, no binary download required.
 * Resolves with the public HTTPS URL once the tunnel is established.
 */
function createSSHTunnel(localPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ssh = spawn('ssh', [
      '-R',
      `80:localhost:${localPort}`,
      'nokey@localhost.run',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'LogLevel=ERROR',
    ])

    activeSSHProcess = ssh

    const urlPattern = /https:\/\/[a-zA-Z0-9-]+\.(?:localhost\.run|lhr\.life)/
    let resolved = false

    const tryResolve = (data: Buffer) => {
      if (resolved) return
      const match = urlPattern.exec(data.toString())
      if (match) {
        resolved = true
        resolve(match[0])
      }
    }

    ssh.stdout.on('data', tryResolve)
    ssh.stderr.on('data', tryResolve)

    ssh.on('error', (err) => {
      if (!resolved) reject(err)
    })

    ssh.on('close', (code) => {
      activeSSHProcess = null
      if (!resolved) {
        reject(new Error(`SSH exited with code ${String(code)}`))
      } else {
        // Tunnel was established but SSH process died (network drop, sleep, etc.)
        tunnelDead = true
      }
    })

    setTimeout(() => {
      if (!resolved) {
        ssh.kill()
        reject(new Error('localhost.run tunnel timed out after 12s'))
      }
    }, 12_000)
  })
}

/**
 * Creates a public tunnel to expose the local server.
 *
 * Priority order:
 *  1. ngrok     — if NGROK_AUTHTOKEN is set (most reliable, needs free account)
 *  2. tailscale — if Tailscale interface detected (E2E encrypted, no third party)
 *  3. SSH       — localhost.run via SSH, zero install, no account needed
 *  4. local     — local network IP, works when phone is on the same Wi-Fi
 */
export async function createTunnel(
  port: number,
  ngrokAuthtoken?: string,
  ngrokStaticDomain?: string,
  forcedMethod?: TunnelMethod,
  noLocalFallback?: boolean,
): Promise<TunnelResult> {
  // Store config for recreation on tunnel death
  savedConfig = { port, ngrokAuthtoken, ngrokStaticDomain, forcedMethod, noLocalFallback }
  tunnelDead = false

  // 1. ngrok — best reliability, optional free-account token
  if (
    forcedMethod !== 'tailscale' &&
    forcedMethod !== 'ssh' &&
    forcedMethod !== 'local' &&
    ngrokAuthtoken
  ) {
    try {
      const ngrokOpts: Parameters<typeof ngrok.forward>[0] = {
        addr: port,
        authtoken: ngrokAuthtoken,
      }
      if (ngrokStaticDomain) ngrokOpts.domain = ngrokStaticDomain
      const listener = await ngrok.forward(ngrokOpts)
      activeNgrokListener = listener
      const url = listener.url()
      if (url) {
        currentTunnel = { url, method: 'ngrok' }
        return currentTunnel
      }
    } catch {
      // ngrok failed — try Tailscale
    }
  }

  // 2. Tailscale — E2E encrypted via WireGuard, no third party sees traffic
  //    Tries `tailscale serve` first (HTTPS reverse proxy through daemon), then
  //    falls back to raw IP. `tailscale serve` is more reliable in WSL2 with
  //    userspace networking where raw IP incoming connections may not work.
  if (forcedMethod !== 'ssh' && forcedMethod !== 'local') {
    // 2a. Try tailscale serve (HTTPS proxy — works with userspace networking)
    const serveUrl = setupTailscaleServe(port)
    if (serveUrl) {
      console.log('  Tailscale serve active (HTTPS proxy)')
      currentTunnel = { url: serveUrl, method: 'tailscale' }
      return currentTunnel
    }

    // 2b. Fall back to raw Tailscale IP
    const tailscaleIP = getTailscaleIP()
    if (tailscaleIP) {
      const url = `http://${tailscaleIP}:${port}`
      currentTunnel = { url, method: 'tailscale' }
      return currentTunnel
    }
    if (forcedMethod === 'tailscale') {
      throw new Error('TUNNEL=tailscale but no Tailscale interface found. Is Tailscale running?')
    }
  }

  // 3. localhost.run via SSH (pre-installed on macOS, no account needed)
  if (forcedMethod === 'local') {
    const localIp = getLocalIP()
    const url = localIp ? `http://${localIp}:${port}` : `http://localhost:${port}`
    currentTunnel = { url, method: 'local' }
    return currentTunnel
  }
  try {
    const url = await createSSHTunnel(port)
    currentTunnel = { url, method: 'ssh' }
    return currentTunnel
  } catch {
    // SSH failed — fall back to local
  }

  // 4. Local network — works on same Wi-Fi, no internet required
  if (noLocalFallback) {
    throw new Error(
      'All tunnel methods failed and CLSH_NO_LOCAL_FALLBACK=1 is set. ' +
        'Refusing to fall back to plaintext HTTP. Set NGROK_AUTHTOKEN or unset CLSH_NO_LOCAL_FALLBACK.',
    )
  }
  console.warn('  ⚠  WARNING: Falling back to plaintext HTTP (no encrypted tunnel available)')
  const localIp = getLocalIP()
  const url = localIp ? `http://${localIp}:${port}` : `http://localhost:${port}`
  currentTunnel = { url, method: 'local' }
  return currentTunnel
}

/**
 * Returns the current tunnel URL, or null if no tunnel is active.
 */
export function getTunnelUrl(): string | null {
  return currentTunnel?.url ?? null
}

/**
 * Prints a clean startup banner with QR code and access info.
 */
export function printAccessInfo(
  publicUrl: string,
  bootstrapToken: string,
  method: TunnelMethod,
): void {
  const authUrl = `${publicUrl}/#token=${bootstrapToken}`

  // ANSI orange (256-color: 208)
  const o = '\x1b[38;5;208m'
  const dim = '\x1b[2m'
  const r = '\x1b[0m'

  const textLines = [
    '', // top padding
    `${o}    ██████╗██╗     ███████╗██╗  ██╗${r}`,
    `${o}   ██╔════╝██║     ██╔════╝██║  ██║${r}`,
    `${o}   ██║     ██║     ███████╗███████║${r}`,
    `${o}   ██║     ██║     ╚════██║██╔══██║${r}`,
    `${o}   ╚██████╗███████╗███████║██║  ██║${r}`,
    `${o}    ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝${r}`,
    `${dim}              clsh.dev${r}`,
    ``,
    `${o}  Scan to connect ${dim}(token embedded in QR)${r}`,
    ``,
    `${o}  URL:   ${r}${publicUrl}`,
    `${o}  Token: ${r}${bootstrapToken}  ${dim}(one-time, expires in 5 min)${r}`,
  ]

  const modeLabel =
    method === 'ngrok'
      ? 'remote (ngrok)'
      : method === 'tailscale'
        ? 'remote (tailscale)'
        : method === 'ssh'
          ? 'remote (ssh)'
          : 'local Wi-Fi only'

  textLines.push(`${o}  Mode:  ${r}${modeLabel}`)

  if (method === 'local') {
    textLines.push('')
    textLines.push(`${o}  ⚠  Local mode — phone must be on same Wi-Fi.${r}`)
    textLines.push(`${dim}     Set NGROK_AUTHTOKEN in .env for remote access.${r}`)
  }

  textLines.push('')
  textLines.push(`${dim}  GitHub: https://github.com/my-claude-utils/clsh${r}`)

  console.clear()

  qrcode.generate(authUrl, { small: true }, (code: string) => {
    const qrLines = code.split('\n')
    // Remove the trailing empty line if it exists
    if (qrLines.length > 0 && qrLines[qrLines.length - 1] === '') {
      qrLines.pop()
    }
    const qrWidth = qrLines.length > 0 ? qrLines[0].length : 0

    const maxLines = Math.max(qrLines.length, textLines.length)
    console.log('')
    for (let i = 0; i < maxLines; i++) {
      const qrPart = qrLines[i] || ''.padEnd(qrWidth, ' ')
      const textPart = textLines[i] || ''
      // Add 4 spaces padding between QR and text
      console.log(`  ${qrPart}    ${textPart}`)
    }
    console.log('')
  })
}

// --------------- Tunnel monitoring and recovery ---------------

/**
 * Checks if the tunnel is alive by hitting our own health endpoint through it.
 * Verifies the full path: server → tunnel → internet → back.
 */
async function isTunnelAlive(): Promise<boolean> {
  if (tunnelDead || !currentTunnel) return false
  // Tailscale and local IPs are stable — no health check needed
  if (currentTunnel.method === 'local' || currentTunnel.method === 'tailscale') return true
  try {
    const res = await fetch(`${currentTunnel.url}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Closes the current tunnel and creates a new one using the saved config.
 */
async function recreate(): Promise<TunnelResult | null> {
  if (!savedConfig) return null
  await closeTunnel()
  return createTunnel(
    savedConfig.port,
    savedConfig.ngrokAuthtoken,
    savedConfig.ngrokStaticDomain,
    savedConfig.forcedMethod,
    savedConfig.noLocalFallback,
  )
}

/**
 * Starts a background monitor that detects system sleep/wake and SSH tunnel
 * death, then automatically recreates the tunnel.
 *
 * Uses a "time drift" detector: if the interval timer fires after a gap much
 * larger than expected, the system was sleeping. On wake, it waits for the
 * network to stabilize, checks tunnel health, and recreates if necessary.
 *
 * @param onRecovered — called when the tunnel is recreated with a new URL
 * @returns cleanup function to stop the monitor
 */
export function startTunnelMonitor(
  onRecovered: (url: string, method: TunnelMethod) => void,
): () => void {
  const INTERVAL_MS = 5_000
  const WAKE_THRESHOLD_MS = 15_000
  let lastTick = Date.now()
  let recovering = false

  const check = async () => {
    if (recovering) return

    const now = Date.now()
    const gap = now - lastTick - INTERVAL_MS
    lastTick = now

    const woke = gap > WAKE_THRESHOLD_MS
    if (!woke && !tunnelDead) return

    recovering = true

    try {
      if (woke) {
        console.log(
          `  Wake detected (${Math.round((gap + INTERVAL_MS) / 1000)}s gap), checking tunnel...`,
        )
        // Give the network interface a moment to come back up
        await new Promise<void>((r) => setTimeout(r, 3_000))
      } else {
        console.log('  Tunnel process died, restarting...')
        await new Promise<void>((r) => setTimeout(r, 2_000))
      }

      const alive = tunnelDead ? false : await isTunnelAlive()

      if (alive) {
        console.log('  Tunnel OK')
      } else {
        console.log('  Tunnel down, recreating...')
        const result = await recreate()
        if (result) {
          console.log(`  Tunnel recovered: ${result.url} (${result.method})`)
          onRecovered(result.url, result.method)
        }
      }
    } catch (err) {
      console.error('  Tunnel recovery failed:', err)
    }

    recovering = false
  }

  const timer = setInterval(() => void check(), INTERVAL_MS)
  return () => clearInterval(timer)
}

/**
 * Closes any active tunnels (ngrok listener and/or SSH process).
 */
export async function closeTunnel(): Promise<void> {
  if (activeNgrokListener) {
    try {
      await ngrok.disconnect()
    } catch {
      /* ignore */
    }
    activeNgrokListener = null
  }
  if (activeSSHProcess) {
    activeSSHProcess.kill()
    activeSSHProcess = null
  }
  if (activeTailscaleServe) {
    const { ok } = runTailscaleCmd(['serve', 'reset'], 3_000)
    if (!ok) runTailscaleCmd(['serve', 'reset'], 3_000, { sudo: true })
    activeTailscaleServe = false
  }
  tunnelDead = false
}

/**
 * Registers SIGINT/SIGTERM handlers for graceful shutdown.
 */
export function registerShutdownHandlers(cleanup: () => void | Promise<void>): void {
  const shutdown = async (signal: string) => {
    console.log(`\n  Received ${signal}, shutting down...`)
    try {
      await cleanup()
      await closeTunnel()
    } catch (err) {
      console.error('  Error during shutdown:', err)
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}
