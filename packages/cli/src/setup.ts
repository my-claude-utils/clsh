// clsh setup wizard — configures ngrok for a permanent URL

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

interface ClshConfig {
  ngrokAuthtoken?: string;
  ngrokStaticDomain?: string;
  port?: number;
}

const CONFIG_DIR = join(homedir(), '.clsh');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function readConfig(): ClshConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as ClshConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: ClshConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
  clsh setup
  ----------

  clsh works out of the box with a free SSH tunnel (localhost.run).
  For a permanent URL that survives restarts, set up ngrok (free).
`);

  const wantNgrok = await prompt(rl, '  Do you want to set up ngrok? (y/N) ');

  if (wantNgrok.toLowerCase() !== 'y' && wantNgrok.toLowerCase() !== 'yes') {
    console.log('\n  Skipped. Run `npx clsh` to start with the default SSH tunnel.\n');
    rl.close();
    return;
  }

  console.log(`
  1. Sign up at https://ngrok.com (free)
  2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
`);

  const authtoken = await prompt(rl, '  Paste your ngrok authtoken: ');

  if (!authtoken) {
    console.log('\n  No authtoken provided. Run `npx clsh setup` again when ready.\n');
    rl.close();
    return;
  }

  const config = readConfig();
  config.ngrokAuthtoken = authtoken;
  writeConfig(config);
  console.log(`  Saved to ${CONFIG_PATH}`);

  console.log(`
  3. Get a free static domain at https://dashboard.ngrok.com/domains
     (one free domain per account)
`);

  const domain = await prompt(rl, '  Paste your static domain (e.g. your-name.ngrok-free.dev): ');

  if (domain) {
    config.ngrokStaticDomain = domain;
    writeConfig(config);
    console.log(`  Saved to ${CONFIG_PATH}`);
  }

  console.log(`
  Done! Run \`npx clsh\` to start with your permanent ngrok URL.
  Guide: https://github.com/my-claude-utils/clsh/blob/main/docs/ngrok-setup.md
`);

  rl.close();
}
