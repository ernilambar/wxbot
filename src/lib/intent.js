/**
 * Deterministic intent parsing for the zero-LLM fast path.
 *
 * The weather numbers come from Open-Meteo, not from the model — the LLM is
 * only a natural-language layer on top of the same tools the fast path calls
 * directly. Anything that can be answered structurally (a current reading or
 * a forecast for a named city) is routed here so it:
 *   - works with no AI backend configured at all,
 *   - skips the completion round trip,
 *   - costs zero tokens.
 *
 * Only a fixed set of phrasings is accepted, and the city is the slot those
 * phrasings name — never "whatever words are left over". Everything else
 * (advice, comparisons, follow-ups that rely on conversation memory) parses to
 * `null` and falls through to the assistant, which is the safe failure.
 */

const MAX_CITY_WORDS = 5

/**
 * Words that never appear in a place name the fast path should trust. A
 * candidate city containing any of them is rejected, so the model gets it.
 */
const NOT_A_PLACE = new Set([
  'weather', 'forecast', 'forecasts', 'outlook', 'temperature', 'temp',
  'conditions', 'today', 'tonight', 'tomorrow', 'yesterday', 'now', 'week',
  'weekend', 'day', 'days', 'last', 'next', 'this', 'coming', 'morning',
  'afternoon', 'evening', 'night', 'and', 'or', 'vs', 'versus', 'compare',
  'compared', 'than', 'with', 'also', 'about', 'what', 'how', 'will', 'is',
  'it', 'be', 'in', 'at', 'for', 'on', 'i', 'me', 'my', 'we', 'you', 'should',
  'need', 'wear', 'bring', 'umbrella', 'jacket', 'raining', 'snowing',
  'fahrenheit', 'celsius', 'metric', 'imperial', 'january', 'february',
  'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december'
])

const DEFAULT_FORECAST_DAYS = 3
const MIN_DAYS = 1
const MAX_DAYS = 7

const LEADING_FILLER_RE = /^(?:(?:please|hey)\s+)?(?:(?:tell|show|give)\s+me\s+|get\s+|check\s+)?(?:(?:what|how)(?:'s|’s|s|\s+is)\s+)?(?:the\s+)?/i

/**
 * Trailing time phrases, stripped one at a time from the end of the message.
 * Each returns how it shapes the plan.
 */
const TIME_SUFFIXES = [
  [/\s+please$/i, () => ({})],
  [/\s+(?:right\s+)?now$/i, () => ({})],
  [/\s+(?:today|tonight)$/i, () => ({ days: 1 })],
  [/\s+tomorrow$/i, () => ({ days: 2, from: 1 })],
  [/\s+in\s+(\d{1,2})\s+days?$/i, (m) => {
    const from = Math.min(Number(m[1]), MAX_DAYS - 1)
    return { days: from + 1, from }
  }],
  [/\s+(?:for|over)?\s*(?:the\s+)?(?:next\s+)?(\d{1,2})\s*[-–]?\s*days?$/i, (m) => ({ days: Number(m[1]) })],
  [/\s+(?:(?:this|the|next|coming)\s+)?weekend$/i, () => ({ days: MAX_DAYS, weekend: true })],
  [/\s+(?:this|next|the\s+coming|the\s+next|for\s+the)\s+week$/i, () => ({ days: MAX_DAYS })]
]

/** Bare trailing count, as in `/forecast Tokyo 5`. Slash commands only. */
const TRAILING_COUNT_RE = /\s+(\d{1,2})$/

const KEYWORD = '(weather|temperature|temp|conditions|forecast|outlook)'
const IN = '(?:in|for|at)'

/** Core phrasings, matched after filler and time phrases are removed. */
const PATTERNS = [
  // "weather in Tokyo", "forecast for Tokyo"
  [new RegExp(`^${KEYWORD}\\s+${IN}\\s+(.+)$`, 'i'), (m) => ({ keyword: m[1], city: m[2] })],
  // "Tokyo weather", "Tokyo 5-day forecast"
  [new RegExp(`^(.+?)\\s+(?:(\\d{1,2})\\s*[-–]?\\s*days?\\s+)?${KEYWORD}$`, 'i'), (m) => ({
    keyword: m[3],
    city: m[1],
    days: m[2] && Number(m[2])
  })],
  // "is it raining in Tokyo" asks about now; "will it rain in Tokyo" asks ahead
  [new RegExp(`^is\\s+it\\s+(?:raining|snowing)\\s+${IN}\\s+(.+)$`, 'i'), (m) => ({ keyword: 'weather', city: m[1] })],
  [new RegExp(`^(?:will\\s+it\\s+(?:rain|snow)|(?:rain|snow))\\s+${IN}\\s+(.+)$`, 'i'), (m) => ({ keyword: 'forecast', city: m[1] })],
  // "how hot is it in Tokyo"
  [new RegExp(`^how\\s+(?:hot|cold|warm|humid|windy)\\s+is\\s+it\\s+${IN}\\s+(.+)$`, 'i'), (m) => ({ keyword: 'weather', city: m[1] })]
]

function clampDays (days) {
  return Math.max(MIN_DAYS, Math.min(days, MAX_DAYS))
}

/** Peel trailing time phrases off `text`, merging what they say about the plan. */
function stripTimeSuffixes (text) {
  let when = {}
  let found = true
  while (found) {
    found = false
    for (const [re, shape] of TIME_SUFFIXES) {
      const match = re.exec(text)
      if (match) {
        when = { ...shape(match), ...when }
        text = text.slice(0, match.index)
        found = true
        break
      }
    }
  }
  return { text, when }
}

/**
 * Normalize a candidate place name, or reject it. "Kathmandu, Nepal" keeps its
 * comma: the geocoder uses the part after it to pick among same-named places.
 */
function cleanCity (raw) {
  const city = raw.replace(/\s*,\s*/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').trim()
  if (!city) return null
  // Letters, spaces and the punctuation real place names use — no digits.
  if (/[^\p{L}\s.,'’-]/u.test(city)) return null
  const words = city.split(/[\s,]+/).filter(Boolean)
  if (words.length > MAX_CITY_WORDS) return null
  if (words.some((word) => NOT_A_PLACE.has(word.toLowerCase()))) return null
  return city
}

function buildPlan (kind, city, when) {
  if (kind === 'current') return { kind, city }
  const plan = { kind, city, days: clampDays(when.days ?? DEFAULT_FORECAST_DAYS) }
  if (when.from) plan.from = when.from
  if (when.weekend) plan.weekend = true
  return plan
}

/**
 * Parse a user message into a deterministic weather lookup.
 *
 * Forecast plans may carry `from` (skip that many leading days, e.g. 1 for
 * "tomorrow") or `weekend: true`; apply them to the result with `selectDays`.
 *
 * @param {string} input
 * @returns {{kind: 'current'|'forecast', city: string, days?: number, from?: number, weekend?: boolean}|null}
 *   `null` when the message needs the model (advice, comparison, follow-up, chit-chat).
 */
export function parseWeatherQuery (input) {
  if (typeof input !== 'string') return null
  const text = input.trim().replace(/\s+/g, ' ').replace(/[?!.]+$/, '')
  if (!text) return null

  // Explicit slash commands: the rest of the line is the city plus time words.
  const command = /^\/(now|forecast)(?:\s+|$)/i.exec(text)
  if (command) {
    const kind = command[1].toLowerCase() === 'now' ? 'current' : 'forecast'
    let { text: rest, when } = stripTimeSuffixes(text.slice(command[0].length))
    const count = TRAILING_COUNT_RE.exec(rest)
    if (count && kind === 'forecast') {
      when = { days: Number(count[1]), ...when }
      rest = rest.slice(0, count.index)
    }
    const city = cleanCity(rest)
    return city ? buildPlan(kind, city, when) : null
  }

  const { text: core, when } = stripTimeSuffixes(text.replace(LEADING_FILLER_RE, ''))
  for (const [re, read] of PATTERNS) {
    const match = re.exec(core)
    if (!match) continue
    const slot = read(match)
    const city = cleanCity(slot.city)
    if (!city) return null
    const merged = slot.days ? { days: slot.days, ...when } : when
    const asksAhead = /forecast|outlook/i.test(slot.keyword) || Object.keys(merged).length > 0
    return buildPlan(asksAhead ? 'forecast' : 'current', city, merged)
  }
  return null
}

function weekday (date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * Narrow a forecast payload to the days a plan asked for ("tomorrow", "in 3
 * days", "this weekend"). Dates are the city's local dates from Open-Meteo, so
 * the weekend is the city's weekend. Error payloads pass through untouched.
 */
export function selectDays (plan, data) {
  if (!Array.isArray(data?.forecast)) return data
  let forecast = data.forecast
  if (plan.weekend) {
    const start = forecast.findIndex((d) => [0, 6].includes(weekday(d.date)))
    if (start !== -1) {
      forecast = forecast.slice(start, weekday(forecast[start].date) === 6 ? start + 2 : start + 1)
    }
  } else if (plan.from) {
    forecast = forecast.slice(plan.from)
  }
  return { ...data, forecast }
}

/** Human-readable label for a plan, e.g. for spinner text. */
export function describePlan (plan) {
  if (!plan) return ''
  if (plan.kind === 'current') return `Looking up ${plan.city}…`
  if (plan.weekend) return `Fetching the weekend forecast for ${plan.city}…`
  if (plan.from === 1 && plan.days === 2) return `Fetching tomorrow's forecast for ${plan.city}…`
  if (plan.from) return `Fetching the forecast for ${plan.city} in ${plan.from} days…`
  return `Fetching ${plan.days}-day forecast for ${plan.city}…`
}
