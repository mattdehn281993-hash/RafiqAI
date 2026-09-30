// Book Map: photograph the title and contents pages once; Rafiq builds the
// lesson list in the book's order and creates the class. At /class/:id/setup-map
// it adds the lesson list to an existing class that has none.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { BookMap } from "@shared/read-contents.ts";
import { Button, ErrorNote, Screen, Section } from "../components/ui";
import { makeUpright } from "../lib/image";
import { callFunction } from "../lib/supabase";
import { rememberClass } from "./Home";

type Photo = { file: File; url: string };
type Step = { kind: "pick" } | { kind: "working"; label: string; started: number } | { kind: "review"; map: BookMap };

export function Setup() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [className, setClassName] = useState("My Arabic class");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { classId } = useParams(); // set: add a lesson list to this class

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  function add(files: FileList | null) {
    if (!files) return;
    setPhotos((prev) => [...prev, ...Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  async function read() {
    setError(null);
    try {
      const images: string[] = [];
      for (const [i, p] of photos.entries()) {
        setStep({ kind: "working", label: `Turning photo ${i + 1} of ${photos.length} upright…`, started: Date.now() });
        const upright = await makeUpright(p.file, 2000);
        URL.revokeObjectURL(upright.previewUrl);
        images.push(upright.base64);
      }
      setStep({ kind: "working", label: "Reading the contents pages. This takes about a minute; keep the app open.", started: Date.now() });
      const { map } = await callFunction<{ map: BookMap }>("read-contents", { images });
      setStep({ kind: "review", map });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: "pick" });
    }
  }

  async function create(map: BookMap) {
    setError(null);
    setStep({ kind: "working", label: classId ? "Adding your lesson list…" : "Creating your class…", started: Date.now() });
    try {
      if (classId) {
        await callFunction<{ filed_pages: number }>("card-review", { action: "book_map", class_id: classId, map });
        navigate(`/class/${classId}`, { replace: true });
        return;
      }
      const { class_id } = await callFunction<{ class_id: string }>("create-class", { class_name: className.trim(), map });
      rememberClass(class_id);
      navigate(`/class/${class_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: "review", map });
    }
  }

  if (step.kind === "working") {
    return (
      <Screen title="Setting up your textbook">
        <Working label={step.label} started={step.started} />
      </Screen>
    );
  }

  if (step.kind === "review") {
    const { map } = step;
    const lessons = map.units.flatMap((u) => u.lessons).filter((l) => l.kind !== "front_matter");
    const unsure = lessons.filter((l) => l.needs_checking).length;
    const empty = lessons.length === 0;
    return (
      <Screen
        title="Check your lesson list"
        back
        action={
          empty ? (
            <Button className="w-full" onClick={() => setStep({ kind: "pick" })}>
              Add the contents pages
            </Button>
          ) : (
            <Button className="w-full" disabled={!classId && !className.trim()} onClick={() => create(map)}>
              {classId ? `Add ${lessons.length} lessons to the class` : `Create class with ${lessons.length} lessons`}
            </Button>
          )
        }
      >
        <div className="rounded-2xl bg-surface p-4">
          <p className="font-arabic text-xl" lang="ar" dir="rtl">
            {map.book_title_ar}
          </p>
          <p className="text-sm text-muted">
            {[map.book_title_en, map.level_en, map.year].filter(Boolean).join(" · ")}
          </p>
        </div>
        {empty && (
          <p className="mt-3 rounded-2xl bg-bad-bg p-3 text-sm text-bad">
            No lessons were found. These photos seem to be only the title or cover. Add every contents page (فهرس المحتويات), the pages listing the lessons with page numbers.
          </p>
        )}
        {unsure > 0 && <p className="mt-3 rounded-2xl bg-warn-bg p-3 text-sm text-warn">{unsure} rows need checking. They're marked below.</p>}
        {error && <div className="mt-3"><ErrorNote error={error} /></div>}

        {!classId && (
          <>
            <label htmlFor="class-name" className="mt-5 block text-sm font-medium">
              Class name
            </label>
            <input
              id="class-name"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-2xl border border-border bg-surface px-4"
            />
          </>
        )}

        {map.units.map((u, i) => (
          <Section key={i} title={u.title_en ?? "Introduction"}>
            {u.letters && (
              <p className="mb-2 font-arabic text-lg text-muted" lang="ar" dir="rtl">
                {u.letters}
              </p>
            )}
            <ul className="divide-y divide-border rounded-2xl bg-surface">
              {u.lessons.map((l, j) => (
                <li key={j} className={`flex items-center gap-3 px-4 py-2.5 ${l.needs_checking ? "bg-warn-bg" : ""}`}>
                  <span className="w-10 text-center font-arabic text-2xl text-accent" lang="ar">
                    {l.focus && l.focus.length <= 2 ? l.focus : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.title_en}</span>
                    <span className="block truncate font-arabic text-sm text-muted" lang="ar" dir="rtl">
                      {l.title_ar}
                    </span>
                  </span>
                  <span className="text-xs text-muted">p. {l.page ?? "?"}</span>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </Screen>
    );
  }

  return (
    <Screen
      title={classId ? "Add your lesson list" : "Set up your textbook"}
      back={classId ? `/class/${classId}` : "/"}
      action={
        <Button className="w-full" disabled={photos.length === 0} onClick={read}>
          Read {photos.length || ""} photo{photos.length === 1 ? "" : "s"}
        </Button>
      }
    >
      <p className="mt-1 text-muted">
        Photograph the <strong className="text-text">title page</strong> and every <strong className="text-text">contents page</strong> (فهرس المحتويات, the pages listing each lesson with its page number), in order. You only do this once.
      </p>
      {error && <div className="mt-4"><ErrorNote error={error} /></div>}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => camera.current?.click()}>
          Take photo
        </Button>
        <Button variant="secondary" onClick={() => gallery.current?.click()}>
          Choose photos
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {photos.length > 0 && (
        <ol className="mt-5 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.url} className="relative overflow-hidden rounded-xl border border-border bg-surface">
              <img src={p.url} alt={`Photo ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
              <span className="absolute left-1 top-1 rounded-full bg-bg/90 px-2 text-xs font-bold">{i + 1}</span>
              <button
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-bg/90 text-lg"
                onClick={() => setPhotos((prev) => prev.filter((x) => x !== p))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </Screen>
  );
}

export function Working({ label, started }: { label: string; started: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - started) / 1000));
  return (
    <div className="flex flex-col items-center gap-4 pt-16 text-center" role="status" aria-live="polite">
      <div className="size-12 animate-spin rounded-full border-4 border-border border-t-accent" />
      <p className="max-w-xs text-muted">{label}</p>
      <p className="font-mono text-sm text-muted">{secs}s</p>
    </div>
  );
}
