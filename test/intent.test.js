import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseWeatherQuery, describePlan, selectDays } from '../src/lib/intent.js'

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
      days: 2,
      from: 1
    })
    assert.deepEqual(parseWeatherQuery('weather in Tokyo in 3 days'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 4,
      from: 3
    })
    assert.deepEqual(parseWeatherQuery('Tokyo forecast this weekend'), {
      kind: 'forecast',
      city: 'Tokyo',
      days: 7,
      weekend: true
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
    assert.deepEqual(parseWeatherQuery('will it rain in London tomorrow'), {
      kind: 'forecast',
      city: 'London',
      days: 2,
      from: 1
    })
  })

  test('"is it raining" asks about now', () => {
    assert.deepEqual(parseWeatherQuery('is it raining in Tokyo?'), { kind: 'current', city: 'Tokyo' })
  })

  test('multi-word and punctuated place names survive', () => {
    assert.deepEqual(parseWeatherQuery('weather in New York'), { kind: 'current', city: 'New York' })
    assert.deepEqual(parseWeatherQuery('weather in St. Louis'), { kind: 'current', city: 'St. Louis' })
    assert.deepEqual(parseWeatherQuery('weather in The Hague'), { kind: 'current', city: 'The Hague' })
  })

  test('a comma qualifier is kept for the geocoder', () => {
    assert.deepEqual(parseWeatherQuery('weather in Kathmandu, Nepal'), {
      kind: 'current',
      city: 'Kathmandu, Nepal'
    })
    assert.deepEqual(parseWeatherQuery('weather in Tokyo,Japan please'), {
      kind: 'current',
      city: 'Tokyo, Japan'
    })
  })

  test('condition words inside place names survive', () => {
    assert.deepEqual(parseWeatherQuery('Cold Spring weather'), { kind: 'current', city: 'Cold Spring' })
    assert.deepEqual(parseWeatherQuery('weather in Hot Springs'), { kind: 'current', city: 'Hot Springs' })
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

  test('leftover words are never folded into the city', () => {
    for (const input of [
      'weather in Tokyo yesterday',
      'weather in Tokyo last week',
      'weather in Tokyo and Oslo',
      'weather in Tokyo or Oslo',
      'weather in Sydney in fahrenheit',
      'weather in Boston in May',
      'weather in Tokyo at 5pm',
      'how is the weather in Tokyo compared to yesterday',
      'also Oslo weather',
      'what about Oslo weather'
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
    assert.equal(
      describePlan({ kind: 'forecast', city: 'Tokyo', days: 2, from: 1 }),
      "Fetching tomorrow's forecast for Tokyo…"
    )
    assert.equal(
      describePlan({ kind: 'forecast', city: 'Tokyo', days: 7, weekend: true }),
      'Fetching the weekend forecast for Tokyo…'
    )
    assert.equal(describePlan(null), '')
  })
})

describe('selectDays', () => {
  // 2026-10-30 is a Friday.
  const week = {
    city: 'Tokyo',
    forecast: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((date) => ({ date }))
  }
  const dates = (data) => data.forecast.map((d) => d.date)

  test('skips leading days for "tomorrow" and "in N days"', () => {
    assert.deepEqual(dates(selectDays({ from: 1 }, week)), ['2026-10-31', '2026-11-01', '2026-11-02'])
  })

  test('keeps only Saturday and Sunday for the weekend', () => {
    assert.deepEqual(dates(selectDays({ weekend: true }, week)), ['2026-10-31', '2026-11-01'])
  })

  test('on a Sunday the weekend is just today', () => {
    const sunday = { forecast: week.forecast.slice(2) }
    assert.deepEqual(dates(selectDays({ weekend: true }, sunday)), ['2026-11-01'])
  })

  test('error payloads pass through untouched', () => {
    const error = { error: 'Could not find location: Atlantis' }
    assert.equal(selectDays({ from: 1 }, error), error)
  })
})
