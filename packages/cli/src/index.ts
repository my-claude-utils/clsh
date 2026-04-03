#!/usr/bin/env node
// clsh CLI — one command to start your terminal server

// Prevent the agent from auto-running on import
process.env['CLSH_CLI'] = '1'

// clsh requires Unix PTY and tmux — on Windows, the agent must run inside WSL
if (process.platform === 'win32') {
  console.error(`
  ⚠  clsh requires Unix PTY and tmux, which are not available on Windows.

  Run clsh from a WSL terminal instead:

    wsl
    cd /mnt/d/Dev/clsh    # or wherever your repo lives
    npm install            # compiles node-pty for Linux
    npm run dev

  This gives you native Unix PTY, tmux session persistence, and Tailscale access.
`)
  process.exit(1)
}

const args = process.argv.slice(2)

if (args[0] === 'setup') {
  const { runSetup } = await import('./setup.js')
  await runSetup()
} else if (args[0] === 'notify-test') {
  const { runNotifyTest } = await import('./notify-test.js')
  await runNotifyTest()
} else if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
  clsh — real terminal on your phone

  Usage:
    npx clsh-dev              Start the clsh server
    npx clsh-dev --notify     Start with notifications enabled
    npx clsh-dev setup        Configure ngrok for a permanent URL
    npx clsh-dev notify-test  Send a test notification to all channels
    npx clsh-dev --help       Show this help message

  Docs: https://github.com/cshumac/clsh
`)
} else if (args[0] === '--version' || args[0] === '-v') {
  const { readFileSync } = await import('node:fs')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
    version: string
  }
  console.log(`clsh ${pkg.version}`)
} else {
  const { main } = await import('@clsh/agent')
  await main()
}
