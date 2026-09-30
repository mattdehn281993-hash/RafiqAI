// Editors create an invite code for classmates.
import { useState } from "react";
import { useParams } from "react-router";
import { Button, ErrorNote, Screen } from "../components/ui";
import { supabase } from "../lib/supabase";

export function Invite() {
  const { classId = "" } = useParams();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from("invites").insert({ class_id: classId }).select("code").single();
    setBusy(false);
    if (error) setError(error.message);
    else setCode(data.code);
  }

  const link = code ? `${location.origin}/join?code=${code}` : "";

  async function share() {
    const text = `Join our Arabic class on Rafiq. Open ${link} or use invite code ${code}.`;
    if (navigator.share) {
      await navigator.share({ title: "Join our Arabic class", text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
    }
  }

  return (
    <Screen title="Invite classmates" back={`/class/${classId}`}>
      <p className="text-muted">Each classmate gets their own account and progress. They'll see this class's pages, cards and audio. Only editors can change shared cards.</p>
      <p className="mt-3 rounded-2xl bg-warn-bg p-3 text-sm text-warn">
        Before inviting classmates, check with the centre or publisher that it is OK to share the textbook content.
      </p>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
      {code ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-surface p-6">
          <p className="text-sm text-muted">Invite code (valid 14 days, up to 30 people)</p>
          <p className="font-mono text-4xl font-bold tracking-widest">{code}</p>
          <Button className="w-full" onClick={share}>
            {copied ? "Copied" : "Share invite"}
          </Button>
        </div>
      ) : (
        <Button className="mt-6 w-full" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create invite code"}
        </Button>
      )}
    </Screen>
  );
}
