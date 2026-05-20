/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLINICAL_SERVICES_ENABLED: string;
  readonly VITE_VAPID_PUBLIC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
