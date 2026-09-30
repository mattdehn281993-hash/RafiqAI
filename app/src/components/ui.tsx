// Small shared UI pieces. Mobile-first: 44px+ tap targets, thumb-reachable actions.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-accent text-on-accent shadow-sm",
    secondary: "bg-surface text-text border border-border",
    ghost: "text-accent",
  }[variant];
  return (
    <button
      className={`min-h-12 rounded-2xl px-5 text-base font-semibold active:scale-[0.98] transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-muted" role="status">
      <div className="size-8 animate-spin rounded-full border-4 border-border border-t-accent" />
      {label && <p className="text-center text-sm">{label}</p>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl bg-bad-bg p-4 text-bad">
      <p className="text-sm">{typeof error === "string" ? error : error.message}</p>
      {onRetry && (
        <button className="mt-2 text-sm font-semibold underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const icons = {
  today: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  lessons: "M4 5h16M4 12h16M4 19h10",
  practice: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  words: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z",
};

function Tab({ to, label, icon, end }: { to: string; label: string; icon: keyof typeof icons; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-accent" : "text-muted"}`
      }
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icons[icon]} />
      </svg>
      {label}
    </NavLink>
  );
}

/**
 * Screen frame: sticky header, content, optional fixed bottom action (thumb
 * reach), and the tab bar when inside a class.
 */
export function Screen({
  title,
  subtitle,
  back,
  classId,
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  classId?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const bottomSpace = (classId ? 64 : 0) + (action ? 84 : 16);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-bg/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)] backdrop-blur">
        {back && (
          <button
            aria-label="Back"
            className="-ml-2 flex size-11 items-center justify-center rounded-full text-accent active:bg-soft"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </header>

      <main className="flex-1 px-4" style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${bottomSpace}px)` }}>
        {children}
      </main>

      {action && (
        <div
          className="fixed inset-x-0 z-20 mx-auto max-w-md px-4"
          style={{ bottom: `calc(env(safe-area-inset-bottom) + ${classId ? 72 : 16}px)` }}
        >
          {action}
        </div>
      )}

      {classId && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-border bg-surface/95 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Tab to={`/class/${classId}`} label="Today" icon="today" end />
          <Tab to={`/class/${classId}/lessons`} label="Lessons" icon="lessons" />
          <Tab to={`/class/${classId}/practice`} label="Practice" icon="practice" />
          <Tab to={`/class/${classId}/words`} label="My Words" icon="words" />
        </nav>
      )}
    </div>
  );
}

export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 py-3 active:bg-soft">
      {children}
      <svg viewBox="0 0 24 24" className="ml-auto size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
