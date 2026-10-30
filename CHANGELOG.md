# Changelog

## Unreleased
- Added: Zero-LLM fast path — `weather in <city>`, `forecast for <city> N days`, `/now <city>` and `/forecast <city> [days]` are parsed deterministically and answered straight from Open-Meteo. Works with no AI backend configured.
- Added: `--ai <auto|always|never>` to choose when the model is used (default `auto`)
- Added: Place names accept a region or country after a comma (`Paris, Texas`, `Kathmandu, Nepal`), for direct lookups and the model's tool calls
- Added: "tomorrow", "in N days" and "this weekend" show only those days
- Changed: Direct lookups are kept in conversation memory, so follow-ups like "what about tomorrow?" know the city
- Changed: A direct lookup whose place can't be found falls back to the model when one is configured
- Changed: Missing AI credentials no longer block startup; the REPL reports them per turn and keeps direct lookups working
- Changed: `WXBOT_AI_API_KEY` is optional for localhost backends
- Fixed: Re-prompting a closed readline interface crashed piped sessions (`ERR_USE_AFTER_CLOSE`)

## 0.1.4 - 2026-10-30
- Changed: Homebrew is now the primary installation method
- Changed: Update dependencies

## 0.1.3 - 2026-09-11
- Fixed: Duplicated tool name when a backend resends the full name in every streaming delta

## 0.1.2 - 2026-09-10
- Changed: Replace boxen with dynamic dash bars

## 0.1.1 - 2026-09-10
- Changed: Update openai dependency from v4 to v7.13.0

## 0.1.0 - 2026-08-25
- Initial release
