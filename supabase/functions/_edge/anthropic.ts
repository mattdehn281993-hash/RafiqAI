import Anthropic from "@anthropic-ai/sdk";
import { env } from "./http.ts";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  return client;
}
