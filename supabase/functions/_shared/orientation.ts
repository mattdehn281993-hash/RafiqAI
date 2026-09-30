// Phone photos of a page often arrive sideways or upside down. Before reading
// small vowel marks we turn the page upright.
//
// Asking "how many degrees?" about a single sideways thumbnail got 4 of 14 real
// photos wrong by 180°. Showing all four rotations and asking which one is
// upright is a much easier judgement, so the caller renders the candidates
// (sharp in Node, a canvas in the browser) and we pick one.
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { strictJsonSchema } from "./strict-schema.ts";

export type Degrees = 0 | 90 | 180 | 270;
export const ROTATIONS: Degrees[] = [0, 90, 180, 270];
const LABELS = ["A", "B", "C", "D"] as const;

const Choice = z.object({ upright: z.enum(LABELS) });
const CHOICE_SCHEMA = strictJsonSchema(Choice);

const PROMPT = `Images A, B, C and D are the same phone photo of a printed page (mostly Arabic), rotated four different ways.
Which one shows the printed text upright, so that Arabic lines run horizontally, right to left, with letters the right way up?
Judge by the printed text of the main page: page headers and page numbers are good clues. Ignore handwriting and anything at the edges.`;

/**
 * `candidates[i]` is the photo rotated clockwise by ROTATIONS[i] as base64 JPEG, each small
 * (about 700px on the long edge). Returns the clockwise rotation to apply.
 */
export async function detectRotation(client: Anthropic, candidates: string[], model = "claude-opus-5"): Promise<Degrees> {
  const content: Anthropic.ContentBlockParam[] = candidates.flatMap((jpeg, i) => [
    { type: "text" as const, text: `Image ${LABELS[i]}:` },
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: jpeg } },
  ]);
  content.push({ type: "text", text: PROMPT });

  const message = await client.messages.create({
    model,
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: CHOICE_SCHEMA } },
    messages: [{ role: "user", content }],
  });
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`Rotation check returned no answer (stop_reason ${message.stop_reason})`);
  return ROTATIONS[LABELS.indexOf(Choice.parse(JSON.parse(text)).upright)];
}
