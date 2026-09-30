// Conversation: everyday phrases for a conversation class (greetings, how are
// you, name, where you're from, age) and a dialogue to listen to or role-play.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TOPICS, topicPhraseKeys, type Topic } from "@shared/conversations.ts";
import { ArabicText } from "../components/ArabicText";
import { CardTile } from "../components/CardTile";
import { Flashcards, QuizRunner, ScoreSummary } from "../components/Practice";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { playCardToEnd, prepareAudio } from "../lib/audio";
import { builtinCards } from "../lib/builtin";
import { savedCardIds, toggleSaved } from "../lib/data";
import { recordResults, type Result } from "../lib/progress";
import { buildQuiz } from "../lib/quiz";
import type { Card } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { LearnSwitch } from "./Alphabet";

export function TalkList() {
  const { classId = "" } = useParams();
  return (
    <Screen title="Learn" subtitle="Everyday conversation for class" classId={classId}>
      <LearnSwitch classId={classId} active="talk" />
      <ol className="mt-3 flex flex-col gap-2">
        {TOPICS.map((t, i) => (
          <li key={t.key}>
            <Link to={`/class/${classId}/talk/${t.key}`} className="flex min-h-20 items-center gap-3 rounded-3xl bg-surface p-4 active:bg-soft">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft font-bold text-accent">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t.title}</span>
                <span className="block text-sm text-muted">{t.summary}</span>
              </span>
              <span className="font-arabic text-lg text-accent" lang="ar" dir="rtl">
                {t.title_ar}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-2xl bg-soft p-3 text-xs text-muted">
        These phrases were drafted by Rafiq for a Modern Standard Arabic class. Ask your teacher to check them, and tell us if anything is said differently in your class.
      </p>
    </Screen>
  );
}

type Mode = "learn" | "cards" | "quiz" | "done";

export function TalkTopic() {
  const { classId = "", topicKey = "" } = useParams();
  const navigate = useNavigate();
  const topic = TOPICS.find((t) => t.key === topicKey);
  const { data, error, loading, reload } = useAsync(async () => {
    const [all, saved] = await Promise.all([builtinCards(), savedCardIds()]);
    const conversation = [...all.entries()].filter(([k]) => k.startsWith("conv-")).map(([, c]) => c);
    const cards = topic ? topicPhraseKeys(topic).map((k) => all.get(k)).filter((c): c is Card => !!c) : [];
    return { all, cards, conversation, saved };
  }, [topicKey]);
  const [mode, setMode] = useState<Mode>("learn");
  const [results, setResults] = useState<Result[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    setSaved(data.saved);
    prepareAudio(data.cards.map((c) => c.id)).catch(() => {});
  }, [data]);
  const byId = useMemo(() => new Map((data?.conversation ?? []).map((c) => [c.id, c])), [data]);

  if (!topic) return <Screen title="Conversation" back={`/class/${classId}/talk`}><ErrorNote error="Topic not found" /></Screen>;
  if (loading && !data) return <Screen title={topic.title} back={`/class/${classId}/talk`} classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title={topic.title} back={`/class/${classId}/talk`} classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  async function finish(r: Result[]) {
    setResults(r);
    setMode("done");
    await recordResults(r).catch(() => {});
  }

  async function toggle(cardId: string) {
    const was = saved.has(cardId);
    setSaved((s) => {
      const next = new Set(s);
      if (was) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    await toggleSaved(cardId, null, was).catch(() => setSaved(data!.saved));
  }

  if (mode === "cards") {
    return (
      <Screen title={topic.title} subtitle="Say it, then check" back={`/class/${classId}/talk`} classId={classId}>
        <Flashcards cards={data.cards} onDone={finish} />
      </Screen>
    );
  }
  if (mode === "quiz") {
    return (
      <Screen title={topic.title} subtitle="Quiz" back={`/class/${classId}/talk`} classId={classId}>
        <QuizRunner questions={buildQuiz(data.cards, data.conversation, 12)} onDone={finish} />
      </Screen>
    );
  }
  if (mode === "done") {
    return (
      <Screen title={topic.title} back={`/class/${classId}/talk`} classId={classId}>
        <ScoreSummary results={results} cards={byId}>
          <Button className="w-full" onClick={() => setMode("learn")}>
            Back to the phrases
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => navigate(`/class/${classId}/talk`)}>
            All topics
          </Button>
        </ScoreSummary>
      </Screen>
    );
  }

  return (
    <Screen
      title={topic.title}
      subtitle={topic.summary}
      back={`/class/${classId}/talk`}
      classId={classId}
      action={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setMode("cards")}>
            Say them
          </Button>
          <Button onClick={() => setMode("quiz")}>Quiz me</Button>
        </div>
      }
    >
      <p className="font-arabic text-2xl text-accent" lang="ar" dir="rtl">
        {topic.title_ar}
      </p>
      {topic.dialogue ? (
        <Dialogue topic={topic} cards={data.all} />
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {data.cards.map((c) => (
            <CardTile key={c.id} card={c} saved={saved.has(c.id)} onToggleSave={() => toggle(c.id)} />
          ))}
        </div>
      )}
    </Screen>
  );
}

/** Chat-style dialogue: play it all, or role-play person B (say it, then reveal). */
function Dialogue({ topic, cards }: { topic: Topic; cards: Map<string, Card> }) {
  const lines = (topic.dialogue ?? []).map((l) => ({ ...l, card: cards.get(`conv-${l.phrase}`) })).filter((l): l is typeof l & { card: Card } => !!l.card);
  const [rolePlay, setRolePlay] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState<number | null>(null);

  async function playAll() {
    for (const [i, l] of lines.entries()) {
      setPlaying(i);
      await playCardToEnd(l.card.id).catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
    }
    setPlaying(null);
  }

  async function play(i: number) {
    setPlaying(i);
    await playCardToEnd(lines[i].card.id).catch(() => {});
    setPlaying(null);
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={playAll} disabled={playing !== null}>
          Play it all
        </Button>
        <Button
          variant={rolePlay ? "primary" : "secondary"}
          onClick={() => {
            setRolePlay((r) => !r);
            setRevealed(new Set());
          }}
        >
          {rolePlay ? "Show all lines" : "Role-play: I'm B"}
        </Button>
      </div>
      {rolePlay && <p className="mt-2 text-sm text-muted">You are B. When it's your turn, say the line out loud, then tap to check.</p>}
      <ol className="mt-3 flex flex-col gap-2">
        {lines.map((l, i) => {
          const hidden = rolePlay && l.speaker === "B" && !revealed.has(i);
          const mine = l.speaker === "B";
          return (
            <li key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <button
                onClick={() => {
                  if (hidden) setRevealed((r) => new Set([...r, i]));
                  play(i);
                }}
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-left transition active:scale-[0.98] ${
                  mine ? "rounded-br-md bg-accent-soft" : "rounded-bl-md bg-surface"
                } ${playing === i ? "ring-2 ring-accent" : ""}`}
              >
                <span className="block text-xs font-bold text-muted">{l.speaker}</span>
                {hidden ? (
                  <span className="block py-2 text-sm font-semibold text-accent">Your turn: say it, then tap</span>
                ) : (
                  <>
                    <span className="block text-right">
                      <ArabicText printed={l.card.arabic_printed} full={l.card.arabic_full} className="text-2xl" />
                    </span>
                    <span className="block font-bold text-accent">{l.card.pronunciation}</span>
                    <span className="block text-sm">{l.card.english}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
