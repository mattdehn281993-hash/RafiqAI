// Home for the class-free foundations: the alphabet, everyday conversation and
// practice work straight after sign-in. A textbook class is optional extra.
import { Link } from "react-router";
import { InstallPrompt } from "../components/InstallPrompt";
import { OfflineDownload } from "../components/OfflineDownload";
import { RowLink, Screen, Section, Spinner } from "../components/ui";
import { myClasses } from "../lib/data";
import { useAsync } from "../lib/useAsync";

function BigLink({ to, title, detail, arabic, primary }: { to: string; title: string; detail: string; arabic: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex min-h-24 items-center gap-3 rounded-3xl p-5 active:scale-[0.99] ${primary ? "bg-accent text-on-accent" : "border border-border bg-surface"}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold">{title}</span>
        <span className={`block text-sm ${primary ? "opacity-90" : "text-muted"}`}>{detail}</span>
      </span>
      <span className={`font-arabic text-4xl leading-none ${primary ? "" : "text-accent"}`} lang="ar" dir="rtl">
        {arabic}
      </span>
    </Link>
  );
}

export function LearnHome() {
  const { data: classes, loading } = useAsync(myClasses, []);

  return (
    <Screen title="Rafiq" subtitle="Arabic from the very first letter" learn>
      <InstallPrompt />
      <div className="flex flex-col gap-3">
        <BigLink to="/learn/letters" primary title="The alphabet" detail="28 letters, each with its name and sounds" arabic="أ ب ت" />
        <BigLink to="/learn/talk" title="Conversation" detail="Greetings, how are you, your name, where you're from, your age" arabic="السَّلَامُ" />
        <BigLink to="/learn/practice" title="Practice" detail="Hear & pick, flashcards and your daily review" arabic="تَمْرِين" />
      </div>

      <Section title="Your textbook class">
        {loading ? (
          <Spinner />
        ) : classes && classes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {classes.map((c) => (
              <RowLink key={c.id} to={`/class/${c.id}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="truncate text-sm text-muted">{c.book.title_en ?? c.book.title_ar}</p>
                </div>
              </RowLink>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-surface p-4">
            <p className="text-sm text-muted">
              Optional: follow your class's textbook. Snap any page to get every item explained with audio, see the lesson list, and get Tonight's Preview before each class.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/join" className="flex min-h-12 items-center justify-center rounded-2xl border border-border font-semibold active:bg-soft">
                Join a class
              </Link>
              <Link to="/setup" className="flex min-h-12 items-center justify-center rounded-2xl border border-border font-semibold active:bg-soft">
                Set up textbook
              </Link>
            </div>
          </div>
        )}
      </Section>

      <Section title="Offline">
        <OfflineDownload />
      </Section>

      <Section title="Account">
        <RowLink to="/account">
          <span className="font-medium">Password and sign out</span>
        </RowLink>
      </Section>
    </Screen>
  );
}
