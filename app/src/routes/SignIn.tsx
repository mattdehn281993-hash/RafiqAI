// Sign in with email + password: no email is sent, so the free plan's email
// limit never blocks it, and the session lasts until you sign out. The phone's
// password manager can save and fill it. Backup: a one-time email link/code.
import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { Button, ErrorNote } from "../components/ui";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

type Tab = "signin" | "create" | "email";

/** Supabase's messages, in plain words. */
function friendly(message: string, tab: Tab): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them, or create an account if you're new.";
  if (/already registered|already exists/i.test(message))
    return "This email already has an account. Sign in with your password. If you've never set one, use “Email me a link” once, then set a password under Account.";
  if (/rate limit|too many/i.test(message)) return "Too many emails were sent recently. Sign in with your password instead, or try the email link again in an hour.";
  if (/password.*(at least|short|characters)/i.test(message)) return "Use a password of at least 8 characters.";
  if (tab === "email" && /signups not allowed/i.test(message)) return "No account for this email yet. Create one with a password.";
  return message;
}

export function SignIn() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only same-site paths, so a crafted ?next= can't send people elsewhere.
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (session) return <Navigate to={target} replace />;

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(friendly(error.message, tab));
    return !error;
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    const creds = { email: email.trim(), password };
    run(() => (tab === "create" ? supabase.auth.signUp(creds) : supabase.auth.signInWithPassword(creds)));
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + target } }),
    );
    if (ok) setCodeSent(true);
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    run(() => supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" }));
  };

  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(t);
        setError(null);
      }}
      aria-pressed={tab === t}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold ${tab === t ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
    >
      {label}
    </button>
  );

  const emailField = (
    <label className="block">
      <span className="text-sm font-medium">Email</span>
      <input
        type="email"
        inputMode="email"
        autoComplete={tab === "create" ? "email" : "username"}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 min-h-12 w-full rounded-2xl border border-border bg-surface px-4"
        placeholder="you@example.com"
      />
    </label>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <img src="/icon-192.png" alt="" className="size-20 rounded-3xl shadow-sm" />
      <h1 className="mt-3 text-3xl font-bold">Rafiq</h1>
      <p className="mt-1 text-muted">Arabic from the very first letter: the alphabet, everyday conversation, and your textbook explained with audio.</p>

      {tab !== "email" ? (
        <>
          <div className="mt-6 flex gap-1 rounded-2xl bg-soft p-1">
            {tabButton("signin", "Sign in")}
            {tabButton("create", "Create account")}
          </div>
          <form onSubmit={submitPassword} className="mt-4 flex flex-col gap-3">
            {emailField}
            <label className="block">
              <span className="text-sm font-medium">{tab === "create" ? "Choose a password (8+ characters)" : "Password"}</span>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={tab === "create" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-1 my-1 min-w-16 rounded-xl px-3 text-sm font-semibold text-accent"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <Button type="submit" disabled={busy || !email || password.length < 8}>
              {busy ? "One moment…" : tab === "create" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <p className="mt-3 text-center text-xs text-muted">You stay signed in on this phone until you sign out.</p>
          <button type="button" className="mt-4 min-h-11 text-sm text-muted underline" onClick={() => { setTab("email"); setError(null); }}>
            Forgot password or no password yet? Email me a link
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-6 text-lg font-bold">Sign in with an email link</h2>
          <p className="text-sm text-muted">For an account without a password, or if you forgot it. Afterwards, set a password under Account so you won't need emails again.</p>
          {!codeSent ? (
            <form onSubmit={sendLink} className="mt-4 flex flex-col gap-3">
              {emailField}
              <Button type="submit" disabled={busy || !email}>
                {busy ? "Sending…" : "Email me a link"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-4 flex flex-col gap-3">
              <p className="text-sm">
                We emailed <strong>{email}</strong>. Tap the link in the email on this phone, or type the 6-digit code if it has one.
              </p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.4em]"
                aria-label="6-digit code"
              />
              <Button type="submit" disabled={busy || code.length < 6}>
                {busy ? "Checking…" : "Sign in with code"}
              </Button>
            </form>
          )}
          <button type="button" className="mt-4 min-h-11 text-sm text-muted underline" onClick={() => { setTab("signin"); setCodeSent(false); setError(null); }}>
            Back to password sign-in
          </button>
        </>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
