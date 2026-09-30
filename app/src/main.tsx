import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./App";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import "./lib/install"; // catch Android's install prompt as early as possible

// After a new version is deployed, an app that was already open asks for screen
// files that no longer exist. Reload once to pick up the new version (the flag
// stops a reload loop if something else is wrong).
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem("rafiq:reloadedForUpdate")) return;
    sessionStorage.setItem("rafiq:reloadedForUpdate", "1");
  } catch {
    return;
  }
  event.preventDefault();
  // Go straight to the screen that was being opened, on the new version.
  const target = router.state.navigation.location;
  if (target) location.assign(target.pathname + target.search + target.hash);
  else location.reload();
});
window.addEventListener("load", () => setTimeout(() => {
  try {
    sessionStorage.removeItem("rafiq:reloadedForUpdate");
  } catch {
    // ignore
  }
}, 10000));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
