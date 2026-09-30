// "Download for offline" card: saves letters, conversation, your pages and all
// their audio on the phone, with progress. The download code loads on demand.
import { useState } from "react";
import type { OfflineReady } from "../lib/offline";
import { useOnline } from "../lib/online";
import { Button } from "./ui";

function readReady(): OfflineReady | null {
  try {
    return JSON.parse(localStorage.getItem("rafiq:offlineReady") ?? "null");
  } catch {
    return null;
  }
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

export function OfflineDownload() {
  const online = useOnline();
  const [ready, setReady] = useState(readReady);
  const [step, setStep] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setStep({ label: "Starting", done: 0, total: 1 });
    try {
      const { downloadForOffline } = await import("../lib/offline");
      setReady(await downloadForOffline((label, done, total) => setStep({ label, done, total })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="rounded-3xl bg-surface p-4">
      <p className="font-bold">Use Rafiq without internet</p>
      <p className="mt-1 text-sm text-muted">
        Saves the alphabet, conversation, your saved pages and all their audio on this phone. Snapping new pages and saving progress still need internet.
      </p>
      {step ? (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="text-sm">
            {step.label}… {step.total > 1 ? `${step.done} of ${step.total}` : ""}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft">
            <div className="h-full bg-accent transition-all" style={{ width: `${step.total ? (step.done / step.total) * 100 : 0}%` }} />
          </div>
        </div>
      ) : (
        <>
          {ready && (
            <p className="mt-2 text-sm text-accent">
              Ready offline · {ready.clips} audio clips · updated {ago(ready.at)}
              {ready.failed ? ` · ${ready.failed} couldn't be saved` : ""}
            </p>
          )}
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
          <Button variant={ready ? "secondary" : "primary"} className="mt-3 w-full" disabled={!online} onClick={run}>
            {!online ? "Connect to the internet to download" : ready ? "Update offline copy" : "Download for offline"}
          </Button>
        </>
      )}
    </div>
  );
}
