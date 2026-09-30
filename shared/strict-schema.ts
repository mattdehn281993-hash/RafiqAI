// Zod → JSON schema for structured outputs.
//
// The SDK's betaZodOutputFormat (0.129) moves `enum` into the description text,
// so enums are not enforced by the API. We build the schema ourselves, keep
// enums, strip the keywords structured outputs rejects, and validate with zod
// after the response arrives.
import * as z from "zod";

const UNSUPPORTED = ["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern"];

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.includes(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, clean(s)])) : clean(v);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { reused: "inline", unrepresentable: "throw" })) as Record<string, unknown>;
}
