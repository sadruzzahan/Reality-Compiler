import { createRoot } from "react-dom/client";
import { initSentryIfConsented } from "./lib/sentry";
import "./index.css";

// Sentry MUST be initialised before any app module is imported so that
// errors thrown during component module evaluation are captured. We achieve
// this by:
//   1. Calling initSentryIfConsented() synchronously here (before App is
//      imported), and
//   2. Importing App via a dynamic import below, which defers App's module
//      graph evaluation until after init has run.
//
// Sentry stays a no-op until BOTH the SENTRY_DSN env var is set AND the
// user has granted observability consent. Re-running init on every consent
// change keeps the kill-switch live for the whole session.
initSentryIfConsented();

if (typeof window !== "undefined") {
  window.addEventListener("rc-cookie-consent-changed", () => {
    initSentryIfConsented();
  });
}

void (async () => {
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
})();
