# wxbot

Conversational LLM weather assistant CLI. Works with any OpenAI-compatible
backend (Ollama, LM Studio, llama.cpp, vLLM, etc.).

## Features

- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Real-time data via tool calling — never guesses numbers
- Conversational memory across turns
- Boxed weather cards, icons, color-coded temps, sparklines
- Streamed replies with a loading spinner
- Slash commands: `/help`, `/clear`, `/units`
- One-shot mode and `-v` / `--version`

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
wxbot                          # interactive REPL
wxbot "weather in Tokyo?"      # one-shot, prints one answer and exits
wxbot "weather in Tokyo?" f    # one-shot in imperial (°F)
wxbot -v                       # print version
```

In the REPL, `/clear` resets the conversation, `/units` toggles metric/imperial,
and `quit`/`exit` leaves. Example:

```
You: Should I bring an umbrella to Tokyo this week?

Assistant: Given the forecast, I'd bring one — there's rain expected later
this week, so an umbrella will come in handy.
```

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
