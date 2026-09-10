# AGENTS.md

## Overview
wxbot is a conversational weather assistant CLI that talks to any OpenAI-compatible backend. Core stack: Node.js ES modules, Bun runtime, OpenAI SDK, Open-Meteo for weather data, ESLint v9 flat config with neostandard for linting.

## Setup
```bash
bun install --frozen-lockfile
```

Required environment variables:
```bash
export WXBOT_AI_BASE_URL="http://localhost:11434/v1"
export WXBOT_AI_API_KEY="your-api-key"
export WXBOT_AI_MODEL="qwen3"
```

## Commands
| Task | Command |
|---|---|
| Build | `mkdir -p dist && bun build --compile --minify ./src/index.js --outfile dist/wxbot` |
| Test | `bun test` |
| Lint | `eslint .` |
| Format | `eslint --fix .` |
| Run | `bun src/index.js` |

## Conventions
- **ES modules** — `package.json` has `"type": "module"`, use `.js` imports with explicit extensions.
- **Bun-native** — scripts and build use `bun`, not `node` or `npm`.
- **Source layout** — source lives in `src/`, compiled binaries go to `dist/`.
- **Linting** — ESLint v9 flat config with `neostandard`; config lives in `eslint.config.mjs`.

## Quality gate
Run these in order — all must exit 0 before declaring a task complete:
```bash
bun install --frozen-lockfile && bun run lint && bun test
```