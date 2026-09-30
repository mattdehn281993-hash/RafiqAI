// Email sign-in, no password. The email has a link, and a 6-digit code once our
// own email sender is set up (scripts/configure-auth.mjs); typing the code keeps
// the student inside the installed app.
import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { Button, ErrorNote } from "../components/ui";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function SignIn() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    // Only same-site paths, so a crafted ?next= can't send people elsewhere.
    const next = params.get("next");
    return <Navigate to={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} replace />;
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const next = params.get("next");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: location.origin + (next && next.startsWith("/") && !next.startsWith("//") ? next : "/") },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <p className="font-arabic text-6xl text-accent" lang="ar" dir="rtl">
        رَفِيق
      </p>
      <h1 className="mt-2 text-3xl font-bold">Rafiq</h1>
      <p className="mt-2 text-muted">Your companion for Arabic class: every textbook page explained, with easy pronunciation and audio.</p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">
            Your email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 rounded-2xl border border-border bg-surface px-4"
            placeholder="you@example.com"
          />
          <Button type="submit" disabled={busy || !email}>
            {busy ? "Sending…" : "Send me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="text-sm font-medium">
            We emailed {email}. Tap the link in the email, or type the 6-digit code if it has one.
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.4em]"
          />
          <Button type="submit" disabled={busy || code.length < 6}>
            {busy ? "Checking…" : "Sign in"}
          </Button>
          <button type="button" className="min-h-11 text-sm text-muted" onClick={() => setStep("email")}>
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
