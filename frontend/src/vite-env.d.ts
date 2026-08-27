/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLINICAL_SERVICES_ENABLED: string;
  readonly VITE_VAPID_PUBLIC: string;
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
