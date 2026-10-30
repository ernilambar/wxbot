import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { hasEnv, validateEnv } from '../src/lib/client.js'

const KEYS = ['WXBOT_AI_BASE_URL', 'WXBOT_AI_API_KEY', 'WXBOT_AI_MODEL']

describe('AI backend env checks', () => {
  let saved
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    for (const k of KEYS) delete process.env[k]
  })
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  test('a localhost backend needs no API key', () => {
    process.env.WXBOT_AI_BASE_URL = 'http://localhost:11434/v1'
    process.env.WXBOT_AI_MODEL = 'qwen3'
    assert.equal(hasEnv(), true)
    assert.doesNotThrow(() => validateEnv())
  })

  test('a remote backend requires an API key', () => {
    process.env.WXBOT_AI_BASE_URL = 'https://api.example.com/v1'
    process.env.WXBOT_AI_MODEL = 'qwen3'
    assert.equal(hasEnv(), false)
    assert.throws(() => validateEnv(), /WXBOT_AI_API_KEY/)
  })

  test('nothing configured', () => {
    assert.equal(hasEnv(), false)
  })
})
