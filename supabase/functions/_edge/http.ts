// Request plumbing shared by every edge function: CORS, JSON responses, and
// resolving the signed-in user. Deno-only (the Node spikes never import this).
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export type Context = {
  user: User;
  /** Acts as the user: row-level security applies. Use it to check access. */
  userClient: SupabaseClient;
  /** Service role: bypasses row-level security. Only after checking access. */
  admin: SupabaseClient;
};

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Wraps a handler: CORS preflight, sign-in check, and errors as JSON. */
export function handle(fn: (req: Request, ctx: Context) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      const authorization = req.headers.get("Authorization") ?? "";
      const token = authorization.replace(/^Bearer\s+/i, "");
      if (!token) throw new HttpError(401, "Sign in first");

      const url = env("SUPABASE_URL");
      const userClient = createClient(url, env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) throw new HttpError(401, "Sign in first");

      const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return await fn(req, { user: data.user, userClient, admin });
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
    }
  };
}

/** Parse the JSON body, turning malformed input into a 400. */
export async function body<T>(req: Request, parse: (raw: unknown) => T): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  try {
    return parse(raw);
  } catch (err) {
    throw new HttpError(400, `Invalid request: ${err instanceof Error ? err.message : err}`);
  }
}

/** The class the user belongs to (RLS decides), or 403. */
export async function requireClass(ctx: Context, classId: string) {
  const { data, error } = await ctx.userClient.from("classes").select("id, book_id").eq("id", classId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, "You are not in this class");
  return data as { id: string; book_id: string };
}
