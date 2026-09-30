import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { Home } from "./routes/Home";
import { SignIn } from "./routes/SignIn";
import { Today } from "./routes/Today";

function RequireSignIn() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) {
    // Come back to where you were after signing in, except from Account (that's
    // where you sign out, so the next sign-in should start at Home).
    const next = location.pathname + location.search;
    const keep = next !== "/" && !location.pathname.startsWith("/account");
    return <Navigate to={`/signin${keep ? `?next=${encodeURIComponent(next)}` : ""}`} replace />;
  }
  return <Outlet />;
}

// Screens other than the first ones load on demand, to keep the first load small on phones.
export const router = createBrowserRouter([
  { path: "/signin", element: <SignIn /> },
  {
    element: <RequireSignIn />,
    hydrateFallbackElement: <Spinner />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/class/:classId", element: <Today /> },
      { path: "/learn", lazy: () => import("./routes/LearnHome").then((m) => ({ Component: m.LearnHome })) },
      { path: "/learn/letters", lazy: () => import("./routes/Alphabet").then((m) => ({ Component: m.Alphabet })) },
      { path: "/learn/talk", lazy: () => import("./routes/Talk").then((m) => ({ Component: m.TalkList })) },
      { path: "/learn/talk/:topicKey", lazy: () => import("./routes/Talk").then((m) => ({ Component: m.TalkTopic })) },
      { path: "/learn/practice", lazy: () => import("./routes/PracticeHome").then((m) => ({ Component: m.PracticeHome })) },
      { path: "/learn/words", lazy: () => import("./routes/Words").then((m) => ({ Component: m.Words })) },
      { path: "/account", lazy: () => import("./routes/Account").then((m) => ({ Component: m.Account })) },
      { path: "/join", lazy: () => import("./routes/Join").then((m) => ({ Component: m.Join })) },
      { path: "/setup", lazy: () => import("./routes/Setup").then((m) => ({ Component: m.Setup })) },
      { path: "/class/:classId/lessons", lazy: () => import("./routes/Lessons").then((m) => ({ Component: m.Lessons })) },
      { path: "/class/:classId/words", lazy: () => import("./routes/Words").then((m) => ({ Component: m.Words })) },
      { path: "/class/:classId/snap", lazy: () => import("./routes/Snap").then((m) => ({ Component: m.Snap })) },
      { path: "/class/:classId/page/:pageId", lazy: () => import("./routes/PageView").then((m) => ({ Component: m.PageView })) },
      { path: "/class/:classId/invite", lazy: () => import("./routes/Invite").then((m) => ({ Component: m.Invite })) },
      { path: "/class/:classId/letters", lazy: () => import("./routes/Alphabet").then((m) => ({ Component: m.Alphabet })) },
      { path: "/class/:classId/talk", lazy: () => import("./routes/Talk").then((m) => ({ Component: m.TalkList })) },
      { path: "/class/:classId/talk/:topicKey", lazy: () => import("./routes/Talk").then((m) => ({ Component: m.TalkTopic })) },
      { path: "/class/:classId/preview", lazy: () => import("./routes/Preview").then((m) => ({ Component: m.Preview })) },
      { path: "/class/:classId/practice", lazy: () => import("./routes/PracticeHome").then((m) => ({ Component: m.PracticeHome })) },
      { path: "/class/:classId/reports", lazy: () => import("./routes/Reports").then((m) => ({ Component: m.Reports })) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
