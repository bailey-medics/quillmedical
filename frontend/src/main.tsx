/**
 * Main Application Entry Point
 *
 * Root module that initialises the React application with routing, authentication,
 * UI framework, and service worker registration. Sets up the entire application
 * component tree including AuthProvider, MantineProvider, and React Router.
 *
 * ## Two layout system
 *
 * Routes use one of two layouts:
 *
 * 1. **RootLayout → MainLayout** — the default for most authenticated pages.
 *    RootLayout renders MainLayout (side-nav, top ribbon, patient context) and
 *    exposes `useOutletContext<LayoutCtx>()` to child routes.
 *
 * 2. **TeachingLayout** — a standalone full-screen layout for teaching/learning
 *    pages. Each teaching page wraps itself in `<TeachingLayout>` (with optional
 *    sidebar/drawer props). These routes live OUTSIDE RootLayout's children
 *    array and supply their own `<RequireAuth>` + `<RequireFeature>` guards.
 *
 * ### Where to place new teaching routes
 *
 * Add to the "Teaching routes" `children` array below RootLayout. The page
 * component must wrap its content in `<TeachingLayout>`. The shared layout
 * route provides `<RequireAuth>` + `<RequireFeature>` guards once — individual
 * children do not need them.
 *
 * ## Route structure
 *
 * - Public routes: /login, /register, /forgot-password, /reset-password
 * - Protected routes (MainLayout): /, /patients, /messages, /settings, /admin
 * - Protected routes (TeachingLayout): /teaching, /teaching/:bankId,
 *   /teaching/learn/*, /teaching/assessment/*, /teaching/sync
 * - 404 fallback for unknown paths
 */

// src/main.tsx
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/typography.css";
import "./styles/dark-overrides.css";
import ReactDOM from "react-dom/client";

import { MantineProvider } from "@mantine/core";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { theme, cssVariablesResolver } from "./theme";

import RootLayout from "./RootLayout";
import AdminPage from "./pages/AdminPage";
import AdminUsersPage from "./pages/admin/users/AdminUsersPage";
import AdminPatientsPage from "./pages/admin/patients/AdminPatientsPage";
import AdminOrganisationsPage from "./pages/admin/organisations/AdminOrganisationsPage";
import UserAdminPage from "./pages/admin/users/UserAdminPage";
import EditUserPage from "./pages/admin/users/EditUserPage";
import ViewAllPatientsPage from "./pages/admin/patients/ViewAllPatientsPage";
import PatientAdminPage from "./pages/admin/patients/PatientAdminPage";
import EditPatientPage from "./pages/admin/patients/EditPatientPage";
import DeactivatePatientPage from "./pages/admin/patients/DeactivatePatientPage";
import ActivatePatientPage from "./pages/admin/patients/ActivatePatientPage";
import OrganisationAdminPage from "./pages/admin/organisations/OrganisationAdminPage";
import CreateOrganisationPage from "./pages/admin/organisations/CreateOrganisationPage";
import AddStaffToOrgPage from "./pages/admin/organisations/AddStaffToOrgPage";
import AddPatientToOrgPage from "./pages/admin/organisations/AddPatientToOrgPage";
import EditOrganisationPage from "./pages/admin/organisations/EditOrganisationPage";
import OrgFeaturesPage from "./pages/admin/organisations/OrgFeaturesPage";
import Messages from "./pages/Messages";
import MessageThread from "./pages/MessageThread";
import NewPatientPage from "./pages/NewPatientPage";
import UserInfoUpdatePage from "./pages/UserInfoUpdatePage";
import NotFound from "./pages/NotFound";
import Patient from "./pages/Patient";
import PatientAppointments from "./pages/PatientAppointments";
import PatientLetters from "./pages/PatientLetters";
import PatientLetterView from "./pages/PatientLetterView";
import PatientMessages from "./pages/PatientMessages";
import PatientMessageThread from "./pages/PatientMessageThread";
import PatientDocuments from "./pages/PatientDocuments";
import PatientDocumentView from "./pages/PatientDocumentView";
import PatientNotes from "./pages/PatientNotes";
import RegisterPage from "./pages/RegisterPage";
import TeachingRegisterPage from "./pages/TeachingRegisterPage";
import TotpSetup from "./pages/TotpSetup";
import ChangePassword from "./pages/ChangePassword";

// NEW: auth imports
import { AuthProvider } from "./auth/AuthContext";
import GuestOnly from "./auth/GuestOnly";
import RequireAuth from "./auth/RequireAuth";
import RequirePermission from "./auth/RequirePermission";
import { RequireFeature } from "./auth/RequireFeature";
import RequireClinical from "./auth/RequireClinical";
import { NoAccessLayout } from "@/components/layouts";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import HomeRedirect from "./pages/HomeRedirect";

// Teaching pages
import TeachingDashboard from "./features/teaching/pages/TeachingDashboard";
import AssessmentAttempt from "./features/teaching/pages/AssessmentAttempt";
import AssessmentResultPage from "./features/teaching/pages/AssessmentResultPage";
import SyncStatus from "./features/teaching/pages/SyncStatus";
import AdminTeachingPage from "./pages/admin/teaching/AdminTeachingPage";
import AdminTeachingDashboard from "./pages/admin/teaching/AdminTeachingDashboard";
import AdminAllDelegatesPage from "./pages/admin/teaching/AdminAllDelegatesPage";
import AdminCentresPage from "./pages/admin/teaching/AdminCentresPage";
import AdminBankDetailPage from "./pages/admin/teaching/AdminBankDetailPage";
import AdminBankOrgSettingsPage from "./pages/admin/teaching/AdminBankOrgSettingsPage";

// Learning pages
import TeachingModuleMain from "./features/teaching/pages/TeachingModuleMain";
import LearningDashboard from "./features/teaching/pages/LearningDashboard";
import ModuleOverview from "./features/teaching/pages/ModuleOverview";
import SlideReader from "./features/teaching/pages/SlideReader";

const router = createBrowserRouter([
  // Public routes (login, register) — placed before protected routes so
  // they are matched directly and not captured by the authenticated
  // parent route.
  {
    path: "/login",
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: "/register",
    element: (
      <GuestOnly>
        <RegisterPage />
      </GuestOnly>
    ),
  },
  {
    path: "/teaching/register/:module",
    element: (
      <GuestOnly>
        <TeachingRegisterPage />
      </GuestOnly>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestOnly>
        <ForgotPasswordPage />
      </GuestOnly>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <GuestOnly>
        <ResetPasswordPage />
      </GuestOnly>
    ),
  },

  // Everything below here requires auth
  {
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <HomeRedirect /> },

      // Clinical routes — require FHIR/EHRbase connectivity
      {
        element: (
          <RequireClinical>
            <Outlet />
          </RequireClinical>
        ),
        children: [
          {
            path: "/patients/:id",
            children: [
              { index: true, element: <Patient /> },
              { path: "letters", element: <PatientLetters /> },
              { path: "letters/:letterId", element: <PatientLetterView /> },
              { path: "messages", element: <PatientMessages /> },
              {
                path: "messages/:conversationId",
                element: <PatientMessageThread />,
              },
              { path: "documents", element: <PatientDocuments /> },
              {
                path: "documents/:documentId",
                element: <PatientDocumentView />,
              },
              { path: "notes", element: <PatientNotes /> },
              { path: "appointments", element: <PatientAppointments /> },
            ],
          },
          { path: "/messages", element: <Messages /> },
          {
            path: "/messages/:conversationId",
            element: <MessageThread />,
          },
        ],
      },

      // Admin routes — require admin permission
      {
        path: "/admin",
        element: (
          <RequirePermission level="admin">
            <Outlet />
          </RequirePermission>
        ),
        children: [
          { index: true, element: <AdminPage /> },
          { path: "users", element: <AdminUsersPage /> },
          { path: "users/new", element: <UserInfoUpdatePage /> },
          { path: "users/edit", element: <EditUserPage /> },
          { path: "users/:id", element: <UserAdminPage /> },
          { path: "users/:id/edit", element: <UserInfoUpdatePage /> },
          { path: "patients", element: <AdminPatientsPage /> },
          { path: "patients/new", element: <NewPatientPage /> },
          { path: "patients/list", element: <ViewAllPatientsPage /> },
          { path: "patients/:patientId", element: <PatientAdminPage /> },
          { path: "patients/:patientId/edit", element: <EditPatientPage /> },
          {
            path: "patients/:patientId/deactivate",
            element: <DeactivatePatientPage />,
          },
          {
            path: "patients/:patientId/activate",
            element: <ActivatePatientPage />,
          },
          { path: "patients/edit", element: <EditPatientPage /> },
          { path: "patients/deactivate", element: <DeactivatePatientPage /> },
          { path: "patients/:id/edit", element: <NewPatientPage /> },
          { path: "organisations", element: <AdminOrganisationsPage /> },
          { path: "organisations/new", element: <CreateOrganisationPage /> },
          { path: "organisations/:id", element: <OrganisationAdminPage /> },
          {
            path: "organisations/:id/edit",
            element: <EditOrganisationPage />,
          },
          {
            path: "organisations/:id/add-staff",
            element: <AddStaffToOrgPage />,
          },
          {
            path: "organisations/:id/add-patient",
            element: <AddPatientToOrgPage />,
          },
          {
            path: "organisations/:id/features",
            element: <OrgFeaturesPage />,
          },
          { path: "teaching", element: <AdminTeachingDashboard /> },
          { path: "teaching/centres", element: <AdminCentresPage /> },
          { path: "teaching/modules", element: <AdminTeachingPage /> },
          {
            path: "teaching/all-delegates",
            element: <AdminAllDelegatesPage />,
          },
          {
            path: "teaching/modules/:bankId",
            element: <AdminBankDetailPage />,
          },
          {
            path: "teaching/modules/:bankId/org/:orgId",
            element: <AdminBankOrgSettingsPage />,
          },
        ],
      },

      // Settings
      {
        path: "/settings",
        element: import("./pages/Settings").then((m) => <m.default />),
      },
      { path: "/settings/totp", element: <TotpSetup /> },
      { path: "/settings/password", element: <ChangePassword /> },
    ],
  },

  // Teaching routes — all use TeachingLayout (not MainLayout).
  // Shared layout route provides RequireAuth + RequireFeature guards once.
  {
    path: "/teaching",
    element: (
      <RequireAuth>
        <RequireFeature
          feature="teaching"
          fallback={<NoAccessLayout feature="teaching" />}
        >
          <Outlet />
        </RequireFeature>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <TeachingDashboard /> },
      { path: ":bankId", element: <TeachingModuleMain /> },
      { path: "learn", element: <LearningDashboard /> },
      { path: "learn/:moduleId", element: <ModuleOverview /> },
      { path: "learn/:moduleId/slide/:slideIndex", element: <SlideReader /> },
      { path: "assessment/:id", element: <AssessmentAttempt /> },
      { path: "assessment/:id/result", element: <AssessmentResultPage /> },
      { path: "sync", element: <SyncStatus /> },
    ],
  },

  // Fallback -> show 404 page instead of redirecting to home
  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider
    theme={theme}
    cssVariablesResolver={cssVariablesResolver}
    defaultColorScheme="light"
  >
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </MantineProvider>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const swUrl = "/sw.js";
      console.log("Registering service worker at", swUrl);

      const reg = await navigator.serviceWorker.register(swUrl);
      console.log("SW registered:", reg);

      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("SW controller changed → reloading");
        window.location.reload();
      });

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            reg.waiting?.postMessage("SKIP_WAITING");
          }
        });
      });
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  });
}
