import OpenAI from 'openai'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2

const REQUIRED_ENV = ['WXBOT_AI_BASE_URL', 'WXBOT_AI_API_KEY', 'WXBOT_AI_MODEL']

function positiveInt (value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function createClient () {
  return new OpenAI({
    baseURL: process.env.WXBOT_AI_BASE_URL,
    // Local servers ignore auth, but the SDK still requires a non-empty key.
    apiKey: process.env.WXBOT_AI_API_KEY || (isLocalBackend() ? 'not-needed' : undefined),
    timeout: positiveInt(process.env.WXBOT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: positiveInt(process.env.WXBOT_MAX_RETRIES, DEFAULT_MAX_RETRIES)
  })
}

/** True when every env var the model needs is present. */
export function hasEnv () {
  return REQUIRED_ENV.every((v) => Boolean(process.env[v]))
}

/** True only for an AI backend that needs no credentials. */
function isLocalBackend () {
  const baseUrl = process.env.WXBOT_AI_BASE_URL
  if (!baseUrl) return false
  let host
  try {
    host = new URL(baseUrl).hostname
  } catch {
    return false
  }
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(host)
}

export function validateEnv () {
  // Local OpenAI-compatible servers (Ollama, LM Studio, vLLM) ignore auth.
  const required = isLocalBackend()
    ? REQUIRED_ENV.filter((v) => v !== 'WXBOT_AI_API_KEY')
    : REQUIRED_ENV
  const missing = required.filter((v) => !process.env[v])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        'Set them in your shell profile, e.g.:\n' +
        '  export WXBOT_AI_BASE_URL="http://localhost:11434/v1"\n' +
        '  export WXBOT_AI_API_KEY="your-api-key"\n' +
        '  export WXBOT_AI_MODEL="qwen3"\n' +
        'Tip: lookups like "weather in Tokyo" and /now, /forecast work without any AI backend.'
    )
  }
}
