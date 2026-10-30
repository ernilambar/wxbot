import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs, resolveRoute } from '../src/index.js'

describe('one-shot argument parsing', () => {
  test('requires a multi-word prompt to be quoted', () => {
    assert.throws(
      () => parseArgs(['weather', 'in', 'Tokyo']),
      /Prompt must be supplied as a single quoted string/
    )
    assert.deepEqual(parseArgs(['weather in Tokyo']), {
      units: 'metric',
      prompt: 'weather in Tokyo',
      ai: 'auto'
    })
    assert.deepEqual(parseArgs(['weather in Tokyo', '-u', 'imperial']), {
      units: 'imperial',
      prompt: 'weather in Tokyo',
      ai: 'auto'
    })
  })

  test('parses -u / --units as the unit selector', () => {
    assert.equal(parseArgs(['weather in Tokyo', '-u', 'imperial']).units, 'imperial')
    assert.equal(parseArgs(['weather in Tokyo', '--units', 'imperial']).units, 'imperial')
    assert.equal(parseArgs(['weather in Tokyo']).units, 'metric')
  })

  test('rejects invalid units choices', () => {
    assert.throws(
      () => parseArgs(['weather in Tokyo', '--units', 'fahrenheit']),
      /Invalid values/
    )
  })

  test('parses --ai as auto, always or never', () => {
    assert.equal(parseArgs(['weather in Tokyo', '--ai', 'always']).ai, 'always')
    assert.equal(parseArgs(['weather in Tokyo', '--ai', 'never']).ai, 'never')
    assert.equal(parseArgs(['weather in Tokyo']).ai, 'auto')
    assert.throws(() => parseArgs(['weather in Tokyo', '--ai', 'maybe']), /Invalid values/)
  })
})

describe('routing between the direct path and the assistant', () => {
  test('plain lookups are answered without the model', () => {
    assert.deepEqual(resolveRoute('weather in Tokyo'), { kind: 'current', city: 'Tokyo' })
    assert.deepEqual(resolveRoute('forecast for Tokyo 5 days'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 5
    })
  })

  test('questions that need reasoning go to the model', () => {
    assert.deepEqual(resolveRoute('should I bring an umbrella in Tokyo?'), { kind: 'llm' })
    assert.deepEqual(resolveRoute('compare Tokyo and Oslo'), { kind: 'llm' })
    assert.deepEqual(resolveRoute('what about tomorrow?'), { kind: 'llm' })
  })

  test('--ai always forces the assistant for plain lookups', () => {
    assert.deepEqual(resolveRoute('weather in Tokyo', { ai: 'always' }), { kind: 'llm' })
  })

  test('/now and /forecast stay direct under --ai always', () => {
    assert.deepEqual(resolveRoute('/now Tokyo', { ai: 'always' }), { kind: 'current', city: 'Tokyo' })
    assert.deepEqual(resolveRoute('/forecast Tokyo 5', { ai: 'always' }), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 5
    })
  })

  test('--ai never still resolves direct lookups', () => {
    assert.deepEqual(resolveRoute('weather in Tokyo', { ai: 'never' }), {
      kind: 'current',
      city: 'Tokyo'
    })
    assert.deepEqual(resolveRoute('what should I wear?', { ai: 'never' }), { kind: 'llm' })
  })
})
