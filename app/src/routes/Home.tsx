// Sends students to their class; with no class, to the class-free Learn home.
import { Navigate } from "react-router";
import { ErrorNote, RowLink, Screen, Spinner } from "../components/ui";
import { myClasses } from "../lib/data";
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

  return <Navigate to="/learn" replace />;
}

