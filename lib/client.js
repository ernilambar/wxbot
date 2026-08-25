import OpenAI from 'openai'

const { WXBOT_BASE_URL, WXBOT_API_KEY } = process.env

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2

function positiveInt (value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function createClient () {
  return new OpenAI({
    baseURL: WXBOT_BASE_URL,
    apiKey: WXBOT_API_KEY,
    timeout: positiveInt(process.env.WXBOT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: positiveInt(process.env.WXBOT_MAX_RETRIES, DEFAULT_MAX_RETRIES)
  })
}

export function validateEnv () {
  const missing = ['WXBOT_BASE_URL', 'WXBOT_API_KEY', 'WXBOT_MODEL'].filter(
    (v) => !process.env[v]
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        'Set them in your shell profile, e.g.:\n' +
        '  export WXBOT_BASE_URL="http://localhost:11434/v1"\n' +
        '  export WXBOT_API_KEY="your-api-key"\n' +
        '  export WXBOT_MODEL="qwen3"'
    )
  }
}
