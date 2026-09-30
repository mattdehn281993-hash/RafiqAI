// Shown instead of React Router's "Unexpected Application Error".
import { isRouteErrorResponse, useRouteError } from "react-router";

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  const updated = /MIME type|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <img src="/icon-192.png" alt="" className="size-16 rounded-2xl" />
      <h1 className="text-2xl font-bold">{updated ? "Rafiq was updated" : "Something went wrong"}</h1>
      <p className="text-muted">
        {updated
          ? "A newer version is ready. Reload to continue where you were."
          : "This screen couldn't open. Reloading usually fixes it."}
      </p>
      <button onClick={() => location.reload()} className="min-h-12 rounded-2xl bg-accent px-5 font-semibold text-on-accent">
        Reload
      </button>
      <a href="/" className="min-h-11 text-center text-sm text-muted underline">
        Go to Home
      </a>
      {!updated && <p className="break-words text-xs text-muted">{message}</p>}
    </div>
  );
}
