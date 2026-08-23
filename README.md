# wxbot

Conversational local LLM weather assistant CLI. Works with any
OpenAI-compatible backend (Ollama, LM Studio, llama.cpp server, vLLM,
text-generation-webui, or a hosted API like OpenAI / Groq / Together).

## Features

- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Conversational memory (remembers city and context across turns)
- Practical recommendations (umbrella, clothing, activity suitability)
- Tool-calling support — uses real weather data, never guesses numbers
- **Visual terminal output** — boxed weather cards, weather icons,
  color-coded temperatures, and sparkline charts instead of raw JSON
- **Streamed replies** — the assistant's answer appears token-by-token
- **Loading spinner** — an animated indicator while the model thinks
- **Richer data** — feels-like temperature, humidity, wind gusts, UV index,
  cloud cover, pressure, sunrise/sunset, and precipitation amounts
- **Slash commands** — `/help`, `/clear`, `/units`
- **One-shot mode** — `wxbot "umbrella in Tokyo?" [c|f]` prints one answer and exits

## Requirements

- Node.js >= 22
- An OpenAI-compatible inference endpoint (e.g. Ollama running locally)

## Installation

```sh
npm install
# optionally expose the CLI globally
npm link
```

## Configuration

`wxbot` is configured via three environment variables. Set them in your
shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```sh
export WXBOT_BASE_URL="http://localhost:11434/v1"
export WXBOT_API_KEY="your-api-key"
export WXBOT_MODEL="qwen3"
```

## Usage

```sh
node index.js
# or, after npm link:
wxbot
```

Example session:

```
You: Should I bring an umbrella to Tokyo this week?
```

Type `quit` or `exit` to end the conversation.

### Slash commands

| Command   | Effect                                            |
| --------- | ------------------------------------------------- |
| `/help`   | Show available commands                           |
| `/clear`  | Start a fresh conversation (keeps your units)     |
| `/units`  | Toggle between metric (°C) and imperial (°F)      |

### One-shot mode

Pass a prompt as an argument to get a single answer without an interactive
session. Append `c` or `f` to pick metric or imperial units:

```sh
wxbot "should I bring an umbrella to Tokyo this week?" f
wxbot "what's the weather like in London right now?"
```

## Manual testing

To test against a local Ollama server:

1. Install and start Ollama.
2. Download a tool-calling-capable model:

   ```sh
   ollama pull qwen3
   ```

3. Set the environment variables (see [Configuration](#configuration)) and run:

   ```sh
   export WXBOT_BASE_URL="http://localhost:11434/v1"
   export WXBOT_API_KEY="not-needed"
   export WXBOT_MODEL="qwen3"
   node index.js
   ```

   Alternatively, after `npm link` (see [Installation](#installation)), run `wxbot`.

4. Try a few prompts:

   ```
   You: What's the weather like in London right now?
   You: Should I bring a jacket to Berlin tomorrow?
   You: Any good plans for outdoor activities in Sydney this week?
   ```

5. Exit the session by typing `quit` or `exit`.

## License

[MIT](LICENSE)
