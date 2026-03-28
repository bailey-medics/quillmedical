/**
 * Root Layout Module
 *
 * Top-level layout component that wraps all authenticated routes. Provides
 * shared layout context (MainLayout) and patient selection state that can
 * be accessed by child routes via React Router's useOutletContext.
 */

import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { type Patient } from "@domains/patient";
import type { NavItem } from "@/components/navigation/NestedNavLink";
import MainLayout from "./components/layouts/MainLayout";

/**
 * Layout Context
 *
 * Context object passed to child routes via React Router Outlet.
 * Provides patient selection and navigation state management.
 */
export type LayoutCtx = {
  /** Currently selected patient (null if none selected) */
  patient: Patient | null;
  /** Function to update selected patient */
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
  /** Patient navigation breadcrumbs for the side nav */
  patientNav: NavItem[];
  /** Function to update patient navigation breadcrumbs */
  setPatientNav: React.Dispatch<React.SetStateAction<NavItem[]>>;
  /** Whether the layout should enter exam mode (hide nav, burger, search) */
  examMode: boolean;
  /** Function to toggle exam mode from child pages */
  setExamMode: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [patientNav, setPatientNav] = useState<NavItem[]>([]);
  const [examMode, setExamMode] = useState(false);
  const location = useLocation();

  // Clear patient context when navigating away from patient-specific routes
  useEffect(() => {
    const isPatientRoute = /^\/patients\/[^/]+/.test(location.pathname);
    const isMessageThread = /^\/messages\/[^/]+/.test(location.pathname);
    if (!isPatientRoute && !isMessageThread) {
      /* eslint-disable react-hooks/set-state-in-effect -- legitimate navigation side effect: clearing patient context on route change */
      setPatient(null);
      setPatientNav([]);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [location.pathname]);

  return (
    <>
      <MainLayout
        patient={patient}
        isLoading={false}
        patientNav={patientNav}
        examMode={examMode}
      >
        <Outlet
          context={
            {
              patient,
              setPatient,
              patientNav,
              setPatientNav,
              examMode,
              setExamMode,
            } satisfies LayoutCtx
          }
        />
      </MainLayout>
    </>
  );
}
