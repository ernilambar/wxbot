// ---------- Tool implementations ----------

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export async function geocode(city) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");

  const res = await fetch(url);
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const loc = data.results[0];
  return { lat: loc.latitude, lon: loc.longitude, tz: loc.timezone || "auto" };
}

async function getCurrentWeatherRaw({ city, units = "metric" }) {
  const coords = await geocode(city);
  if (!coords) return { error: `Could not find location: ${city}` };

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", coords.lat);
  url.searchParams.set("longitude", coords.lon);
  url.searchParams.set("timezone", coords.tz);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index"
  );
  if (units === "imperial") {
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
  }
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url);
  const data = await res.json();
  const c = data.current;

  const daily = data.daily ?? {};
  return {
    city,
    temperature: c.temperature_2m,
    apparent_temperature: c.apparent_temperature,
    humidity_pct: c.relative_humidity_2m,
    wind_kmh: c.wind_speed_10m,
    wind_direction: c.wind_direction_10m,
    wind_gusts_kmh: c.wind_gusts_10m,
    precipitation_mm: c.precipitation,
    rain_mm: c.rain,
    showers_mm: c.showers,
    snowfall_cm: c.snowfall,
    weather_code: c.weather_code,
    cloud_cover_pct: c.cloud_cover,
    pressure_hpa: c.pressure_msl ?? c.surface_pressure,
    uv_index: c.uv_index,
    is_day: c.is_day,
    sunrise: daily.sunrise?.[0],
    sunset: daily.sunset?.[0],
    units,
  };
}

async function getForecastRaw({ city, days = 3, units = "metric" }) {
  const coords = await geocode(city);
  if (!coords) return { error: `Could not find location: ${city}` };

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", coords.lat);
  url.searchParams.set("longitude", coords.lon);
  url.searchParams.set("timezone", coords.tz);
  url.searchParams.set("forecast_days", String(Math.min(days, 7)));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,weather_code,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset"
  );
  if (units === "imperial") {
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
  }

  const res = await fetch(url);
  const data = await res.json();
  const d = data.daily;

  const forecast = d.time.map((date, i) => ({
    date,
    high: d.temperature_2m_max[i],
    low: d.temperature_2m_min[i],
    apparent_high: d.apparent_temperature_max[i],
    apparent_low: d.apparent_temperature_min[i],
    rain_chance_pct: d.precipitation_probability_max[i],
    precipitation_mm: d.precipitation_sum[i],
    rain_mm: d.rain_sum[i],
    showers_mm: d.showers_sum[i],
    snowfall_cm: d.snowfall_sum[i],
    weather_code: d.weather_code[i],
    wind_kmh: d.wind_speed_10m_max[i],
    wind_gusts_kmh: d.wind_gusts_10m_max[i],
    uv_index: d.uv_index_max[i],
    sunrise: d.sunrise?.[i],
    sunset: d.sunset?.[i],
  }));

  return { city, units, forecast };
}

// The tool-calling loop hands raw JSON strings back to the model. The rich
// payloads below are also what the terminal renders (see lib/render.js).
export async function getCurrentWeather(args) {
  return JSON.stringify(await getCurrentWeatherRaw(args));
}

export async function getForecast(args) {
  return JSON.stringify(await getForecastRaw(args));
}

export const AVAILABLE_FUNCTIONS = {
  getCurrentWeather,
  getForecast,
};

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "getCurrentWeather",
      description:
        "Get current weather conditions for a city: temperature, feels-like, humidity, wind, gusts, precipitation, cloud cover, pressure, UV index, sunrise/sunset",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          units: {
            type: "string",
            enum: ["metric", "imperial"],
            description: "Temperature/wind/precipitation units. Omit to use default.",
          },
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
        "Get a multi-day weather forecast for a city, including daily high/low, rain chance and amount, snow, wind and gusts, UV index, weather code and sunrise/sunset",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          days: { type: "integer", description: "Number of days to forecast, 1-7" },
          units: {
            type: "string",
            enum: ["metric", "imperial"],
            description: "Temperature/wind/precipitation units. Omit to use default.",
          },
        },
        required: ["city"],
      },
    },
  },
];
