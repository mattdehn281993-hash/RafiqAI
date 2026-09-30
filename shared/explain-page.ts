// One page photo in, structured cards out.
import type Anthropic from "@anthropic-ai/sdk";
import { PageExtraction } from "./card-schema.ts";
import { EXPLAIN_PAGE_SYSTEM, EXPLAIN_PAGE_USER, PROMPT_VERSION } from "./explain-page-prompt.ts";
import { strictJsonSchema } from "./strict-schema.ts";

export const EXPLAIN_PAGE_MODEL = "claude-opus-5";

const PAGE_SCHEMA = strictJsonSchema(PageExtraction);

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ExplainPageResult = {
  extraction: PageExtraction;
  model: string;
  promptVersion: string;
  effort: Effort;
  latencyMs: number;
  usage: { input_tokens: number; output_tokens: number };
};

export class ExplainPageError extends Error {}

export async function explainPage(
  client: Anthropic,
  image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  opts: { effort?: Effort; model?: string } = {},
): Promise<ExplainPageResult> {
  const effort = opts.effort ?? "high";
  const model = opts.model ?? EXPLAIN_PAGE_MODEL;
  const started = Date.now();

  // Streaming because a dense page can produce a long response.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema: PAGE_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: EXPLAIN_PAGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
          { type: "text", text: EXPLAIN_PAGE_USER },
        ],
      },
    ],
  });
  const message = await stream.finalMessage();
  const latencyMs = Date.now() - started;

  if (message.stop_reason === "refusal") {
    throw new ExplainPageError(`Model declined the page (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new ExplainPageError("Response was cut off at max_tokens; the page may be too dense for one request");
  }
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new ExplainPageError("Response had no text content");
  let parsed: PageExtraction;
  try {
    parsed = PageExtraction.parse(JSON.parse(text));
  } catch (err) {
    throw new ExplainPageError(`Response did not match the card schema: ${err}`);
  }

  return {
    extraction: parsed,
    model: message.model,
    promptVersion: PROMPT_VERSION,
    effort,
    latencyMs,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}
