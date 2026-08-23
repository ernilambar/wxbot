import { test, describe } from "node:test";
import assert from "node:assert/strict";

import chalk from "chalk";

import {
  wmoIcon,
  sparkline,
  colorTemp,
  renderCurrent,
  renderForecast,
} from "../lib/render.js";

// Tests run without a TTY, so chalk strips colors unless forced on.
chalk.level = 3;

describe("wmoIcon", () => {
  test("maps common WMO codes", () => {
    assert.equal(wmoIcon(0), "☀️");
    assert.equal(wmoIcon(2), "⛅");
    assert.equal(wmoIcon(61), "🌧️");
    assert.equal(wmoIcon(95), "⛈️");
  });

  test("shows moon at night for clear skies", () => {
    assert.equal(wmoIcon(0, 0), "🌙");
  });

  test("falls back for unknown codes", () => {
    assert.equal(wmoIcon(999), "🌡️");
  });
});

describe("sparkline", () => {
  test("renders a bar chart from values", () => {
    const out = sparkline([1, 5, 3, 8, 2]);
    assert.equal(out.length, 5);
    assert.ok(out.includes("▁"));
    assert.ok(out.includes("█"));
  });

  test("handles flat and empty inputs", () => {
    // span is 0 for flat data, so all bars map to the lowest glyph
    assert.equal(sparkline([3, 3, 3]), "▁▁▁");
    assert.equal(sparkline([]), "");
  });
});

describe("colorTemp", () => {
  test("wraps the number in ANSI color codes", () => {
    assert.equal(colorTemp(-15), "\u001b[34m-15°\u001b[39m");
    assert.equal(colorTemp(25), "\u001b[35m25°\u001b[39m");
    assert.equal(colorTemp(35), "\u001b[31m35°\u001b[39m");
  });
});

describe("renderCurrent", () => {
  const sample = {
    city: "Tokyo",
    temperature: 21.5,
    apparent_temperature: 22.1,
    humidity_pct: 60,
    wind_kmh: 12.3,
    wind_gusts_kmh: 18.9,
    precipitation_mm: 0.2,
    weather_code: 2,
    cloud_cover_pct: 45,
    pressure_hpa: 1012,
    uv_index: 4.5,
    is_day: 1,
    sunrise: "2026-08-23T04:30:00",
    sunset: "2026-08-23T18:15:00",
    units: "metric",
  };

  test("renders a readable box", () => {
    const out = renderCurrent(sample);
    assert.match(out, /Tokyo/);
    assert.match(out, /⛅/);
    assert.match(out, /feels like/);
    assert.match(out, /Humidity 60%/);
    assert.match(out, /gusts/);
    assert.match(out, /🌅/);
    assert.match(out, /🌇/);
  });

  test("renders an error message in a red box", () => {
    const out = renderCurrent({ error: "Could not find location: X" });
    assert.match(out, /⚠️/);
    assert.match(out, /Could not find location/);
  });
});

describe("renderForecast", () => {
  const sample = {
    city: "Tokyo",
    units: "metric",
    forecast: [
      {
        date: "2026-08-24",
        high: 30,
        low: 22,
        rain_chance_pct: 10,
        wind_kmh: 15,
        weather_code: 0,
      },
      {
        date: "2026-08-25",
        high: 28,
        low: 21,
        rain_chance_pct: 80,
        wind_kmh: 25,
        weather_code: 61,
      },
    ],
  };

  test("renders sparklines and per-day rows in a box", () => {
    const out = renderForecast(sample);
    assert.match(out, /Tokyo/);
    assert.match(out, /Temps/);
    assert.match(out, /🌧️ 80%/);
    assert.match(out, /☀️/);
    assert.match(out, /30°/);
    assert.match(out, /22°/);
  });
});
