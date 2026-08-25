import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

process.env.WXBOT_AI_BASE_URL = 'http://localhost:11434/v1'
process.env.WXBOT_AI_API_KEY = 'test-key'
process.env.WXBOT_AI_MODEL = 'qwen3'

const { WeatherAssistant } = await import('../src/lib/assistant.js')

const CURRENT_TOOL_CALL = {
  id: 'call_1',
  type: 'function',
  function: { name: 'getCurrentWeather', arguments: '{"city":"Tokyo"}' }
}

// A stream that yields the given deltas.
async function * deltaStream (deltas) {
  for (const d of deltas) {
    yield { choices: [{ delta: d }] }
  }
}

describe('WeatherAssistant', () => {
  beforeEach(() => {
    process.env.WXBOT_AI_MODEL = 'qwen3'
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('ask returns the model reply when no tools are called', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: 'Sunny in Tokyo!' } }]
          })
        }
      }
    }
    const assistant = new WeatherAssistant({ client, model: 'qwen3' })
    assert.equal(await assistant.ask('Weather in Tokyo?'), 'Sunny in Tokyo!')
  })

  test('ask executes tool calls and returns the final answer', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      if (new URL(url).pathname === '/v1/search') {
        return {
          ok: true,
          json: async () => ({
            results: [{ latitude: 1, longitude: 2, timezone: 'UTC' }]
          })
        }
      }
      return {
        ok: true,
        json: async () => ({
          current: { temperature_2m: 20, relative_humidity_2m: 50 },
          daily: { sunrise: [], sunset: [] }
        })
      }
    })

    const toolResults = []
    let call = 0
    const client = {
      chat: {
        completions: {
          create: async () => {
            call++
            if (call === 1) {
              return {
                choices: [
                  { message: { content: null, tool_calls: [CURRENT_TOOL_CALL] } }
                ]
              }
            }
            return { choices: [{ message: { content: 'Bring an umbrella.' } }] }
          }
        }
      }
    }

    const assistant = new WeatherAssistant({
      client,
      model: 'qwen3',
      onToolResult: (r) => toolResults.push(r)
    })

    const reply = await assistant.ask('Should I bring an umbrella?')
    assert.equal(reply, 'Bring an umbrella.')
    assert.equal(toolResults.length, 1)
    assert.equal(toolResults[0].name, 'getCurrentWeather')
    const toolMessage = assistant.messages.find((m) => m.role === 'tool')
    assert.ok(toolMessage)
    assert.equal(toolMessage.tool_call_id, 'call_1')
  })

  test('askStream streams text deltas and returns the full reply', async () => {
    let streamed = ''
    const client = {
      chat: {
        completions: {
          create: async () =>
            deltaStream([
              { content: 'It ' },
              { content: 'is ' },
              { content: 'sunny.' }
            ])
        }
      }
    }
    const assistant = new WeatherAssistant({
      client,
      model: 'qwen3',
      onDelta: (t) => (streamed += t)
    })

    const reply = await assistant.askStream('Weather?')
    assert.equal(reply, 'It is sunny.')
    assert.equal(streamed, 'It is sunny.')
    assert.equal(assistant.messages.at(-1).content, 'It is sunny.')
  })

  test('askStream accumulates streamed tool calls and runs them', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      if (new URL(url).pathname === '/v1/search') {
        return {
          ok: true,
          json: async () => ({
            results: [{ latitude: 1, longitude: 2, timezone: 'UTC' }]
          })
        }
      }
      return {
        ok: true,
        json: async () => ({
          current: { temperature_2m: 20, relative_humidity_2m: 50 },
          daily: { sunrise: [], sunset: [] }
        })
      }
    })

    let call = 0
    const client = {
      chat: {
        completions: {
          create: async () => {
            call++
            if (call === 1) {
              return deltaStream([
                {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'getCurrent', arguments: '{"ci' }
                    }
                  ]
                },
                {
                  tool_calls: [
                    {
                      index: 0,
                      function: { name: 'Weather', arguments: 'ty":"Tokyo"}' }
                    }
                  ]
                }
              ])
            }
            return deltaStream([
              { content: "Weather's " },
              { content: 'fine.' }
            ])
          }
        }
      }
    }

    const assistant = new WeatherAssistant({ client, model: 'qwen3' })
    const reply = await assistant.askStream('Weather in Tokyo?')
    assert.equal(reply, "Weather's fine.")
    const toolMessage = assistant.messages.find((m) => m.role === 'tool')
    assert.ok(toolMessage, 'expected a tool message')
    assert.equal(toolMessage.tool_call_id, 'call_1')
    assert.match(toolMessage.content, /Tokyo/)
  })

  test('reset clears conversation but keeps units', () => {
    const client = { chat: { completions: { create: async () => ({}) } } }
    const assistant = new WeatherAssistant({ client, units: 'imperial' })
    assistant.messages.push({ role: 'user', content: 'hi' })
    assistant.reset()
    assert.equal(assistant.messages.length, 1)
    assert.equal(assistant.messages[0].role, 'system')
    assert.equal(assistant.units, 'imperial')
  })

  test('setUnits changes the units used for tool calls', async () => {
    const seen = []
    mock.method(globalThis, 'fetch', async (url) => {
      if (new URL(url).pathname === '/v1/search') {
        return { ok: true, json: async () => ({ results: [{ latitude: 1, longitude: 2 }] }) }
      }
      return { ok: true, json: async () => ({ current: { temperature_2m: 20 }, daily: {} }) }
    })

    let call = 0
    const client = {
      chat: {
        completions: {
          create: async () => {
            call++
            if (call === 1) {
              return {
                choices: [
                  { message: { content: null, tool_calls: [CURRENT_TOOL_CALL] } }
                ]
              }
            }
            return { choices: [{ message: { content: 'ok' } }] }
          }
        }
      }
    }

    const assistant = new WeatherAssistant({
      client,
      units: 'metric',
      onToolResult: ({ result }) => seen.push(JSON.parse(result))
    })
    await assistant.ask('weather?')
    call = 0
    assistant.setUnits('imperial')
    await assistant.ask('weather again?')
    assert.equal(seen[0].units, 'metric')
    assert.equal(seen[1].units, 'imperial')
  })

  test('rejects unsupported and malformed tool calls clearly', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: 'bad_call',
                  type: 'function',
                  function: { name: 'unknownTool', arguments: '{}' }
                }]
              }
            }]
          })
        }
      }
    }
    const assistant = new WeatherAssistant({ client, model: 'qwen3' })
    await assert.rejects(assistant.ask('weather?'), /unsupported tool: unknownTool/)

    const malformedClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: 'bad_call',
                  type: 'function',
                  function: { name: 'getCurrentWeather', arguments: '{' }
                }]
              }
            }]
          })
        }
      }
    }
    const malformedAssistant = new WeatherAssistant({ client: malformedClient, model: 'qwen3' })
    await assert.rejects(
      malformedAssistant.ask('weather?'),
      /invalid arguments for getCurrentWeather/
    )
  })

  test('retains only the most recent conversation turns', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: 'ok' } }] })
        }
      }
    }
    const assistant = new WeatherAssistant({ client, model: 'qwen3' })
    for (let i = 0; i < 11; i++) {
      await assistant.ask(`message ${i}`)
    }
    assert.equal(assistant.messages.filter((message) => message.role === 'user').length, 10)
    assert.equal(assistant.messages[1].content, 'message 1')
  })
})
