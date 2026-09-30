// POST { class_name, map } → { class_id }
// Creates the book, its lessons and a class from a checked Book Map. The caller
// becomes the class editor and can then invite classmates.
import * as z from "zod";
import { BookMap } from "../_shared/read-contents.ts";
import { body, handle, json } from "../_edge/http.ts";

const Body = z.object({
  class_name: z.string().trim().min(1).max(80),
  map: BookMap,
});

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));
  const { data, error } = await ctx.admin.rpc("create_class_from_book_map", {
    p_user: ctx.user.id,
    p_class_name: input.class_name,
    p_map: input.map,
  });
  if (error) throw error;
  return json({ class_id: data });
}));
