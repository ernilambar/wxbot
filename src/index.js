#!/usr/bin/env bun
/**
 * Weather AI Assistant — Bun CLI
 *
 * Two ways to answer a question:
 *   1. Direct (zero-LLM) — a city + current/forecast lookup is parsed
 *      deterministically and rendered straight from Open-Meteo. No model, no
 *      tokens, no backend required.
 *   2. Assistant — advice, comparisons and conversational follow-ups go to the
 *      model, which calls the same tools for real data.
 */

import readline from 'readline'
import { pathToFileURL } from 'url'
import chalk from 'chalk'
import ora from 'ora'
import yargs from 'yargs'

import pkg from '../package.json'
import { validateEnv, hasEnv } from './lib/client.js'
import { WeatherAssistant } from './lib/assistant.js'
import { getCurrentWeather, getForecast } from './lib/tools.js'
import { parseWeatherQuery, describePlan, selectDays } from './lib/intent.js'
import {
  renderCurrent,
  renderForecast,
  renderCurrentCompact,
  renderForecastCompact
} from './lib/render.js'

const HELP = [
  'Commands:',
  `  ${chalk.cyan('/help')}                  show this help`,
  `  ${chalk.cyan('/now <city>')}           current conditions ${chalk.dim('(no AI)')}`,
  `  ${chalk.cyan('/forecast <city> [n]')}  n-day forecast, 1-7 ${chalk.dim('(no AI)')}`,
  `  ${chalk.cyan('/clear')}                start a fresh conversation (keeps your units)`,
  `  ${chalk.cyan('/units')}                toggle between metric (°C) and imperial (°F)`,
  '',
  `Plain lookups like ${chalk.cyan('weather in Tokyo')} or ${chalk.cyan('forecast for Tokyo 5 days')} are answered without the model.`,
  `Anything else goes to the model. Type ${chalk.yellow('quit')} or ${chalk.yellow('exit')} to leave.`
].join('\n')

const CLI_HELP = [
  `${chalk.bold('wxbot')} ${chalk.dim(pkg.version || '')} — AI weather assistant in your terminal`,
  '',
  chalk.bold('Usage:'),
  `  ${chalk.cyan('wxbot')}                          interactive REPL`,
  `  ${chalk.cyan('wxbot')} "${chalk.yellow('<prompt>')}" [${chalk.yellow('-u <units>')}]  one-shot mode, prints one answer and exits`,
  '',
  chalk.bold('Options:'),
  `  ${chalk.cyan('-h, --help')}             show this help`,
  `  ${chalk.cyan('-v, --version')}          show version`,
  `  ${chalk.cyan('-u, --units <units>')}    set units: ${chalk.yellow('imperial')} or ${chalk.yellow('metric')} (default: metric)`,
  `  ${chalk.cyan('--ai <when>')}            use the model: ${chalk.yellow('auto')}, ${chalk.yellow('always')} or ${chalk.yellow('never')} (default: auto)`,
  '',
  chalk.bold('Examples:'),
  `  ${chalk.cyan('wxbot')} "weather in Tokyo?"                       ${chalk.dim('direct lookup')}`,
  `  ${chalk.cyan('wxbot')} "forecast for Tokyo 5 days"               ${chalk.dim('direct lookup')}`,
  `  ${chalk.cyan('wxbot')} "Will I need an umbrella this week?" ${chalk.yellow('--units imperial')}  ${chalk.dim('model')}`,
  '',
  chalk.bold('Environment:'),
  `  ${chalk.cyan('WXBOT_AI_BASE_URL')}  OpenAI-compatible API endpoint (needed only for advice)`,
  `  ${chalk.cyan('WXBOT_AI_API_KEY')}   API key (optional for local backends)`,
  `  ${chalk.cyan('WXBOT_AI_MODEL')}     Model name to use`
].join('\n')

// Chat labels: distinct colors so turns are easy to scan.
const YOU_LABEL = chalk.bold.cyan('You:')
const ASSISTANT_LABEL = chalk.bold.green('Assistant:')

export function parseArgs (argv) {
  const parsed = yargs(argv)
    .usage('$0 "[prompt]" [options]')
    .option('units', {
      alias: 'u',
      type: 'string',
      choices: ['imperial', 'metric'],
      default: 'metric',
      describe: 'set units: imperial or metric'
    })
    .option('ai', {
      type: 'string',
      choices: ['auto', 'always', 'never'],
      default: 'auto',
      describe: 'when to use the AI model'
    })
    .exitProcess(false)
    .help(false)
    .version(false)
    .fail((msg) => {
      throw new Error(msg)
    })
    .parse()

  const positional = parsed._
  if (positional.length > 1) {
    throw new Error('Prompt must be supplied as a single quoted string.')
  }

  return {
    units: parsed.units,
    prompt: positional[0] ?? '',
    ai: parsed.ai
  }
}

/**
 * Decide how a turn should be answered.
 *
 * Returns a direct plan ({ kind: 'current' | 'forecast', city, days? }) when the
 * message is a self-contained lookup, or { kind: 'llm' } when it needs the
 * model. Explicit /now and /forecast commands are always direct. Otherwise
 * `ai: 'always'` escalates every turn; `ai: 'never'` never does, and callers
 * report an error if the prompt cannot be answered directly.
 */
export function resolveRoute (prompt, { ai = 'auto' } = {}) {
  const direct = parseWeatherQuery(prompt)
  if (direct && prompt.trim().startsWith('/')) return direct
  if (ai === 'always') return { kind: 'llm' }
  return direct ?? { kind: 'llm' }
}

function show (obj, compact = false) {
  if (obj.forecast) {
    return compact ? renderForecastCompact(obj) : renderForecast(obj)
  }
  return compact ? renderCurrentCompact(obj) : renderCurrent(obj)
}

/**
 * Look up a direct plan straight from Open-Meteo — no model, no tokens.
 * Returns the lookup as a tool call ({ name, args, result, data }) so the REPL
 * can record it in the conversation. Failures come back as `data.error` (the
 * tools never throw); callers either render them or hand the turn to the model.
 */
async function lookupDirect (plan, units) {
  const spinner = ora({ text: describePlan(plan) }).start()
  // In a TTY the spinner overwrites its line; when piped, keep it on its own.
  if (!process.stdout.isTTY) process.stdout.write('\n')
  const [name, args] = plan.kind === 'current'
    ? ['getCurrentWeather', { city: plan.city, units }]
    : ['getForecast', { city: plan.city, days: plan.days, units }]
  const fn = name === 'getCurrentWeather' ? getCurrentWeather : getForecast
  const data = selectDays(plan, JSON.parse(await fn(args)))
  spinner.stop()
  return { name, args, result: JSON.stringify(data), data }
}

/**
 * Buffers complete lines while the ora spinner is active and prints them as
 * soon as it stops, so cards never interleave with the spinner or with
 * streamed text.
 *
 * The spinner writes to stderr; streaming deltas and cards go to stdout, and
 * ora hooks stdout while spinning (clear line, write, re-render). Partial
 * streamed text written during a spinner is therefore visually clobbered, so
 * we never write to stdout while the spinner is up: text chunks are queued
 * too, and flushed in order once the spinner is down.
 */
function createPrintQueue (getSpinner) {
  let queue = []
  let flushing = false
  const lastChar = () => {
    for (let i = queue.length - 1; i >= 0; i--) {
      const s = queue[i]
      if (s.length > 0) return s[s.length - 1]
    }
    return null
  }
  const flush = () => {
    if (flushing) return false
    if (queue.length > 0 && !getSpinner()?.isSpinning) {
      flushing = true
      try {
        // Trim trailing newlines (pushBlock ends blocks with one) so the
        // terminator is exactly a single newline, never a blank line.
        const out = queue.join('').replace(/\n+$/, '')
        queue = []
        if (out.length === 0) return false
        process.stdout.write(out + '\n')
        return true
      } finally {
        flushing = false
      }
    }
    return false
  }
  return {
    push (text) {
      queue.push(text)
      flush()
    },
    /** Push a standalone block (e.g. a weather card): own line before and after. */
    pushBlock (text) {
      queue.push((queue.length > 0 && lastChar() !== '\n' ? '\n' : '') + text + '\n')
      flush()
    },
    /** True when queued content would continue mid-line. */
    midLine () {
      return queue.length > 0 && lastChar() !== '\n'
    },
    flush
  }
}

async function oneShot (prompt, units, route, ai) {
  if (route.kind !== 'llm') {
    const { data } = await lookupDirect(route, units)
    // A place the geocoder can't resolve may still be one the model can.
    if (!data.error || ai === 'never' || !hasEnv()) {
      process.stdout.write(show(data) + '\n')
      if (data.error) process.exitCode = 1
      return
    }
  }

  const assistant = new WeatherAssistant({ units })
  let spinner = null
  const printQueue = createPrintQueue(() => spinner)

  spinner = ora({ text: 'Thinking…', discardStdin: false }).start()
  if (!process.stdout.isTTY) process.stdout.write('\n')

  assistant.onDelta = (chunk) => {
    // No "Assistant:" label in one-shot mode — the output is the answer.
    printQueue.push(chunk)
  }
  assistant.onToolResult = ({ name, result }) => {
    if (name === 'getCurrentWeather' || name === 'getForecast') {
      printQueue.pushBlock(show(JSON.parse(result)))
    }
  }

  try {
    const reply = await assistant.askStream(prompt)
    spinner.stop()
    spinner = null
    if (!printQueue.flush() && reply) process.stdout.write('\n')
  } catch (err) {
    spinner?.stop()
    spinner = null
    printQueue.flush()
    console.error('Error:', err.message)
    process.exit(1)
  }
}

async function repl (assistant, { ai } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  let spinner = null
  const printQueue = createPrintQueue(() => spinner)
  rl.setPrompt(`${YOU_LABEL} `)

  // stdin can hit EOF while a turn is still running (piped input); re-prompting
  // a closed interface throws ERR_USE_AFTER_CLOSE.
  let closed = false
  rl.on('close', () => { closed = true })
  const prompt = () => {
    if (!closed) rl.prompt()
  }

  process.once('SIGINT', () => {
    console.log('\nBye!')
    process.exit(0)
  })

  // Show the prompt before the user types, and re-arm it after each turn.
  // Calling rl.prompt() when a line arrives (as the async iterator yields it)
  // would only render "You: " after the input is already submitted, so it
  // never appears where the user expects it.
  prompt()

  // Use the async iterator rather than rl.question: question() does not
  // re-arm reliably with piped stdin across async gaps, so follow-up
  // piped lines would be silently dropped.
  for await (const line of rl) {
    const trimmed = line.trim()
    if (['quit', 'exit'].includes(trimmed.toLowerCase())) {
      break
    }
    if (!trimmed) {
      prompt()
      continue
    }

    const route = resolveRoute(trimmed, { ai })

    if (trimmed.startsWith('/')) {
      const [cmd] = trimmed.split(/\s+/)
      if (cmd === '/help') {
        console.log(HELP)
        prompt()
        continue
      }
      if (cmd === '/clear') {
        assistant.reset()
        console.log('Conversation cleared.')
        prompt()
        continue
      }
      if (cmd === '/units') {
        assistant.setUnits(assistant.units === 'metric' ? 'imperial' : 'metric')
        console.log(`Units set to ${assistant.units === 'metric' ? 'metric (°C)' : 'imperial (°F)'}.`)
        prompt()
        continue
      }
      if (route.kind === 'llm') {
        if (cmd === '/now' || cmd === '/forecast') {
          const usage = cmd === '/now' ? '/now <city>' : '/forecast <city> [days 1-7]'
          console.log(`Which city? Usage: ${chalk.cyan(usage)}`)
        } else {
          const hint = ai === 'never' ? ' (AI is disabled by --ai never)' : ''
          console.log(`Unknown command: ${cmd}${hint}. Type /help for a list.`)
        }
        prompt()
        continue
      }
    }

    if (route.kind !== 'llm') {
      const lookup = await lookupDirect(route, assistant.units)
      // A place the geocoder can't resolve may still be one the model can.
      if (!lookup.data.error || ai === 'never' || !hasEnv()) {
        process.stdout.write(show(lookup.data) + '\n')
        // Recorded so a follow-up like "what about tomorrow?" knows the city.
        if (!lookup.data.error) assistant.recordLookup(trimmed, lookup)
        prompt()
        continue
      }
    }

    if (ai === 'never') {
      console.log(
        chalk.yellow('--ai never is set, so that question can\'t be answered.') +
          ` Try a direct lookup, e.g. ${chalk.cyan('weather in Tokyo')} or ${chalk.cyan('/forecast Tokyo 5')}.`
      )
      prompt()
      continue
    }

    if (!hasEnv()) {
      console.log(
        chalk.yellow('No AI backend configured.') +
          ` Direct lookups still work: ${chalk.cyan('weather in Tokyo')}, ${chalk.cyan('/now Tokyo')}, ${chalk.cyan('/forecast Tokyo 5')}.`
      )
      prompt()
      continue
    }

    try {
      spinner = ora({ text: 'Thinking…', discardStdin: false }).start()
      // In a TTY the spinner overwrites its line; when piped, put it on its
      // own line so it doesn't append to the prompt.
      if (!process.stdout.isTTY) process.stdout.write('\n')

      let labeled = false
      assistant.onDelta = (chunk) => {
        // Label the assistant's first streamed chunk, then queue everything
        // while the spinner is up; it's flushed in order once the spinner
        // stops. Writing to stdout while ora is spinning causes the
        // spinner's re-render to clobber the partial line.
        // Start on a fresh line when queued content ends mid-line (e.g. a
        // tool card or partial text was already pushed).
        const prefix = labeled ? '' : `${ASSISTANT_LABEL} `
        const gap = labeled ? '' : printQueue.midLine() ? '\n' : ''
        printQueue.push(gap + prefix + chunk)
        labeled = true
      }
      assistant.onToolResult = ({ name, result }) => {
        if (name === 'getCurrentWeather' || name === 'getForecast') {
          printQueue.pushBlock(show(JSON.parse(result), true))
        }
      }
      const reply = await assistant.askStream(trimmed)
      spinner.stop()
      spinner = null
      // The spinner is down, so flush() prints the queued streamed text and
      // any tool-result cards now. If the model produced no streamed text
      // (e.g. only tool cards), close the line so the next prompt starts fresh.
      if (!printQueue.flush() && reply) process.stdout.write('\n')
    } catch (err) {
      spinner?.stop()
      spinner = null
      printQueue.flush()
      console.error(chalk.red(`Error: ${err.message}`))
    }
    prompt()
  }
  rl.close()
}

export async function main () {
  const args = process.argv.slice(2)

  // -v / --version prints the version and exits without needing env vars.
  if (args.includes('-v') || args.includes('--version')) {
    console.log(pkg.version)
    return
  }

  // -h / --help prints usage and exits without needing env vars.
  if (args.includes('-h') || args.includes('--help')) {
    console.log(CLI_HELP)
    return
  }

  let parsed
  try {
    parsed = parseArgs(args)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exitCode = 1
    return
  }

  const hasPrompt = parsed.prompt.length > 0
  const route = resolveRoute(parsed.prompt, { ai: parsed.ai })

  // Only a one-shot model answer needs credentials up front; the REPL checks
  // per turn, and a direct lookup never touches them.
  if (hasPrompt && route.kind === 'llm') {
    if (parsed.ai === 'never') {
      console.error(
        `Error: --ai never is set but "${parsed.prompt}" needs the assistant.\n` +
          'Try a direct lookup such as: wxbot "weather in Tokyo" --ai never'
      )
      process.exitCode = 1
      return
    }
    try {
      validateEnv()
    } catch (err) {
      console.error(`Error: ${err.message}`)
      process.exitCode = 1
      return
    }
  }

  if (hasPrompt) {
    await oneShot(parsed.prompt, parsed.units, route, parsed.ai)
    return
  }

  const assistant = new WeatherAssistant({ units: parsed.units })
  const ready = 'Weather assistant ready. Try "weather in Tokyo?" — /help for commands, quit to exit.'
  console.log(`${ready}\n`)
  if (!hasEnv()) {
    console.log(
      chalk.dim('No AI backend configured: direct lookups (/now, /forecast, "weather in <city>") still work.\n')
    )
  }

  await repl(assistant, { ai: parsed.ai })
}

// Only run the CLI when executed directly (bun src/index.js),
// not when imported by tests or other modules.
const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main()
}
