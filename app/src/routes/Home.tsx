// Sends students to their class; with no class yet, offers setup or joining.
import { Link, Navigate } from "react-router";
import { ErrorNote, RowLink, Screen, Spinner } from "../components/ui";
import { myClasses } from "../lib/data";
import { supabase } from "../lib/supabase";
import { useAsync } from "../lib/useAsync";

const LAST_CLASS = "rafiq:lastClass";

export function rememberClass(id: string) {
  try {
    localStorage.setItem(LAST_CLASS, id);
  } catch {
    // private mode: fine, we just won't remember
  }
}

export function Home() {
  const { data: classes, error, loading, reload } = useAsync(myClasses, []);

  if (loading) return <Spinner />;
  if (error) return <div className="p-4"><ErrorNote error={error} onRetry={reload} /></div>;

  if (classes && classes.length > 0) {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_CLASS);
    } catch {
      // ignore
    }
    const target = classes.find((c) => c.id === last) ?? classes[0];
    if (classes.length === 1 || last) return <Navigate to={`/class/${target.id}`} replace />;
    return (
      <Screen title="Your classes">
        <div className="flex flex-col gap-2">
          {classes.map((c) => (
            <RowLink key={c.id} to={`/class/${c.id}`}>
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-muted">{c.book.title_en ?? c.book.title_ar}</p>
              </div>
            </RowLink>
          ))}
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Welcome to Rafiq">
      <p className="mt-2 text-muted">To start, join your classmates' class with an invite code, or set up your textbook if you're the first one here.</p>
      <div className="mt-6 flex flex-col gap-3">
        <Link to="/join" className="rounded-3xl bg-accent p-5 text-on-accent active:opacity-90">
          <p className="text-lg font-bold">Join a class</p>
          <p className="text-sm opacity-90">A classmate gave you an invite code</p>
        </Link>
        <Link to="/setup" className="rounded-3xl border border-border bg-surface p-5 active:bg-soft">
          <p className="text-lg font-bold">Set up my textbook</p>
          <p className="text-sm text-muted">Photograph the contents pages once; Rafiq builds your lesson list</p>
        </Link>
      </div>
      <button className="mt-10 min-h-11 text-sm text-muted" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </Screen>
  );
}
