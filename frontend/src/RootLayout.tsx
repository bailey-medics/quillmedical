/**
 * Root Layout Module
 *
 * Top-level layout component that wraps all authenticated routes. Provides
 * shared layout context (MainLayout) and patient selection state that can
 * be accessed by child routes via React Router's useOutletContext.
 */

import { useState } from "react";
import { Outlet } from "react-router-dom";

import { type Patient } from "@domains/patient";
import MainLayout from "./components/layouts/MainLayout";

/**
 * Layout Context
 *
 * Context object passed to child routes via React Router Outlet.
 * Provides patient selection state management.
 */
export type LayoutCtx = {
  /** Currently selected patient (null if none selected) */
  patient: Patient | null;
  /** Function to update selected patient */
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
};

/**
 * Root Layout
 *
 * Main layout wrapper for all authenticated routes. Renders MainLayout with
 * navigation and shared UI components, and provides patient selection context
 * to child routes.
 *
 * Child routes can access context via:
 * ```tsx
 * import { useOutletContext } from 'react-router-dom';
 * import type { LayoutCtx } from '@/RootLayout';
 *
 * function MyPage() {
 *   const { patient, setPatient } = useOutletContext<LayoutCtx>();
 *   // ...
 * }
 * ```
 */
export default function RootLayout() {
  const [patient, setPatient] = useState<Patient | null>(null);

  return (
    <>
      <MainLayout patient={patient} isLoading={false}>
        <Outlet context={{ patient, setPatient } satisfies LayoutCtx} />
      </MainLayout>
    </>
  );
}
