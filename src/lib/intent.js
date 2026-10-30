/**
 * Deterministic intent parsing for the zero-LLM fast path.
 *
 * The weather numbers come from Open-Meteo, not from the model — the LLM is
 * only a natural-language layer on top of the same tools the fast path calls
 * directly. Anything that can be answered structurally (a current reading or
 * an N-day forecast for a named city) is routed here so it:
 *   - works with no AI backend configured at all,
 *   - returns in ~300ms instead of a full completion round trip,
 *   - costs zero tokens.
 *
 * Everything else (advice, comparisons, follow-ups that rely on conversation
 * memory) parses to `null` and falls through to the assistant.
 */

const MAX_CITY_WORDS = 4

/**
 * Words that carry no location information in a weather query. Stripped before
 * the remaining tokens are treated as a place name.
 */
const NOISE_WORDS = new Set([
  'a', 'an', 'the', 'in', 'at', 'for', 'of', 'on', 'to', 'from', 'near',
  'around', 'about', 'and', 'with', 'what', 'whats', "what's", 'how', 'is',
  'it', "it's", 'its', 'be', 'like', 'now', 'current', 'currently',
  'conditions', 'condition', 'weather', 'forecast', 'forecasts', 'outlook',
  'temperature', 'temp', 'temperatures', 'today', 'tonight', 'tomorrow', 'this',
  'next', 'coming', 'week', 'weekend', 'day', 'days', 'please', 'tell', 'me',
  'give', 'show', 'check', 'get', 'there', 'here', 'right', 's',
  // Weather conditions are intent, never part of a place name.
  'hot', 'cold', 'warm', 'cool', 'humid', 'humidity', 'windy', 'wind', 'sunny',
  'cloudy', 'foggy', 'rain', 'rains', 'raining', 'rainy', 'snow', 'snows',
  'snowing', 'snowy', 'shower', 'showers', 'precipitation', 'umbrella'
])

/** Anything that needs reasoning over the data, not just the data itself. */
const ADVICE_RE = /\b(should|shall|need|needs|bring|wear|recommend|suggest|better|best|worst|good|bad|advice|umbrella|jacket|coat|sunscreen|compare|versus|vs|or|why|explain|plan|planning|trip|hike|hiking|run|running|jog|cycle|commute|safe|dangerous|drive|pack)\b/i

const FORECAST_TRIGGER_RE = /\b(forecast|outlook|rain|rains|raining|snow|snowing|showers?|precipitation|umbrella)\b/i
const CURRENT_TRIGGER_RE = /\b(weather|now|current|currently|conditions?|temperature|temp|outside|hot|cold|warm|humid|humidity|windy|wind|sunny|cloudy)\b/i

const EXPLICIT_DAYS_RE = /\b(\d{1,2})\s*[-–]?\s*days?\b/i
/** Bare trailing count, as in `/forecast Tokyo 5`. */
const TRAILING_DAYS_RE = /\s\b(\d{1,2})\b\s*$/

/** Relative day phrases, most specific first. */
const DAY_HINTS = [
  [/\b(today|tonight)\b/i, 1],
  [/\btomorrow\b/i, 2],
  [/\bweekend\b/i, 3],
  [/\b(?:this|next)\s+week\b/i, 7]
]

const DEFAULT_FORECAST_DAYS = 3
const MIN_DAYS = 1
const MAX_DAYS = 7

function clampDays (days) {
  return Math.max(MIN_DAYS, Math.min(days, MAX_DAYS))
}

function explicitDays (text) {
  const match = EXPLICIT_DAYS_RE.exec(text) ?? TRAILING_DAYS_RE.exec(text)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isInteger(parsed) ? clampDays(parsed) : null
}

function dayHint (text) {
  for (const [re, days] of DAY_HINTS) {
    if (re.test(text)) return days
  }
  return null
}

/** Strip weather/relative/time words and return what's left as a place name. */
function extractCity (text) {
  const trimmed = text
    .replace(EXPLICIT_DAYS_RE, ' ')
    .replace(TRAILING_DAYS_RE, ' ')
    .replace(/\b(?:this|next|coming|the)\s+week(?:end)?\b/gi, ' ')
    .replace(/\b(?:today|tonight|tomorrow)\b/gi, ' ')

  const tokens = trimmed
    .replace(/[?!.,;:]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !NOISE_WORDS.has(token.toLowerCase()))

  if (tokens.length === 0 || tokens.length > MAX_CITY_WORDS) return null

  const city = tokens.join(' ')
  // A real place name has letters and no digits left over.
  if (!/[a-z]/i.test(city) || /\d/.test(city)) return null
  return city
}

/**
 * Parse a user message into a deterministic weather lookup.
 *
 * @param {string} input
 * @returns {{kind: 'current'|'forecast', city: string, days?: number}|null} `null`
 *   when the message needs the model (advice, comparison, follow-up, chit-chat).
 */
export function parseWeatherQuery (input) {
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (!text) return null

  // Explicit slash commands bypass every heuristic below.
  const command = /^\/(now|forecast)\b/i.exec(text)
  if (command) {
    const kind = command[1].toLowerCase() === 'now' ? 'current' : 'forecast'
    const rest = text.slice(command[0].length)
    const city = extractCity(rest)
    if (!city) return null
    if (kind === 'current') return { kind, city }
    const days = explicitDays(rest) ?? dayHint(rest) ?? DEFAULT_FORECAST_DAYS
    return { kind, city, days: clampDays(days) }
  }

  // "should I bring an umbrella in Tokyo?" — the data alone is not the answer.
  if (ADVICE_RE.test(text)) return null

  const days = explicitDays(text)
  const hint = dayHint(text)
  const hasForecastTrigger = FORECAST_TRIGGER_RE.test(text)
  const hasCurrentTrigger = CURRENT_TRIGGER_RE.test(text)

  let kind
  if (days != null || hasForecastTrigger || hint != null) {
    kind = 'forecast'
  } else if (hasCurrentTrigger) {
    kind = 'current'
  } else {
    return null
  }

  const city = extractCity(text)
  if (!city) return null

  if (kind === 'current') return { kind, city }
  return {
    kind,
    city,
    days: clampDays(days ?? hint ?? DEFAULT_FORECAST_DAYS)
  }
}

/** Human-readable label for a plan, e.g. for spinner text. */
export function describePlan (plan) {
  if (!plan) return ''
  return plan.kind === 'current'
    ? `Looking up ${plan.city}…`
    : `Fetching ${plan.days}-day forecast for ${plan.city}…`
}
