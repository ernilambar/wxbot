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
      llm: undefined
    })
    assert.deepEqual(parseArgs(['weather in Tokyo', '-u', 'imperial']), {
      units: 'imperial',
      prompt: 'weather in Tokyo',
      llm: undefined
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

  test('parses --llm / --no-llm overrides', () => {
    assert.equal(parseArgs(['weather in Tokyo', '--llm']).llm, true)
    assert.equal(parseArgs(['weather in Tokyo', '--no-llm']).llm, false)
    assert.equal(parseArgs(['weather in Tokyo']).llm, undefined)
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

  test('--llm forces the assistant even for plain lookups', () => {
    assert.deepEqual(resolveRoute('weather in Tokyo', { llm: true }), { kind: 'llm' })
  })

  test('--no-llm still resolves direct lookups', () => {
    assert.deepEqual(resolveRoute('weather in Tokyo', { llm: false }), {
      kind: 'current',
      city: 'Tokyo'
    })
    assert.deepEqual(resolveRoute('what should I wear?', { llm: false }), { kind: 'llm' })
  })
})
