import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseWeatherQuery, describePlan } from '../src/lib/intent.js'

describe('parseWeatherQuery — slash commands', () => {
  test('/now targets current conditions', () => {
    assert.deepEqual(parseWeatherQuery('/now Tokyo'), { kind: 'current', city: 'Tokyo' })
    assert.deepEqual(parseWeatherQuery('/now  New   York '), { kind: 'current', city: 'New York' })
  })

  test('/forecast accepts an explicit day count', () => {
    assert.deepEqual(parseWeatherQuery('/forecast Tokyo 5'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 5
    })
    assert.deepEqual(parseWeatherQuery('/forecast Tokyo'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 3
    })
  })

  test('day counts are clamped to 1-7', () => {
    assert.equal(parseWeatherQuery('/forecast Tokyo 0').days, 1)
    assert.equal(parseWeatherQuery('/forecast Tokyo 99').days, 7)
  })

  test('a command without a city falls through to the model', () => {
    assert.equal(parseWeatherQuery('/forecast'), null)
    assert.equal(parseWeatherQuery('/now   '), null)
  })
})

describe('parseWeatherQuery — natural phrasing', () => {
  test('current conditions', () => {
    for (const input of [
      'weather in Tokyo',
      'weather in Tokyo?',
      "what's the weather in Tokyo",
      'temperature in Tokyo',
      'how hot is it in Tokyo',
      'Tokyo weather'
    ]) {
      assert.deepEqual(parseWeatherQuery(input), { kind: 'current', city: 'Tokyo' }, input)
    }
  })

  test('forecast with day hints', () => {
    assert.deepEqual(parseWeatherQuery('forecast for Tokyo'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 3
    })
    assert.deepEqual(parseWeatherQuery('Tokyo forecast this week'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 7
    })
    assert.deepEqual(parseWeatherQuery('weather in Tokyo tomorrow'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 2
    })
    assert.deepEqual(parseWeatherQuery('weather in Tokyo for 5 days'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 5
    })
    assert.deepEqual(parseWeatherQuery('Tokyo 5-day forecast'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 5
    })
  })

  test('rain and snow questions become forecasts', () => {
    assert.deepEqual(parseWeatherQuery('rain in Tokyo'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 3
    })
  })

  test('multi-word and punctuated place names survive', () => {
    assert.deepEqual(parseWeatherQuery('weather in New York'), { kind: 'current', city: 'New York' })
    assert.deepEqual(parseWeatherQuery('weather in St. Louis'), { kind: 'current', city: 'St Louis' })
    assert.deepEqual(parseWeatherQuery('weather in Kathmandu, Nepal'), {
      kind: 'current',
      city: 'Kathmandu Nepal'
    })
  })
})

describe('parseWeatherQuery — falls through to the model', () => {
  test('advice and comparisons need reasoning', () => {
    for (const input of [
      'should I bring an umbrella in Tokyo?',
      'compare Tokyo and Oslo this weekend',
      'is it a good day for a hike in Pokhara',
      'do I need a jacket in London',
      'will it be safe to drive to Munich tomorrow'
    ]) {
      assert.equal(parseWeatherQuery(input), null, input)
    }
  })

  test('follow-ups without a city cannot be answered directly', () => {
    for (const input of [
      'what about tomorrow?',
      'and the weekend?',
      'weather?',
      'forecast',
      'thanks!',
      'hello',
      ''
    ]) {
      assert.equal(parseWeatherQuery(input), null, input)
    }
  })

  test('rejects non-string input', () => {
    assert.equal(parseWeatherQuery(undefined), null)
    assert.equal(parseWeatherQuery(null), null)
    assert.equal(parseWeatherQuery(42), null)
  })
})

describe('describePlan', () => {
  test('describes each plan kind', () => {
    assert.equal(describePlan({ kind: 'current', city: 'Tokyo' }), 'Looking up Tokyo…')
    assert.equal(
      describePlan({ kind: 'forecast', city: 'Tokyo', days: 5 }),
      'Fetching 5-day forecast for Tokyo…'
    )
    assert.equal(describePlan(null), '')
  })
})
