// POST { class_id, page_id } → { saved, eligible }
// Creates speaking practice for a saved page: a short conversation for each
// word, phrase or sentence that doesn't have one yet. Stored beside the cards
// (card_usages); the textbook cards and their versions never change.
import * as z from "zod";
import { CardUsage, CONVERSATIONAL_KINDS, isCompleteUsage } from "../_shared/card-schema.ts";
import { strictJsonSchema } from "../_shared/strict-schema.ts";
import { EXPLAIN_PAGE_MODEL } from "../_shared/explain-page.ts";
import { anthropic } from "../_edge/anthropic.ts";
import { body, handle, HttpError, json, requireClass } from "../_edge/http.ts";

const Body = z.object({ class_id: z.uuid(), page_id: z.uuid() });
const Output = z.object({ items: z.array(z.object({ card_id: z.string(), usage: CardUsage.nullable() })) });
const OUTPUT_SCHEMA = strictJsonSchema(Output);
const BATCH = 15; // keeps each answer well inside the token budget and the function time limit

type Candidate = { id: string; kind: string; arabic_full: string; pronunciation: string; english: string };

const PROMPT = `Turn the useful Arabic textbook items below into total-beginner speaking practice.
For each input card return its exact card_id once. Set usage to null for anything with no natural use in conversation.
For every useful word, phrase or sentence, write a realistic two-line Modern Standard Arabic exchange:
- context: one short English sentence describing a concrete situation (class or everyday life)
- prompt_arabic: what another person says, fully vowelled; prompt_pronunciation and prompt_english for it
- response_arabic: the student's natural reply, fully vowelled, and it must contain the target item (only the grammatical changes needed to use it); response_pronunciation and response_english for it
- tip: one short reusable sentence pattern, not a grammar lecture
Pronunciation: syllables separated by hyphens, the stressed syllable in CAPITALS, long vowels doubled (aa, ii, uu), as in the input cards.
Keep it at total-beginner level. Every field must be filled in. This is teaching material, not text from the book.

CARDS:
`;

async function generate(batch: Candidate[]) {
  const cards = batch.map(({ id, kind, arabic_full, pronunciation, english }) => ({ card_id: id, kind, arabic: arabic_full, pronunciation, english }));
  const message = await anthropic()
    .beta.messages.stream({
      model: EXPLAIN_PAGE_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: PROMPT + JSON.stringify(cards) }],
    })
    .finalMessage();

  if (message.stop_reason === "refusal") throw new HttpError(422, "Rafiq couldn't create practice for this page");
  if (message.stop_reason === "max_tokens") throw new HttpError(422, "This page is too long to create practice in one go. Try again");
  const text = message.content.find((block) => block.type === "text")?.text;
  if (!text) throw new HttpError(422, "Rafiq couldn't create practice for this page");
  try {
    return Output.parse(JSON.parse(text)).items;
  } catch {
    throw new HttpError(422, "Rafiq's answer was incomplete. Try again");
  }
}

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));
  const cls = await requireClass(ctx, input.class_id);
  const { data: page } = await ctx.userClient.from("pages").select("id").eq("id", input.page_id).eq("book_id", cls.book_id).maybeSingle();
  if (!page) throw new HttpError(404, "Page not found");

  const { data: placed, error: placedError } = await ctx.userClient
    .from("page_cards").select("card_id, position").eq("page_id", input.page_id).order("position");
  if (placedError) throw placedError;
  const ids = (placed ?? []).map((row) => row.card_id as string);
  if (!ids.length) return json({ saved: 0, eligible: 0 });

  const { data: cards, error: cardsError } = await ctx.userClient
    .from("current_cards").select("id, kind, arabic_full, pronunciation, english, usage").in("id", ids);
  if (cardsError) throw cardsError;
  // Only words, phrases and sentences that have no practice yet go to the model.
  const kinds = new Set<string>(CONVERSATIONAL_KINDS);
  const missing = (cards ?? []).filter((c) => kinds.has(c.kind) && !c.usage) as Candidate[];
  if (!missing.length) return json({ saved: 0, eligible: 0 });

  // Batches run side by side so a word-heavy page stays inside the function time limit.
  const batches: Candidate[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  const allowed = new Set(missing.map((c) => c.id));
  const items = (await Promise.all(batches.map(generate)))
    .flat()
    .filter((item) => allowed.has(item.card_id) && item.usage && isCompleteUsage(item.usage));
  if (!items.length) return json({ saved: 0, eligible: missing.length });

  const { data, error } = await ctx.admin.rpc("save_page_usages", { p_user: ctx.user.id, p_page: input.page_id, p_items: items });
  if (error) throw error;
  return json({ saved: data, eligible: missing.length });
}));
