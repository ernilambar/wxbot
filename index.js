#!/usr/bin/env node
/**
 * Weather AI Assistant — Node.js CLI
 *
 * A conversational local LLM agent with:
 *   - Current weather + multi-day forecast
 *   - Conversational memory (remembers city, date across turns)
 *   - Practical recommendations (umbrella, clothing, activity suitability)
 */

import readline from "readline";
import { pathToFileURL } from "url";
import chalk from "chalk";
import ora from "ora";

import { validateEnv } from "./lib/client.js";
import { WeatherAssistant } from "./lib/assistant.js";
import { renderCurrent, renderForecast } from "./lib/render.js";

const HELP = [
  "Commands:",
  `  ${chalk.cyan("/help")}       show this help`,
  `  ${chalk.cyan("/clear")}      start a fresh conversation (keeps your units)`,
  `  ${chalk.cyan("/units")}      toggle between metric (°C) and imperial (°F)`,
  "",
  `Anything else is sent to the model. Type ${chalk.yellow("quit")} or ${chalk.yellow("exit")} to leave.`,
].join("\n");

function parseUnits(argv) {
  const arg = argv.find((a) => a === "c" || a === "f");
  return arg === "f" ? "imperial" : "metric";
}

function show(obj) {
  if (obj.forecast) return renderForecast(obj);
  return renderCurrent(obj);
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
function createPrintQueue(getSpinner) {
  let queue = [];
  let flushing = false;
  const flush = () => {
    if (flushing) return false;
    if (queue.length > 0 && !getSpinner()?.isSpinning) {
      flushing = true;
      try {
        process.stdout.write(queue.join("") + "\n");
        queue = [];
        return true;
      } finally {
        flushing = false;
      }
    }
    return false;
  };
  return {
    push(text) {
      queue.push(text);
      flush();
    },
    flush,
  };
}

function oneShot(argv) {
  const [prompt, ...rest] = argv;
  const units = parseUnits(rest);

  if (!prompt) {
    console.error("Usage: wxbot [prompt] [c|f]");
    process.exit(1);
  }

  const assistant = new WeatherAssistant({ units });

  assistant.onToolResult = ({ name, result }) => {
    if (name === "getCurrentWeather" || name === "getForecast") {
      const obj = JSON.parse(result);
      console.log(show(obj));
    }
  };

  assistant
    .ask(prompt)
    .then((reply) => {
      console.log(reply);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

async function repl(assistant) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let spinner = null;
  const printQueue = createPrintQueue(() => spinner);
  rl.setPrompt("You: ");

  // Show the prompt before the user types, and re-arm it after each turn.
  // Calling rl.prompt() when a line arrives (as the async iterator yields it)
  // would only render "You: " after the input is already submitted, so it
  // never appears where the user expects it.
  rl.prompt();

  // Use the async iterator rather than rl.question: question() does not
  // re-arm reliably with piped stdin across async gaps, so follow-up
  // piped lines would be silently dropped.
  for await (const line of rl) {
    const trimmed = line.trim();
    if (["quit", "exit"].includes(trimmed.toLowerCase())) {
      break;
    }
    if (trimmed.startsWith("/")) {
      const [cmd] = trimmed.split(/\s+/);
      switch (cmd) {
        case "/help":
          console.log(HELP);
          break;
        case "/clear":
          assistant.reset();
          console.log("Conversation cleared.");
          break;
        case "/units":
          assistant.setUnits(assistant.units === "metric" ? "imperial" : "metric");
          console.log(`Units set to ${assistant.units === "metric" ? "metric (°C)" : "imperial (°F)"}.`);
          break;
        default:
          console.log(`Unknown command: ${cmd}. Type /help for a list.`);
      }
      rl.prompt();
      continue;
    }
    try {
      spinner = ora({ text: "Thinking…", discardStdin: false }).start();
      // In a TTY the spinner overwrites its line; when piped, put it on its
      // own line so it doesn't append to the prompt.
      if (!process.stdout.isTTY) process.stdout.write("\n");

      let labeled = false;
      assistant.onDelta = (chunk) => {
        // Label the assistant's first streamed chunk, then queue everything
        // while the spinner is up; it's flushed in order once the spinner
        // stops. Writing to stdout while ora is spinning causes the
        // spinner's re-render to clobber the partial line.
        printQueue.push(labeled ? chunk : `Assistant: ${chunk}`);
        labeled = true;
      };
      assistant.onToolResult = ({ name, result }) => {
        if (name === "getCurrentWeather" || name === "getForecast") {
          printQueue.push(show(JSON.parse(result)));
        }
      };
      const reply = await assistant.askStream(trimmed);
      spinner.stop();
      spinner = null;
      // The spinner is down, so flush() prints the queued streamed text and
      // any tool-result cards now. If the model produced no streamed text
      // (e.g. only tool cards), close the line so the next prompt starts fresh.
      if (!printQueue.flush() && reply) process.stdout.write("\n");
    } catch (err) {
      spinner?.stop();
      spinner = null;
      printQueue.flush();
      console.error(chalk.red(`Error: ${err.message}`));
    }
    rl.prompt();
  }
  rl.close();
}

export async function main() {
  validateEnv();
  const args = process.argv.slice(2);
  const hasPrompt = args.some((a) => !a.startsWith("-") && a !== "c" && a !== "f");

  if (hasPrompt) {
    oneShot(args);
    return;
  }

  const assistant = new WeatherAssistant({ units: parseUnits(args) });
  console.log(
    chalk.bold(`Using model "${process.env.WXBOT_MODEL}"`) +
      chalk.dim(` at ${process.env.WXBOT_BASE_URL}`)
  );
  console.log("Weather assistant ready. Type /help for commands, quit to exit.\n");

  await repl(assistant);
}

// Only run the CLI when executed directly (node index.js),
// not when imported by tests or other modules.
const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main();
}
