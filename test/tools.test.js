import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

import {
  geocode,
  getCurrentWeather,
  getForecast,
  AVAILABLE_FUNCTIONS
} from '../src/lib/tools.js'

// --- fetch stubs -----------------------------------------------------------

const geocodeResponse = {
  results: [
    {
      name: 'Tokyo',
      admin1: 'Tokyo',
      country: 'Japan',
      latitude: 35.6895,
      longitude: 139.6917,
      timezone: 'Asia/Tokyo'
    }
  ]
}

const currentResponse = {
  current: {
    temperature_2m: 21.5,
    relative_humidity_2m: 60,
    apparent_temperature: 22.1,
    is_day: 1,
    precipitation: 0.2,
    rain: 0.1,
    showers: 0.1,
    snowfall: 0,
    weather_code: 2,
    cloud_cover_pct: 45,
    pressure_msl: 1012,
    surface_pressure: 1010,
    wind_speed_10m: 12.3,
    wind_direction_10m: 220,
    wind_gusts_10m: 18.9,
    uv_index: 4.5
  },
  daily: {
    sunrise: ['2026-08-23T04:30:00'],
    sunset: ['2026-08-23T18:15:00']
  }
}

const forecastResponse = {
  daily: {
    time: ['2026-08-24', '2026-08-25'],
    temperature_2m_max: [30, 28],
    temperature_2m_min: [22, 21],
    apparent_temperature_max: [31, 29],
    apparent_temperature_min: [23, 22],
    precipitation_probability_max: [10, 80],
    precipitation_sum: [0.2, 5.5],
    rain_sum: [0.2, 5.5],
    showers_sum: [0, 0],
    snowfall_sum: [0, 0],
    weather_code: [0, 61],
    wind_speed_10m_max: [15, 25],
    wind_gusts_10m_max: [20, 35],
    uv_index_max: [8, 3],
    sunrise: ['2026-08-24T04:30:00', '2026-08-25T04:31:00'],
    sunset: ['2026-08-24T18:14:00', '2026-08-25T18:12:00']
  }
}

const forecastFetchStub = (url) => {
  const path = new URL(url).pathname
  if (path === '/v1/search') return jsonResponse(geocodeResponse)
  if (path === '/v1/forecast') {
    return jsonResponse(
      new URL(url).searchParams.has('daily') &&
        new URL(url).searchParams.get('daily') !== 'sunrise,sunset'
        ? forecastResponse
        : currentResponse
    )
  }
  throw new Error(`Unexpected fetch: ${url}`)
}

const jsonResponse = (body) =>
  Promise.resolve({
    ok: true,
    json: async () => body
  })

// --- tests -----------------------------------------------------------------

describe('geocode', () => {
  beforeEach(() => {
    mock.method(globalThis, 'fetch', forecastFetchStub)
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('returns lat, lon and timezone for a city', async () => {
    const result = await geocode('Tokyo')
    assert.deepEqual(result, {
      lat: 35.6895,
      lon: 139.6917,
      tz: 'Asia/Tokyo',
      city: 'Tokyo, Tokyo, Japan'
    })
  })

  test('falls back to auto timezone when missing', async () => {
    mock.method(globalThis, 'fetch', () =>
      jsonResponse({ results: [{ name: 'Nowhere', latitude: 1, longitude: 2 }] })
    )
    assert.equal((await geocode('Nowhere')).tz, 'auto')
  })

  test('returns null when the city is not found', async () => {
    mock.method(globalThis, 'fetch', () => jsonResponse({ results: [] }))
    assert.equal(await geocode('Atlantis'), null)
  })
})

describe('getCurrentWeather', () => {
  let emptyResults = false

  beforeEach(() => {
    emptyResults = false
    mock.method(globalThis, 'fetch', (url) => {
      if (emptyResults) return jsonResponse({ results: [] })
      return forecastFetchStub(url)
    })
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('returns rich current conditions as JSON', async () => {
    const result = JSON.parse(await getCurrentWeather({ city: 'Tokyo' }))
    assert.equal(result.city, 'Tokyo, Tokyo, Japan')
    assert.equal(result.temperature, 21.5)
    assert.equal(result.apparent_temperature, 22.1)
    assert.equal(result.humidity_pct, 60)
    assert.equal(result.wind_kmh, 12.3)
    assert.equal(result.wind_gusts_kmh, 18.9)
    assert.equal(result.precipitation_mm, 0.2)
    assert.equal(result.weather_code, 2)
    assert.equal(result.uv_index, 4.5)
    assert.equal(result.pressure_hpa, 1012)
    assert.equal(result.sunrise, '2026-08-23T04:30:00')
    assert.equal(result.units, 'metric')
  })

  test('reports an error for an unknown city', async () => {
    emptyResults = true
    const result = JSON.parse(await getCurrentWeather({ city: 'Atlantis' }))
    assert.match(result.error, /Atlantis/)
  })

  test('returns a clear error when the weather service fails', async () => {
    mock.method(globalThis, 'fetch', () => Promise.resolve({ ok: false, status: 503 }))
    const result = JSON.parse(await getCurrentWeather({ city: 'Tokyo' }))
    assert.equal(result.error, 'Weather service request failed (HTTP 503).')
  })
})

describe('getForecast', () => {
  beforeEach(() => {
    mock.method(globalThis, 'fetch', forecastFetchStub)
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('returns a rich multi-day forecast', async () => {
    const result = JSON.parse(await getForecast({ city: 'Tokyo' }))
    assert.equal(result.city, 'Tokyo, Tokyo, Japan')
    assert.equal(result.forecast.length, 2)
    assert.deepEqual(result.forecast[1], {
      date: '2026-08-25',
      high: 28,
      low: 21,
      apparent_high: 29,
      apparent_low: 22,
      rain_chance_pct: 80,
      precipitation_mm: 5.5,
      rain_mm: 5.5,
      showers_mm: 0,
      snowfall_cm: 0,
      weather_code: 61,
      wind_kmh: 25,
      wind_gusts_kmh: 35,
      uv_index: 3,
      sunrise: '2026-08-25T04:31:00',
      sunset: '2026-08-25T18:12:00'
    })
  })

  test('clamps requested days to 7', async () => {
    await getForecast({ city: 'Tokyo', days: 99 })
    const calls = globalThis.fetch.mock.calls
    const forecastUrl = calls
      .map((c) => c.arguments[0])
      .find((u) => new URL(u).pathname === '/v1/forecast')
    assert.equal(new URL(forecastUrl).searchParams.get('forecast_days'), '7')
  })

  test('clamps requested days to at least 1', async () => {
    await getForecast({ city: 'Tokyo', days: 0 })
    const forecastUrl = globalThis.fetch.mock.calls
      .map((c) => c.arguments[0])
      .find((u) => new URL(u).pathname === '/v1/forecast')
    assert.equal(new URL(forecastUrl).searchParams.get('forecast_days'), '1')
  })

  test('passes imperial units through to the API', async () => {
    await getForecast({ city: 'Tokyo', units: 'imperial' })
    const calls = globalThis.fetch.mock.calls
    const forecastUrl = calls
      .map((c) => c.arguments[0])
      .find((u) => new URL(u).pathname === '/v1/forecast')
    const params = new URL(forecastUrl).searchParams
    assert.equal(params.get('temperature_unit'), 'fahrenheit')
    assert.equal(params.get('wind_speed_unit'), 'mph')
    assert.equal(params.get('precipitation_unit'), 'inch')
  })
})

describe('AVAILABLE_FUNCTIONS', () => {
  test('exposes both weather tools', () => {
    assert.deepEqual(Object.keys(AVAILABLE_FUNCTIONS).sort(), [
      'getCurrentWeather',
      'getForecast'
    ])
  })
})
