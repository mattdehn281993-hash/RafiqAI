import { createClient } from "@supabase/supabase-js";

// Both are public by design (they ship inside the app; row-level security
// protects the data). Defaults keep a deploy working even without env vars.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://abocurfmlkxyijcrniie.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable__TH1dz8PnJ1bFcYNz6IFjQ_hWgVL1c-",
);

/** Calls an edge function; turns its `{ error }` body into a thrown Error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        message = (await context.json()).error ?? message;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  return data as T;
}
