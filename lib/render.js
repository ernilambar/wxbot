import chalk from "chalk";
import boxen from "boxen";

// ---------- Terminal rendering ----------

const WMO = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌦️",
  56: "🌧️",
  57: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "🌨️",
  77: "🌨️",
  80: "🌦️",
  81: "🌧️",
  82: "⛈️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

export const WMO_ICONS = WMO;

export function wmoIcon(code, isDay = 1) {
  if (code === 0 && !isDay) return "🌙";
  return WMO[code] ?? "🌡️";
}

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values) {
  if (!values || values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v) => SPARK[Math.min(7, Math.max(0, Math.round(((v - min) / span) * 7)))])
    .join("");
}

export function colorTemp(celsius) {
  if (celsius <= -10) return chalk.blue(`${celsius}°`);
  if (celsius < 0) return chalk.cyan(`${celsius}°`);
  if (celsius < 10) return chalk.green(`${celsius}°`);
  if (celsius < 20) return chalk.yellow(`${celsius}°`);
  if (celsius < 30) return chalk.magenta(`${celsius}°`);
  return chalk.red(`${celsius}°`);
}

function tempLabel(temp, units) {
  return units === "imperial" ? `${temp}°F` : `${temp}°C`;
}

function windLabel(kmh, units) {
  return units === "imperial" ? `${kmh} mph` : `${kmh} km/h`;
}

function uvLabel(uv) {
  if (uv == null) return "";
  const label = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";
  return `${label} (${uv})`;
}

function fmt(num) {
  if (num == null || Number.isNaN(num)) return "—";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function weatherLabel(code) {
  const labels = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Foggy",
    51: "Drizzle",
    53: "Drizzle",
    55: "Drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm, hail",
    99: "Thunderstorm, hail",
  };
  return labels[code] ?? "Unknown";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso, units) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function box(text, opts = {}) {
  return boxen(text, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    ...opts,
  });
}

export function renderCurrent(obj) {
  if (obj.error) return box(chalk.red(`⚠️  ${obj.error}`), { borderColor: "red" });
  const icon = wmoIcon(obj.weather_code, obj.is_day);
  const title = `${icon} ${chalk.bold(obj.city)} — ${weatherLabel(obj.weather_code ?? -1)}`;
  const tempLine = obj.apparent_temperature != null
    ? `${colorTemp(obj.temperature)} (feels like ${tempLabel(obj.apparent_temperature, obj.units)})`
    : colorTemp(obj.temperature);
  const lines = [
    title,
    tempLine,
    `Humidity ${obj.humidity_pct ?? "—"}% · Wind ${windLabel(obj.wind_kmh, obj.units)}` +
      (obj.wind_gusts_kmh != null ? ` (gusts ${windLabel(obj.wind_gusts_kmh, obj.units)})` : ""),
  ];
  if (obj.precipitation_mm != null) {
    lines.push(`Precipitation ${fmt(obj.precipitation_mm)} mm`);
  }
  if (obj.cloud_cover_pct != null) lines.push(`Cloud cover ${obj.cloud_cover_pct}%`);
  if (obj.pressure_hpa != null) lines.push(`Pressure ${fmt(obj.pressure_hpa)} hPa`);
  if (obj.uv_index != null) lines.push(`UV ${uvLabel(obj.uv_index)}`);
  if (obj.sunrise || obj.sunset) {
    lines.push(`🌅 ${fmtTime(obj.sunrise, obj.units)}  🌇 ${fmtTime(obj.sunset, obj.units)}`);
  }
  return box(lines.join("\n"));
}

export function renderForecast(obj) {
  if (obj.error) return box(chalk.red(`⚠️  ${obj.error}`), { borderColor: "red" });
  const rows = [];
  const high = obj.forecast.map((d) => d.high ?? 0);
  const low = obj.forecast.map((d) => d.low ?? 0);
  rows.push(`${chalk.bold(obj.city)} — ${obj.forecast.length}-day forecast`);
  rows.push(`Temps   ${chalk.dim(sparkline(low))}${" ".repeat(Math.max(0, 10 - low.length))}${chalk.dim(sparkline(high))}`);
  rows.push(""); // spacer before per-day lines
  for (const d of obj.forecast) {
    const icon = wmoIcon(d.weather_code, 1);
    const range = `H ${colorTemp(d.high)} · L ${colorTemp(d.low)}`;
    const rain = d.rain_chance_pct != null ? ` · 🌧️ ${d.rain_chance_pct}%` : "";
    const wind = d.wind_kmh != null ? ` · 💨 ${windLabel(d.wind_kmh, obj.units)}` : "";
    rows.push(`${icon} ${fmtDate(d.date)}  ${range}${rain}${wind}`);
  }
  return box(rows.join("\n"));
}
