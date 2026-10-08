/**
 * Main Application Entry Point
 *
 * Root module that initialises the React application with routing, authentication,
 * UI framework, and service worker registration. Sets up the entire application
 * component tree including AuthProvider, MantineProvider, and React Router.
 *
 * The routes themselves live in `routes.tsx`.
 */

// src/main.tsx
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/typography.css";
import "./styles/dark-overrides.css";
import "./styles/touch-targets.css";
import "./styles/disabled-controls.css";
import ReactDOM from "react-dom/client";
import { Center, MantineProvider } from "@mantine/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { theme, cssVariablesResolver } from "./theme";
import {
  wireControllerChangeReload,
  wirePreloadErrorRecovery,
  wireUpdateChecks,
} from "@lib/swUpdateGate";
import { persistFormState } from "@lib/compat-generation";
import { installGlobalErrorReporting } from "@lib/error-reporting/globalHandlers";
import RouteTracking from "@lib/error-reporting/RouteTracking";
import FeaturePrefetch from "@lib/FeaturePrefetch";
import { installPromptCapture } from "@lib/pwa/installPromptEvent";
import { markInstallFinished } from "@lib/pwa/installPromptSchedule";
import LoadingSpinner from "@/components/loading-spinner";
import RouteErrorFallback from "@/components/error-boundary/RouteErrorFallback";
import { AuthProvider } from "./auth/AuthContext";
import ForcedReloadGate from "@lib/compat-generation/ForcedReloadGate";
import { ForcedReloadProvider } from "@lib/compat-generation";
import { ConnectivityProvider } from "@lib/connectivity";
import { routes } from "./routes";

// Every tree hangs off one pathless route, so recording which screen is
// showing happens once rather than once per layout. It was previously done in
// RootLayout, which sits inside RequireAuth and therefore missed the sign-in
// pages, the 404 and the whole /teaching tree - those reported errors with no
// route at all. Declared here, a tree added later inherits it.
//
// `FeaturePrefetch` sits here for the same reason: it fetches the other
// features' chunks in the background and must see every tree's routes.
//
// The same goes for `errorElement`. A lazy chunk that cannot be fetched
// rejects inside the router, which no <ErrorBoundary> in a layout can
// catch; without this the router shows its own developer screen.
const router = createBrowserRouter([
  {
    element: (
      <>
        <FeaturePrefetch />
        <RouteTracking />
      </>
    ),
    errorElement: <RouteErrorFallback />,
    // Shown on a cold load of a lazy route while its chunk is in flight.
    // Without it the router renders nothing at all until the chunk
    // arrives. The same spinner RequireAuth shows next, so the two read
    // as one wait.
    hydrateFallbackElement: (
      <Center mih="60dvh">
        <LoadingSpinner />
      </Center>
    ),
    children: routes,
  },
]);

// Before the tree mounts, so a failure during the first render is reported
// rather than lost. The error boundary covers what React sees; this covers
// rejected promises and anything thrown outside a render.
installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider
    theme={theme}
    cssVariablesResolver={cssVariablesResolver}
    defaultColorScheme="light"
  >
    <ConnectivityProvider>
      <ForcedReloadProvider>
        <AuthProvider>
          <ForcedReloadGate />
          <RouterProvider router={router} />
        </AuthProvider>
      </ForcedReloadProvider>
    </ConnectivityProvider>
  </MantineProvider>,
);

// Recovery for a lazily-loaded route chunk this tab can no longer fetch,
// because the container serving the build it downloaded has moved on. Wired
// outside the service-worker block on purpose: it is the router's problem,
// not the worker's, and a browser without service-worker support still
// needs it. Must exist before any route is loaded on demand.
wirePreloadErrorRecovery({
  router,
  persist: persistFormState,
  reload: () => window.location.reload(),
});

// The browser's install prompt fires once, often before React mounts, and is
// lost unless something is already listening. Held here until Quill decides
// to ask; see installPromptEvent.ts. An install by any route, the browser's
// own menu included, stops the asking.
installPromptCapture.wire(window, () => markInstallFinished());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const swUrl = "/sw.js";
      console.log("Registering service worker at", swUrl);

      const reg = await navigator.serviceWorker.register(swUrl);
      console.log("SW registered:", reg);

      wireControllerChangeReload(navigator.serviceWorker, () => {
        console.log("SW controller changed → reloading");
        window.location.reload();
      });

      // Route-safety-gated update check (plan item 14): only activates a
      // waiting worker (via the reload-loop-guarded gate below, which
      // triggers the controllerchange listener above) when the
      // currently-rendered route opts in via `handle.safeForReload`.
      // Wiring itself lives in swUpdateGate.ts's `wireUpdateChecks` so it
      // can be covered by tests without a real browser navigation/timer.
      wireUpdateChecks(router, reg, import.meta.env.PROD);
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  });
}
