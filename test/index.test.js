import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs } from '../src/index.js'

describe('one-shot argument parsing', () => {
  test('requires a multi-word prompt to be quoted', () => {
    assert.throws(
      () => parseArgs(['weather', 'in', 'Tokyo']),
      /Prompt must be supplied as a single quoted string/
    )
    assert.deepEqual(parseArgs(['weather in Tokyo']), { units: 'metric', prompt: 'weather in Tokyo' })
    assert.deepEqual(parseArgs(['weather in Tokyo', '-u', 'imperial']), { units: 'imperial', prompt: 'weather in Tokyo' })
  })

  test('parses -u / --units as the unit selector', () => {
    assert.deepEqual(parseArgs(['weather in Tokyo', '-u', 'imperial']), { units: 'imperial', prompt: 'weather in Tokyo' })
    assert.deepEqual(parseArgs(['weather in Tokyo', '--units', 'imperial']), { units: 'imperial', prompt: 'weather in Tokyo' })
    assert.deepEqual(parseArgs(['weather in Tokyo']), { units: 'metric', prompt: 'weather in Tokyo' })
  })

  test('rejects invalid units choices', () => {
    assert.throws(
      () => parseArgs(['weather in Tokyo', '--units', 'fahrenheit']),
      /Invalid values/
    )
  })
})
