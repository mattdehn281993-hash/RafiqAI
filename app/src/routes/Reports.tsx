// Editors: classmates' "Report a mistake" messages. Fix the card (new version
// for everyone) or dismiss the report.
import { useState } from "react";
import { useParams } from "react-router";
import { CorrectCardSheet } from "../components/CardEditor";
import { CardTile } from "../components/CardTile";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { forgetAudio } from "../lib/audio";
import { cardsByIds, dismissReport, getClass, saveCardEdits } from "../lib/data";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";

type Report = { id: string; card_id: string; card_version: number; message: string; created_at: string };

export async function openReports(bookId: string) {
  const reports = must(
    await supabase.from("reports").select("id, card_id, card_version, message, created_at").eq("status", "open").order("created_at"),
  ) as Report[];
  const cards = await cardsByIds([...new Set(reports.map((r) => r.card_id))]);
  return reports.filter((r) => cards.get(r.card_id)?.book_id === bookId).map((r) => ({ ...r, card: cards.get(r.card_id)! }));
}

export function Reports() {
  const { classId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    if (cls.role !== "editor") throw new Error("Only editors review reports");
    return openReports(cls.book_id);
  }, [classId]);
  const [fixing, setFixing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Screen title="Reports" back={`/class/${classId}`}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Reports" back={`/class/${classId}`}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const current = data.find((r) => r.id === fixing);

  async function dismiss(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await dismissReport(id);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Reports to review" subtitle={`${data.length} open`} back={`/class/${classId}`}>
      {actionError && <div className="mb-3"><ErrorNote error={actionError} /></div>}
      {data.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">No open reports. Nice.</p>}
      <ol className="flex flex-col gap-4">
        {data.map((r) => (
          <li key={r.id} className="flex flex-col gap-2">
            <p className="rounded-2xl bg-warn-bg p-3 text-sm text-warn">
              “{r.message}”
              {r.card.current_version !== r.card_version && <span className="mt-1 block text-xs">The card has been changed since this report (v{r.card_version} → v{r.card.current_version}).</span>}
            </p>
            <CardTile card={r.card} />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setFixing(r.id)}>
                Fix card
              </Button>
              <Button variant="secondary" disabled={busy === r.id} onClick={() => dismiss(r.id)}>
                {busy === r.id ? "…" : "Dismiss"}
              </Button>
            </div>
          </li>
        ))}
      </ol>

      {current && (
        <CorrectCardSheet
          initial={current.card}
          withUsage={["word", "phrase", "sentence"].includes(current.card.kind)}
          message={current.message}
          onClose={() => setFixing(null)}
          onSave={async (changes, reason) => {
            await saveCardEdits(current.card_id, changes, reason || `report: ${current.message}`, current.id);
            forgetAudio(current.card_id);
            setFixing(null);
            reload();
          }}
        />
      )}
    </Screen>
  );
}
