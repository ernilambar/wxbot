# Changelog

## 0.1.5 - 2026-10-30
- Added: Zero-LLM fast path — `weather in <city>`, `/now`, `/forecast <city>`, plus `--ai auto|always|never`
- Added: Natural phrasing for dates and places — "tomorrow", "in N days", "this weekend", `Paris, Texas`
- Changed: Direct lookups are remembered across turns and fall back to the model when a place can't be found
- Changed: AI credentials are optional at startup; direct lookups work with no backend configured
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
