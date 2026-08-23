# wxbot

Conversational local LLM weather assistant CLI. Works with any
OpenAI-compatible backend (Ollama, LM Studio, llama.cpp server, vLLM,
text-generation-webui, or a hosted API like OpenAI / Groq / Together).

> [https://github.com/ernilambar/wxbot](https://github.com/ernilambar/wxbot)

## Features

- Current weather + multi-day forecast via [Open-Meteo](https://open-meteo.com)
- Conversational memory (remembers city and context across turns)
- Practical recommendations (umbrella, clothing, activity suitability)
- Tool-calling support — uses real weather data, never guesses numbers

## Requirements

- Node.js >= 18
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

If any variable is missing, `wxbot` exits with an error message listing
the missing ones.

## Usage

```sh
npx wxbot
# or, after npm link:
wxbot
```

Example session:

```
You: Should I bring an umbrella to Tokyo this week?
```

Type `quit` or `exit` to end the conversation.

## License

MIT
