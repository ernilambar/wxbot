# wxbot

AI weather assistant in your terminal.

## Features

- **Works without an AI backend.** `weather in Tokyo`, `/now <city>` and `/forecast <city> [days]` are parsed deterministically and answered straight from Open-Meteo — no model, no tokens, ~300ms.
- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Real-time data via tool calling — never guesses numbers
- Conversational memory across turns, streamed replies, weather cards, sparklines
- Slash commands: `/help`, `/now`, `/forecast`, `/clear`, `/units`

## How a turn is answered

| Input | Path |
|---|---|
| `weather in Tokyo`, `/now Tokyo` | direct — current conditions |
| `forecast for Tokyo 5 days`, `/forecast Tokyo 5` | direct — N-day forecast |
| `should I bring an umbrella in Tokyo?` | model — needs reasoning |
| `compare Tokyo and Oslo` | model — needs two lookups + prose |
| `what about tomorrow?` | model — needs conversation memory |

The direct path is chosen by `src/lib/intent.js`; anything it cannot parse confidently falls through to the assistant. Force either side with `--llm` / `--no-llm`.

## Install / Upgrade

**Homebrew (macOS, Apple Silicon)** — recommended:

```bash
brew tap ernilambar/tap
brew trust ernilambar/tap
brew install ernilambar/tap/wxbot
```

Upgrade later with `brew upgrade wxbot`.

**Prebuilt binary (macOS, Apple Silicon)** — without Homebrew:

```bash
curl -fL -o wxbot https://github.com/ernilambar/wxbot/releases/latest/download/wxbot-darwin-arm64
sudo xattr -d com.apple.quarantine wxbot 2>/dev/null || true
chmod +x wxbot
sudo mv wxbot /usr/local/bin/
wxbot --version
```

**Other platforms** — build from source (requires [Bun](https://bun.sh) ≥ 1.2):

```bash
git clone https://github.com/ernilambar/wxbot.git
cd wxbot && bun install
bun build --compile --minify ./src/index.js --outfile wxbot
sudo mv wxbot /usr/local/bin/
```

## Configure

Optional — only advice/conversational answers need a model. Direct lookups work with
nothing configured.

```sh
export WXBOT_AI_BASE_URL="http://localhost:11434/v1"
export WXBOT_AI_API_KEY="your-api-key"   # optional for local backends
export WXBOT_AI_MODEL="qwen3"
```

## Usage

```sh
wxbot                                       # REPL
wxbot "weather in Tokyo?"                   # direct lookup, no model
wxbot "forecast for Tokyo 5 days"           # direct lookup, no model
wxbot "weather in Tokyo?" --units imperial
wxbot "should I bring an umbrella?"         # model
wxbot "weather in Tokyo" --no-llm           # never call the model
wxbot "should I bring an umbrella?" --llm   # always call the model
```

In the REPL, `/now <city>` and `/forecast <city> [days]` answer directly, `/clear`
resets the conversation, `/units` toggles metric/imperial, and `quit`/`exit` leaves.

## Manual testing

```sh
ollama pull qwen3
export WXBOT_AI_BASE_URL="http://localhost:11434/v1"
export WXBOT_AI_API_KEY="not-needed"
export WXBOT_AI_MODEL="qwen3"
bun src/index.js
```

## License

[MIT](LICENSE) © [Nilambar Sharma](https://www.nilambar.net)
