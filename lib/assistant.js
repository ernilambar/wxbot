import { createClient } from "./client.js";
import { TOOLS, AVAILABLE_FUNCTIONS } from "./tools.js";

const SYSTEM_PROMPT = `You are a practical weather assistant. When answering:
- Use the tools to get real data; never guess numbers.
- Translate raw numbers into practical advice (umbrella, jacket, sunscreen, whether it's good for outdoor plans).
- Remember city and date context from earlier in the conversation if the user doesn't repeat it.
- Answer directly and concisely. No filler, pleasantries, or sign-offs like "Enjoy your day!", "Have a nice day!", or "Let me know if you need anything else."`;

const COMPLETION_OPTS = {
  // the OpenAI SDK defaults stream to false; explicit here for clarity
  stream: false,
};
const MAX_CONVERSATION_TURNS = 10;

/**
 * Accumulate tool-call deltas from a streamed response. Deltas arrive as
 * fragments keyed by tool_call index (id, name, then argument chunks).
 */
function collectToolCallDeltas(delta, toolCalls) {
  for (const d of delta.tool_calls ?? []) {
    const call = (toolCalls[d.index] ??= {
      id: "",
      type: "function",
      function: { name: "", arguments: "" },
    });
    if (d.id) call.id = d.id;
    if (d.function?.name) call.function.name += d.function.name;
    if (d.function?.arguments) call.function.arguments += d.function.arguments;
  }
}

async function* createStream(client, body) {
  const stream = await client.chat.completions.create(body);
  for await (const chunk of stream) {
    yield chunk;
  }
}

export class WeatherAssistant {
  constructor({ client, model, units = "metric", onDelta, onToolResult } = {}) {
    this.client = client ?? createClient();
    this.model = model ?? process.env.WXBOT_MODEL;
    this.units = units;
    this.onDelta = onDelta;
    this.onToolResult = onToolResult;
    this.messages = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  setUnits(units) {
    this.units = units;
  }

  reset() {
    this.messages = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  trimHistory() {
    const userIndexes = this.messages
      .map((message, index) => (message.role === "user" ? index : -1))
      .filter((index) => index !== -1);
    if (userIndexes.length > MAX_CONVERSATION_TURNS) {
      this.messages = [
        this.messages[0],
        ...this.messages.slice(userIndexes.at(-MAX_CONVERSATION_TURNS)),
      ];
    }
  }

  async runToolCall(call) {
    const fnName = call.function?.name;
    const fn = AVAILABLE_FUNCTIONS[fnName];
    if (!fn) {
      throw new Error(`Model requested unsupported tool: ${fnName || "unknown"}.`);
    }

    let fnArgs;
    try {
      fnArgs = JSON.parse(call.function.arguments || "{}");
    } catch {
      throw new Error(`Model sent invalid arguments for ${fnName}.`);
    }
    if (!fnArgs || Array.isArray(fnArgs) || typeof fnArgs !== "object") {
      throw new Error(`Model sent invalid arguments for ${fnName}.`);
    }

    const result = await fn({ ...fnArgs, units: this.units });
    this.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: result,
    });
    this.onToolResult?.({ name: fnName, args: fnArgs, result });
  }

  async ask(userMessage) {
    this.messages.push({ role: "user", content: userMessage });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: TOOLS,
      ...COMPLETION_OPTS,
    });
    const message = response.choices[0].message;
    this.messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      this.trimHistory();
      return message.content;
    }

    for (const call of toolCalls) {
      await this.runToolCall(call);
    }

    const final = await this.client.chat.completions.create({ model: this.model, messages: this.messages });
    this.messages.push(final.choices[0].message);
    this.trimHistory();
    return final.choices[0].message.content;
  }

  /** Stream a reply, invoking onDelta as text chunks arrive and onToolResult
   *  after each tool finishes. Returns the full assistant reply. */
  async askStream(userMessage) {
    this.messages.push({ role: "user", content: userMessage });

    let full = "";
    let toolCalls = [];

    const stream = await createStream(this.client, {
      model: this.model,
      messages: this.messages,
      tools: TOOLS,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        full += delta.content;
        this.onDelta?.(delta.content);
      }
      if (delta.tool_calls) {
        collectToolCallDeltas(delta, toolCalls);
      }
    }

    if (toolCalls.length > 0) {
      this.messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map(({ index, ...call }) => call),
      });

      for (const call of toolCalls) {
        await this.runToolCall(call);
      }

      // Follow-up streaming completion for the final answer after tools.
      let finalText = "";
      const finalStream = await createStream(this.client, {
        model: this.model,
        messages: this.messages,
        stream: true,
      });
      for await (const chunk of finalStream) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          finalText += delta.content;
          this.onDelta?.(delta.content);
        }
      }
      this.messages.push({ role: "assistant", content: finalText });
      this.trimHistory();
      return finalText;
    }

    this.messages.push({ role: "assistant", content: full });
    this.trimHistory();
    return full;
  }
}
