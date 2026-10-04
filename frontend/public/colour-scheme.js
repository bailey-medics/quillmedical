// Sets the colour scheme before the styles load, so somebody who chose
// dark does not see a light page flash first. Mantine sets the same
// attribute once the app starts; this only gets there sooner.
//
// A file of its own, loaded from index.html, because the content
// security policy (caddy/prod/Caddyfile) is `script-src 'self'`, which
// runs no script written inside the page. It was inline until October
// 2026, and in production it had never run.
document.documentElement.setAttribute(
  "data-mantine-color-scheme",
  localStorage.getItem("mantine-color-scheme-value") || "light",
);
