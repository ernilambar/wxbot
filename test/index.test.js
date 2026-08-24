import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseUnits, promptArgs } from '../index.js'

describe('one-shot argument parsing', () => {
  test('requires a multi-word prompt to be quoted', () => {
    assert.throws(
      () => promptArgs(['weather', 'in', 'Tokyo']),
      /Prompt must be supplied as a single quoted string/
    )
    assert.deepEqual(promptArgs(['weather in Tokyo']), ['weather in Tokyo'])
    assert.deepEqual(promptArgs(['weather in Tokyo', 'f']), ['weather in Tokyo'])
  })

  test('uses a final c or f argument as the unit selector', () => {
    assert.deepEqual(promptArgs(['weather in Tokyo', 'f']), ['weather in Tokyo'])
    assert.equal(parseUnits(['weather in Tokyo', 'f']), 'imperial')
    assert.equal(parseUnits(['weather in Tokyo']), 'metric')
  })

  test('rejects unsupported options instead of sending them to the model', () => {
    assert.throws(
      () => promptArgs(['weather', 'in', 'Tokyo', '--json']),
      /Unknown option: --json/
    )
  })
})
