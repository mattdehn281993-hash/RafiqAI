import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, ErrorNote, Screen } from "../components/ui";
import { supabase } from "../lib/supabase";
import { rememberClass } from "./Home";

export function Join() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
    setBusy(false);
    if (error) return setError(error.message);
    rememberClass(data as string);
    navigate(`/class/${data}`, { replace: true });
  }

  return (
    <Screen title="Join a class" back="/">
      <form onSubmit={join} className="mt-4 flex flex-col gap-3">
        <label htmlFor="code" className="text-sm font-medium">
          Invite code
        </label>
        <input
          id="code"
          autoCapitalize="none"
          autoCorrect="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-center font-mono text-2xl tracking-widest"
          placeholder="e.g. 3f9a1c2b"
          required
        />
        <Button type="submit" disabled={busy || code.trim().length < 4}>
          {busy ? "Joining…" : "Join class"}
        </Button>
      </form>
      {error && (
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
      )}
    </Screen>
  );
}
