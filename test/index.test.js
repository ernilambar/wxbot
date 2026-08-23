import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// Configure the environment before importing the module so the default
// OpenAI client can be constructed without real credentials.
process.env.WXBOT_BASE_URL = "http://localhost:11434/v1";
process.env.WXBOT_API_KEY = "test-key";
process.env.WXBOT_MODEL = "qwen3";

const {
  geocode,
  getCurrentWeather,
  getForecast,
  AVAILABLE_FUNCTIONS,
  WeatherAssistant,
} = await import("../index.js");

// --- fetch stubs -----------------------------------------------------------

const geocodeResponse = {
  results: [
    {
      latitude: 35.6895,
      longitude: 139.6917,
      timezone: "Asia/Tokyo",
    },
  ],
};

const currentResponse = {
  current: {
    temperature_2m: 21.5,
    relative_humidity_2m: 60,
    wind_speed_10m: 12.3,
    precipitation: 0,
  },
};

const forecastResponse = {
  daily: {
    time: ["2026-08-24", "2026-08-25"],
    temperature_2m_max: [30, 28],
    temperature_2m_min: [22, 21],
    precipitation_probability_max: [10, 80],
    wind_speed_10m_max: [15, 25],
  },
};

const fetchStub = (url) => {
  const path = new URL(url).pathname;
  if (path === "/v1/search") return jsonResponse(geocodeResponse);
  if (path === "/v1/forecast") return jsonResponse(currentResponse);
  throw new Error(`Unexpected fetch: ${url}`);
};

// Returns the forecast payload instead of current when asked for daily data.
const forecastFetchStub = (url) => {
  const path = new URL(url).pathname;
  if (path === "/v1/search") return jsonResponse(geocodeResponse);
  if (path === "/v1/forecast") {
    return jsonResponse(
      new URL(url).searchParams.has("daily") ? forecastResponse : currentResponse
    );
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

const jsonResponse = (body) =>
  Promise.resolve({
    json: async () => body,
  });

// --- tests -----------------------------------------------------------------

describe("geocode", () => {
  beforeEach(() => {
    mock.method(globalThis, "fetch", fetchStub);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("returns lat, lon and timezone for a city", async () => {
    const result = await geocode("Tokyo");
    assert.deepEqual(result, {
      lat: 35.6895,
      lon: 139.6917,
      tz: "Asia/Tokyo",
    });
  });

  test("falls back to auto timezone when missing", async () => {
    mock.method(globalThis, "fetch", () =>
      jsonResponse({
        results: [{ latitude: 1, longitude: 2 }],
      })
    );
    const result = await geocode("Nowhere");
    assert.equal(result.tz, "auto");
  });

  test("returns null when the city is not found", async () => {
    mock.method(globalThis, "fetch", () => jsonResponse({ results: [] }));
    assert.equal(await geocode("Atlantis"), null);
  });
});

describe("getCurrentWeather", () => {
  beforeEach(() => {
    mock.method(globalThis, "fetch", fetchStub);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("returns current conditions as JSON", async () => {
    const result = JSON.parse(await getCurrentWeather({ city: "Tokyo" }));
    assert.equal(result.city, "Tokyo");
    assert.equal(result.temperature_c, 21.5);
    assert.equal(result.humidity_pct, 60);
    assert.equal(result.wind_kmh, 12.3);
    assert.equal(result.precipitation_mm, 0);
  });

  test("reports an error for an unknown city", async () => {
    mock.method(globalThis, "fetch", () => jsonResponse({ results: [] }));
    const result = JSON.parse(await getCurrentWeather({ city: "Atlantis" }));
    assert.match(result.error, /Atlantis/);
  });
});

describe("getForecast", () => {
  beforeEach(() => {
    mock.method(globalThis, "fetch", forecastFetchStub);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("returns a forecast for the default 3 days", async () => {
    const result = JSON.parse(await getForecast({ city: "Tokyo" }));
    assert.equal(result.city, "Tokyo");
    assert.equal(result.forecast.length, 2);
    assert.deepEqual(result.forecast[1], {
      date: "2026-08-25",
      high_c: 28,
      low_c: 21,
      rain_chance_pct: 80,
      wind_kmh: 25,
    });
  });

  test("clamps requested days to 7", async () => {
    await getForecast({ city: "Tokyo", days: 99 });
    const calls = globalThis.fetch.mock.calls;
    const forecastUrl = calls
      .map((c) => c.arguments[0])
      .find((u) => new URL(u).pathname === "/v1/forecast");
    assert.equal(new URL(forecastUrl).searchParams.get("forecast_days"), "7");
  });
});

describe("AVAILABLE_FUNCTIONS", () => {
  test("exposes both weather tools", () => {
    assert.deepEqual(Object.keys(AVAILABLE_FUNCTIONS).sort(), [
      "getCurrentWeather",
      "getForecast",
    ]);
  });
});

describe("WeatherAssistant", () => {
  const fakeClient = (messages, replyIndex = 0) => ({
    chat: {
      completions: {
        create: async ({ messages: msgs }) => ({
          choices: [{ message: messages[replyIndex++] }],
        }),
      },
    },
  });

  test("returns the model reply when no tools are called", async () => {
    const assistant = new WeatherAssistant({
      client: fakeClient([{ content: "Sunny in Tokyo!" }]),
      model: "qwen3",
    });
    const reply = await assistant.ask("Weather in Tokyo?");
    assert.equal(reply, "Sunny in Tokyo!");
    assert.equal(assistant.model, "qwen3");
  });

  test("executes tool calls and returns the final answer", async () => {
    mock.method(globalThis, "fetch", forecastFetchStub);

    const client = fakeClient([
      {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "getCurrentWeather",
              arguments: JSON.stringify({ city: "Tokyo" }),
            },
          },
        ],
      },
      { content: "Bring an umbrella." },
    ]);

    const assistant = new WeatherAssistant({ client, model: "qwen3" });
    const reply = await assistant.ask("Should I bring an umbrella?");

    assert.equal(reply, "Bring an umbrella.");

    const toolMessage = assistant.messages.find((m) => m.role === "tool");
    assert.equal(toolMessage.tool_call_id, "call_1");
    assert.match(toolMessage.content, /"city":"Tokyo"/);
  });

  test("falls back to a real client when none is provided", () => {
    const assistant = new WeatherAssistant({ model: "qwen3" });
    assert.ok(assistant.client);
  });
});
