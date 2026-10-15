// Sets the colour scheme before the styles load, so somebody who chose
// dark does not see a light page flash first. Mantine sets the same
// attribute once the app starts; this only gets there sooner.
//
// A file of its own, loaded from index.html, because the content
// security policy (caddy/prod/Caddyfile) is `script-src 'self'`, which
// runs no script written inside the page. It was inline until October
// 2026, and in production it had never run.
//
// It must load as a classic, blocking script: a module script can run
// after the first paint and bring back the flash. So it is not part of
// the app's bundle. `colourSchemeScript` in scripts/ compiles it on its
// own to `/colour-scheme.js`, and it must import and export nothing, so
// that what comes out is a plain script.
document.documentElement.setAttribute(
  "data-mantine-color-scheme",
  localStorage.getItem("mantine-color-scheme-value") || "light",
);
