// Account: who's signed in, set or change the password (so email links are never
// needed again), and sign out.
import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Screen, Section } from "../components/ui";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function Account() {
  const { session } = useAuth();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");

  async function save(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setState(/at least|short|characters/i.test(error.message) ? "Use a password of at least 8 characters." : error.message);
    else {
      setState("saved");
      setPassword("");
    }
  }

  return (
    <Screen title="Account" back="/">
      <div className="rounded-3xl bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Signed in as</p>
        <p className="mt-1 break-all font-semibold">{session?.user.email}</p>
        <p className="mt-2 text-sm text-muted">You stay signed in on this phone until you sign out.</p>
      </div>

      <Section title="Password">
        <form onSubmit={save} className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
          <p className="text-sm text-muted">Set a password to sign in without waiting for emails. Your phone can save it for you.</p>
          {/* Hidden username helps password managers save the right account. */}
          <input type="email" autoComplete="username" value={session?.user.email ?? ""} readOnly hidden />
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              className="min-h-12 w-full rounded-2xl border border-border bg-bg px-4 pr-20"
              aria-label="New password"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-1 my-1 min-w-16 rounded-xl px-3 text-sm font-semibold text-accent">
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <Button type="submit" disabled={state === "saving" || password.length < 8}>
            {state === "saving" ? "Saving…" : "Save password"}
          </Button>
          {state === "saved" && <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent">Password saved. Next time, sign in with your email and this password.</p>}
          {state !== "idle" && state !== "saving" && state !== "saved" && <ErrorNote error={state} />}
        </form>
      </Section>

      <Button variant="secondary" className="mt-8 w-full" onClick={() => supabase.auth.signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}
