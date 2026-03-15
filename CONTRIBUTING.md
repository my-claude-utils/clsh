# Contributing to clsh

Thanks for your interest in contributing to clsh! This guide will help you get set up and understand how we work.

> **Not a contributor?** Just want to use clsh? Run `npx clsh` and you're done. See the [README](README.md) for details.

## Development Setup

```bash
git clone https://github.com/my-claude-utils/clsh
cd clsh
cp .env.example .env          # Add your NGROK_AUTHTOKEN
npm install                    # Installs all workspace deps + compiles node-pty
npm run dev                    # Starts agent + web in parallel via Turborepo
```

The agent runs on `http://localhost:4030` and the web frontend on `http://localhost:4031`.

## Project Structure

```
clsh/
├── packages/
│   ├── agent/      # Backend — PTY manager, WebSocket server, auth, ngrok tunnel
│   ├── web/        # Frontend — React + xterm.js + MacBook Pro UI
│   └── cli/        # CLI wrapper — bootstraps and manages the agent
├── apps/
│   └── landing/    # Landing page at clsh.dev (static HTML)
├── turbo.json      # Turborepo task configuration
└── package.json    # Root workspace config
```

## Development Workflow

- **Agent** (`packages/agent`): Uses `tsx watch` for auto-reload on file changes
- **Web** (`packages/web`): Uses Vite with HMR for instant updates
- **WebSocket proxy**: Vite dev server proxies `/ws` to the agent on port 4030
- **Turborepo**: `npm run dev` runs both in parallel; `npm run build` builds in dependency order

## Coding Standards

- **TypeScript**: Strict mode enabled in all packages
- **Prettier**: Auto-formats on save — config in `.prettierrc`
  - No semicolons, single quotes, trailing commas, 100 char width
- **ESLint**: Flat config (`eslint.config.js`) with `typescript-eslint` strict rules
- **EditorConfig**: 2-space indent, LF line endings, UTF-8

Run checks locally:

```bash
npm run lint          # ESLint across all packages
npm run typecheck     # TypeScript type checking
npm run format:check  # Prettier formatting check
npm run build         # Full build
```

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `chore:` — Maintenance, dependency updates
- `refactor:` — Code restructuring without behavior change
- `test:` — Adding or updating tests
- `style:` — Formatting, whitespace (no code change)

Examples:

```
feat: add mobile tab navigation for terminal panes
fix: prevent WebSocket reconnect loop on auth failure
docs: add ngrok setup instructions to README
```

## Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation

## Pull Request Guidelines

1. **Create a branch** from `main` using the naming convention above
2. **Write a clear description** of what changed and why
3. **Include a testing checklist** — what did you test manually?
4. **Add screenshots** for any UI changes
5. **Ensure CI passes** — lint, typecheck, and build must all succeed
6. **Keep PRs focused** — one feature or fix per PR

## Testing

- **Unit tests**: [Vitest](https://vitest.dev/) — run with `npm run test`
- **E2E tests**: [Playwright](https://playwright.dev/) — for browser-based testing
- Tests live alongside source code in `__tests__/` directories or as `*.test.ts` files

## Reporting Bugs

Open a [GitHub issue](https://github.com/my-claude-utils/clsh/issues/new?template=bug_report.yml) with:

- Your environment (OS, Node version, browser)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Requesting Features

Open a [GitHub issue](https://github.com/my-claude-utils/clsh/issues/new?template=feature_request.yml) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discord**: For questions and discussion (link in README)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
