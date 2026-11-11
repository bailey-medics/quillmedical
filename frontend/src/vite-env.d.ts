/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLINICAL_SERVICES_ENABLED: string;
  readonly VITE_VAPID_PUBLIC: string;
  /**
   * Storybook only: the brand every story is shown in, "quill" when unset.
   * Set by `just sb <brand>`; see `.storybook/preview.tsx`.
   */
  readonly STORYBOOK_BRAND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Baked in at build time (Vite `define`, see vite.config.ts) from the
 * repo-root api-compatibility/ decision files. See
 * src/lib/compat-generation/compatGeneration.ts.
 */
declare const __COMPAT_GENERATION__: number;
declare const __APP_VERSION__: string;
