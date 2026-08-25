# wxbot

Conversational weather assistant CLI for any OpenAI-compatible backend.

## Features

- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Real-time data via tool calling — never guesses numbers
- Conversational memory across turns
- Streamed replies, weather cards, sparklines
- Slash commands: `/help`, `/clear`, `/units`

## Install / Upgrade

**macOS** — prebuilt binary (replace `arm64` with `amd64` for Intel Macs):

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

```sh
export WXBOT_AI_BASE_URL="http://localhost:11434/v1"
export WXBOT_AI_API_KEY="your-api-key"
export WXBOT_AI_MODEL="qwen3"
```

## Usage

```sh
wxbot                                     # interactive REPL
wxbot "weather in Tokyo?"                 # one-shot
wxbot "weather in Tokyo?" --units imperial
```

In the REPL, `/clear` resets the conversation, `/units` toggles metric/imperial, and `quit`/`exit` leaves.

## Manual testing

```sh
ollama pull qwen3
export WXBOT_AI_BASE_URL="http://localhost:11434/v1"
export WXBOT_AI_API_KEY="not-needed"
export WXBOT_AI_MODEL="qwen3"
wxbot
```

## License

[MIT](LICENSE)
