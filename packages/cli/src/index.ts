#!/usr/bin/env node
// clsh CLI — one command to start your terminal server

// Prevent the agent from auto-running on import
process.env['CLSH_CLI'] = '1';

const args = process.argv.slice(2);

if (args[0] === 'setup') {
  const { runSetup } = await import('./setup.js');
  await runSetup();
} else if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
  clsh — real terminal on your phone

  Usage:
    npx clsh-dev          Start the clsh server
    npx clsh-dev setup    Configure ngrok for a permanent URL
    npx clsh-dev --help   Show this help message

  Docs: https://github.com/my-claude-utils/clsh
`);
} else if (args[0] === '--version' || args[0] === '-v') {
  // Read version from package.json at build time isn't worth the complexity.
  // Just hardcode and bump with releases.
  console.log('clsh 0.1.0');
} else {
  const { main } = await import('@clsh/agent');
  await main();
}
