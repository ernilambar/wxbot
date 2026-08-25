# wxbot

Conversational weather assistant CLI for any OpenAI-compatible backend.

## Features

- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Real-time data via tool calling — never guesses numbers
- Conversational memory across turns
- Streamed replies, weather cards, sparklines
- Slash commands: `/help`, `/clear`, `/units`

## Install

```sh
npm install
npm link   # optional: exposes `wxbot` globally
```

## Configure

```sh
export WXBOT_BASE_URL="http://localhost:11434/v1"
export WXBOT_API_KEY="your-api-key"
export WXBOT_MODEL="qwen3"
```

## Usage

```sh
wxbot                                     # interactive REPL
wxbot "weather in Tokyo?"                 # one-shot
wxbot "weather in Tokyo?" --units imperial
wxbot -v                                  # version
```

In the REPL, `/clear` resets the conversation, `/units` toggles metric/imperial, and `quit`/`exit` leaves.

## Manual testing

```sh
ollama pull qwen3
export WXBOT_BASE_URL="http://localhost:11434/v1"
export WXBOT_API_KEY="not-needed"
export WXBOT_MODEL="qwen3"
wxbot
```

## License

[MIT](LICENSE)
