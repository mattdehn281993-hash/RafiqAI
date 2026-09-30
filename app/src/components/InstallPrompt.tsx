// "Add Rafiq to your home screen": a real Install button on Android, the two
// Safari steps on iPhone. Hidden once installed or when dismissed (for 14 days).
import { useInstall } from "../lib/install";

export function InstallPrompt() {
  const { mode, install, dismiss } = useInstall();
  if (!mode) return null;

  return (
    <div className="mb-3 flex items-start gap-3 rounded-3xl border border-accent bg-accent-soft p-4">
      <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-accent">Add Rafiq to your home screen</p>
        {mode === "android" ? (
          <>
            <p className="mt-0.5 text-sm">Opens like an app, full screen, one tap away in class.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={install} className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent active:scale-[0.98]">
                Install
              </button>
              <button onClick={dismiss} className="min-h-11 px-3 text-sm text-muted">
                Not now
              </button>
            </div>
          </>
        ) : (
          <>
            <ol className="mt-1 space-y-1 text-sm">
              <li className="flex items-center gap-1.5">
                1. Tap
                <svg viewBox="0 0 24 24" className="inline size-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
                  <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                </svg>
                <strong>Share</strong> in Safari's toolbar
              </li>
              <li>
                2. Choose <strong>Add to Home Screen</strong>
              </li>
            </ol>
            <p className="mt-1 text-xs text-muted">Not in Safari? Open this page in Safari first.</p>
            <button onClick={dismiss} className="mt-1 min-h-11 text-sm text-muted">
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
