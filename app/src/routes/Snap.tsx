// Page Helper: snap the page → turned upright → read → the student checks the
// cards next to the photo, fixes anything wrong, and saves. The photo only
// lives on the phone until then, and is discarded once the page is saved.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { PageExtraction, PageItem } from "@shared/card-schema.ts";
import { Button, ErrorNote, Screen } from "../components/ui";
import { ArabicText } from "../components/ArabicText";
import { getClass, lessonForPage, lessonsOf } from "../lib/data";
import { makeUpright, type UprightPhoto } from "../lib/image";
import { callFunction } from "../lib/supabase";
import { useAsync } from "../lib/useAsync";
import { Working } from "./Setup";

type ExplainResult = {
  extraction: PageExtraction;
  model: string;
  promptVersion: string;
  latencyMs: number;
  existing_page_id: string | null;
};

type Step =
  | { kind: "pick" }
  | { kind: "working"; label: string; started: number }
  | { kind: "review"; photo: UprightPhoto; result: ExplainResult };

export function Snap() {
  const { classId = "" } = useParams();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [items, setItems] = useState<PageItem[]>([]);
  const [lessonId, setLessonId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);

  const ctx = useAsync(async () => {
    const cls = await getClass(classId);
    return { cls, ...(await lessonsOf(cls.book_id)) };
  }, [classId]);

  // Discard the photo whenever it's replaced or the screen closes.
  const photoUrl = step.kind === "review" ? step.photo.previewUrl : null;
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setStep({ kind: "working", label: "Turning the page upright…", started: Date.now() });
      const photo = await makeUpright(file);
      setStep({ kind: "working", label: "Reading every Arabic item on the page. Usually 30–60 seconds.", started: Date.now() });
      const result = await callFunction<ExplainResult>("explain-page", { class_id: classId, image: photo.base64 });
      const sorted = [...result.extraction.items].sort((a, b) => a.order - b.order);
      setItems(sorted);
      const pageNumber = Number(result.extraction.page_number);
      const guess = ctx.data && lessonForPage(ctx.data.lessons, Number.isInteger(pageNumber) ? pageNumber : null);
      setLessonId(guess?.id ?? ctx.data?.cls.current_lesson_id ?? "");
      setShowPhoto(true);
      setStep({ kind: "review", photo, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: "pick" });
    }
  }

  async function save() {
    if (step.kind !== "review") return;
    const { result } = step;
    setError(null);
    setStep({ kind: "working", label: "Saving the page…", started: Date.now() });
    try {
      const { page_id } = await callFunction<{ page_id: string }>("save-page", {
        class_id: classId,
        lesson_id: lessonId || null,
        extraction: { ...result.extraction, items: items.map((it, i) => ({ ...it, order: i + 1 })) },
        model: result.model,
        prompt_version: result.promptVersion,
      });
      navigate(`/class/${classId}/page/${page_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep(step);
    }
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );

  if (step.kind === "working") {
    return (
      <Screen title="Page Helper" back={`/class/${classId}`}>
        <Working label={step.label} started={step.started} />
      </Screen>
    );
  }

  if (step.kind === "pick") {
    return (
      <Screen
        title="Page Helper"
        back={`/class/${classId}`}
        action={
          <div className="flex flex-col gap-2">
            <Button className="w-full text-lg" onClick={() => camera.current?.click()}>
              Take a photo of the page
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => gallery.current?.click()}>
              Choose from photos
            </Button>
          </div>
        }
      >
        {inputs}
        {error && <div className="mt-2"><ErrorNote error={error} /></div>}
        <div className="mt-4 rounded-3xl bg-surface p-5">
          <p className="font-semibold">For the best result</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>One page per photo, filling the frame</li>
            <li>Good light, no shadow across the text</li>
            <li>Hold the phone straight above the page</li>
            <li>Sideways is fine; Rafiq turns it upright</li>
          </ul>
        </div>
      </Screen>
    );
  }

  const { photo, result } = step;
  const x = result.extraction;
  const flagged = items.filter((i) => i.needs_checking).length;

  return (
    <Screen
      title={x.page_number ? `Page ${x.page_number}` : "Check the page"}
      subtitle={`${items.length} items · check them against the photo`}
      back={`/class/${classId}`}
      action={
        result.existing_page_id ? undefined : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep({ kind: "pick" })}>
              Retake
            </Button>
            <Button className="flex-1" onClick={save} disabled={items.length === 0}>
              Looks right, save
            </Button>
          </div>
        )
      }
    >
      {inputs}
      {result.existing_page_id && (
        <div className="mb-3 rounded-2xl bg-accent-soft p-4 text-accent">
          <p className="font-semibold">This page is already saved.</p>
          <Link to={`/class/${classId}/page/${result.existing_page_id}`} className="mt-1 inline-block min-h-11 font-semibold underline">
            Open the saved page
          </Link>
        </div>
      )}
      {error && <div className="mb-3"><ErrorNote error={error} /></div>}

      <p className="text-sm">{x.page_summary}</p>
      {flagged > 0 && <p className="mt-2 rounded-2xl bg-warn-bg p-3 text-sm text-warn">{flagged} item{flagged > 1 ? "s" : ""} need checking. Compare them with the photo, or retake it.</p>}
      {x.image_quality !== "good" && x.image_quality_note && <p className="mt-2 text-sm text-muted">Photo: {x.image_quality_note}</p>}

      <div className="mt-3">
        <button className="min-h-11 text-sm font-semibold text-accent" onClick={() => setShowPhoto((s) => !s)}>
          {showPhoto ? "Hide photo" : "Show photo"}
        </button>
        {showPhoto && <img src={photo.previewUrl} alt="The page you photographed" className="mt-1 max-h-[45dvh] w-full rounded-2xl border border-border object-contain" />}
      </div>

      {ctx.data && (
        <label className="mt-3 block">
          <span className="text-sm font-medium">Lesson</span>
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-border bg-surface px-3">
            <option value="">Not part of a lesson</option>
            {ctx.data.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title_en ?? l.title_ar}
                {l.start_page ? ` (p. ${l.start_page})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="mt-4 text-xs text-muted">Light vowel marks were added by Rafiq; dark ones are printed in the book.</p>
      <ol className="mt-2 flex flex-col gap-2">
        {items.map((item, i) =>
          editing === i ? (
            <EditItem
              key={i}
              item={item}
              onDone={(next) => {
                setItems((all) => all.map((it, j) => (j === i ? next : it)));
                setEditing(null);
              }}
              onRemove={() => {
                setItems((all) => all.filter((_, j) => j !== i));
                setEditing(null);
              }}
            />
          ) : (
            <li key={i} className={`rounded-2xl border bg-surface p-3 ${item.needs_checking ? "border-warn" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-h-11 shrink-0 text-sm font-semibold text-accent" onClick={() => setEditing(i)}>
                  Edit
                </button>
                <ArabicText printed={item.arabic_printed} full={item.arabic_full} className={item.arabic_full.length > 40 ? "text-xl" : "text-3xl"} />
              </div>
              <p className="font-bold text-accent">{item.pronunciation}</p>
              <p className="text-[15px]">{item.english}</p>
              {item.needs_checking && <p className="mt-1 text-sm text-warn">Needs checking{item.needs_checking_reason ? `: ${item.needs_checking_reason}` : ""}</p>}
            </li>
          ),
        )}
      </ol>
    </Screen>
  );
}

function EditItem({ item, onDone, onRemove }: { item: PageItem; onDone: (item: PageItem) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(item);
  const field = (key: "arabic_printed" | "arabic_full" | "tts_text" | "pronunciation" | "english", label: string, arabic = false) => (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        dir={arabic ? "rtl" : "ltr"}
        lang={arabic ? "ar" : "en"}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className={`mt-0.5 min-h-12 w-full rounded-xl border border-border bg-bg px-3 ${arabic ? "font-arabic text-xl" : ""}`}
      />
    </label>
  );
  return (
    <li className="flex flex-col gap-2 rounded-2xl border-2 border-accent bg-surface p-3">
      {field("arabic_printed", "Arabic exactly as printed", true)}
      {field("arabic_full", "Arabic with all vowel marks", true)}
      {field("tts_text", "What the voice says", true)}
      {field("pronunciation", "Easy pronunciation")}
      {field("english", "English meaning")}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5" checked={draft.needs_checking} onChange={(e) => setDraft({ ...draft, needs_checking: e.target.checked })} />
        <span className="text-sm">Needs checking</span>
      </label>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onDone(draft)}>
          Done
        </Button>
        <Button variant="secondary" className="text-bad" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  );
}
