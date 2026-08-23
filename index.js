#!/usr/bin/env node
/**
 * Weather AI Assistant — Node.js CLI
 *
 * A conversational local LLM agent with:
 *   - Current weather + multi-day forecast
 *   - Conversational memory (remembers city, date across turns)
 *   - Practical recommendations (umbrella, clothing, activity suitability)
 *
 * Requirements:
 *   npm install
 *   ollama pull qwen3        // or llama3.3, any tool-calling-capable model
 *   ollama serve running locally
 *
 * Run:
 *   node index.js
 *   // or, after npm link: weather-assistant
 */

import OpenAI from "openai";
import readline from "readline";

// --- Configuration via environment variables ---
// Works with ANY OpenAI-compatible endpoint: Ollama, LM Studio, llama.cpp server,
// vLLM, text-generation-webui, or a hosted API like OpenAI/Groq/Together.
const { WXBOT_BASE_URL, WXBOT_API_KEY, WXBOT_MODEL } = process.env;

const missing = ["WXBOT_BASE_URL", "WXBOT_API_KEY", "WXBOT_MODEL"].filter(
  (v) => !process.env[v]
);
if (missing.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missing.join(", ")}\n` +
      `Set them in your shell profile, e.g.:\n` +
      `  export WXBOT_BASE_URL="http://localhost:11434/v1"\n` +
      `  export WXBOT_API_KEY="your-api-key"\n` +
      `  export WXBOT_MODEL="qwen3"`
  );
  process.exit(1);
}

const client = new OpenAI({
  baseURL: WXBOT_BASE_URL,
  apiKey: WXBOT_API_KEY,
});

// ---------- Tool implementations ----------

async function geocode(city) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");

  const res = await fetch(url);
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const loc = data.results[0];
  return { lat: loc.latitude, lon: loc.longitude, tz: loc.timezone || "auto" };
}

async function getCurrentWeather({ city }) {
  const coords = await geocode(city);
  if (!coords) return JSON.stringify({ error: `Could not find location: ${city}` });

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coords.lat);
  url.searchParams.set("longitude", coords.lon);
  url.searchParams.set("timezone", coords.tz);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code"
  );

  const res = await fetch(url);
  const data = await res.json();
  const c = data.current;

  return JSON.stringify({
    city,
    temperature_c: c.temperature_2m,
    humidity_pct: c.relative_humidity_2m,
    wind_kmh: c.wind_speed_10m,
    precipitation_mm: c.precipitation,
  });
}

async function getForecast({ city, days = 3 }) {
  const coords = await geocode(city);
  if (!coords) return JSON.stringify({ error: `Could not find location: ${city}` });

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coords.lat);
  url.searchParams.set("longitude", coords.lon);
  url.searchParams.set("timezone", coords.tz);
  url.searchParams.set("forecast_days", String(Math.min(days, 7)));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max"
  );

  const res = await fetch(url);
  const data = await res.json();
  const d = data.daily;

  const forecast = d.time.map((date, i) => ({
    date,
    high_c: d.temperature_2m_max[i],
    low_c: d.temperature_2m_min[i],
    rain_chance_pct: d.precipitation_probability_max[i],
    wind_kmh: d.wind_speed_10m_max[i],
  }));

  return JSON.stringify({ city, forecast });
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "getCurrentWeather",
      description: "Get current weather conditions for a city right now",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getForecast",
      description:
        "Get a multi-day weather forecast for a city, including rain probability and temperature range per day",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          days: { type: "integer", description: "Number of days to forecast, 1-7" },
        },
        required: ["city"],
      },
    },
  },
];

const AVAILABLE_FUNCTIONS = {
  getCurrentWeather,
  getForecast,
};

const SYSTEM_PROMPT = `You are a practical weather assistant. When answering:
- Use the tools to get real data; never guess numbers.
- Translate raw numbers into practical advice (umbrella, jacket, sunscreen, whether it's good for outdoor plans).
- Remember city and date context from earlier in the conversation if the user doesn't repeat it.
- Keep answers conversational and concise, not a data dump.`;

// ---------- Agent with conversational memory ----------

class WeatherAssistant {
  constructor() {
    this.messages = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  async ask(userMessage) {
    this.messages.push({ role: "user", content: userMessage });

    const response = await client.chat.completions.create({
      model: WXBOT_MODEL,
      messages: this.messages,
      tools: TOOLS,
    });
    const message = response.choices[0].message;
    this.messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return message.content;
    }

    for (const call of toolCalls) {
      const fnName = call.function.name;
      const fnArgs = JSON.parse(call.function.arguments); // OpenAI sends args as a JSON string
      const result = await AVAILABLE_FUNCTIONS[fnName](fnArgs);
      this.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    const final = await client.chat.completions.create({ model: WXBOT_MODEL, messages: this.messages });
    this.messages.push(final.choices[0].message);
    return final.choices[0].message.content;
  }
}

// ---------- CLI loop ----------

async function main() {
  const assistant = new WeatherAssistant();
  console.log(`Using model "${WXBOT_MODEL}" at ${WXBOT_BASE_URL}`);
  console.log(
    "Weather assistant ready. Ask me anything (e.g. 'should I bring an umbrella to Tokyo this week?'). Type 'quit' to exit.\n"
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question("You: ", async (query) => {
      if (["quit", "exit"].includes(query.trim().toLowerCase())) {
        rl.close();
        return;
      }
      try {
        const reply = await assistant.ask(query);
        console.log("Assistant:", reply, "\n");
      } catch (err) {
        console.error("Error:", err.message, "\n");
      }
      prompt();
    });
  };

  prompt();
}

main();
