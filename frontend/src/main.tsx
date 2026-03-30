/**
 * Main Application Entry Point
 *
 * Root module that initializes the React application with routing, authentication,
 * UI framework, and service worker registration. Sets up the entire application
 * component tree including AuthProvider, MantineProvider, and React Router.
 *
 * Architecture:
 * - React Router with Mantine UI for styling and components
 * - Auth context wrapping all routes
 * - Service worker for PWA functionality
 *
 * Route Structure:
 * - Public routes: /login, /register (guest-only)
 * - Protected routes: /, /settings, /about (require authentication)
 * - 404 fallback for unknown paths
 */

// src/main.tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/colours.css";
import "./styles/typography.css";
import ReactDOM from "react-dom/client";

import { MantineProvider } from "@mantine/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { theme } from "./theme";

import RootLayout from "./RootLayout";
import About from "./pages/About";
import AdminPage from "./pages/AdminPage";
import AdminUsersPage from "./pages/admin/users/AdminUsersPage";
import AdminPatientsPage from "./pages/admin/patients/AdminPatientsPage";
import AdminOrganisationsPage from "./pages/admin/organisations/AdminOrganisationsPage";
import AdminPermissionsPage from "./pages/admin/AdminPermissionsPage";
import ViewAllUsersPage from "./pages/admin/users/ViewAllUsersPage";
import UserAdminPage from "./pages/admin/users/UserAdminPage";
import EditUserPage from "./pages/admin/users/EditUserPage";
import DeactivateUserPage from "./pages/admin/users/DeactivateUserPage";
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
import NewUserPage from "./pages/NewUserPage";
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
import TotpSetup from "./pages/TotpSetup";

// NEW: auth imports
import { AuthProvider } from "./auth/AuthContext";
import GuestOnly from "./auth/GuestOnly";
import RequireAuth from "./auth/RequireAuth";
import RequirePermission from "./auth/RequirePermission";
import { RequireFeature } from "./auth/RequireFeature";
import RequireClinical from "./auth/RequireClinical";
import LoginPage from "./pages/LoginPage";
import HomeRedirect from "./pages/HomeRedirect";

// Teaching pages
import AssessmentDashboard from "./features/teaching/pages/AssessmentDashboard";
import AssessmentAttempt from "./features/teaching/pages/AssessmentAttempt";
import AssessmentResultPage from "./features/teaching/pages/AssessmentResultPage";
import AllResults from "./features/teaching/pages/AllResults";
import SyncStatus from "./features/teaching/pages/SyncStatus";
import AdminTeachingPage from "./pages/admin/teaching/AdminTeachingPage";
import AdminBankDetailPage from "./pages/admin/teaching/AdminBankDetailPage";
import TeachingOrgSettingsPage from "./pages/admin/teaching/TeachingOrgSettingsPage";

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

  // Everything below here requires auth
  {
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <HomeRedirect /> },
      {
        path: "/patients/:id",
        element: (
          <RequireClinical>
            <Patient />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/letters",
        element: (
          <RequireClinical>
            <PatientLetters />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/letters/:letterId",
        element: (
          <RequireClinical>
            <PatientLetterView />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/messages",
        element: (
          <RequireClinical>
            <PatientMessages />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/messages/:conversationId",
        element: (
          <RequireClinical>
            <PatientMessageThread />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/documents",
        element: (
          <RequireClinical>
            <PatientDocuments />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/documents/:documentId",
        element: (
          <RequireClinical>
            <PatientDocumentView />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/notes",
        element: (
          <RequireClinical>
            <PatientNotes />
          </RequireClinical>
        ),
      },
      {
        path: "/patients/:id/appointments",
        element: (
          <RequireClinical>
            <PatientAppointments />
          </RequireClinical>
        ),
      },
      {
        path: "/messages",
        element: (
          <RequireClinical>
            <Messages />
          </RequireClinical>
        ),
      },
      {
        path: "/messages/:conversationId",
        element: (
          <RequireClinical>
            <MessageThread />
          </RequireClinical>
        ),
      },
      {
        path: "/admin",
        element: (
          <RequirePermission level="admin">
            <AdminPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users",
        element: (
          <RequirePermission level="admin">
            <AdminUsersPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/new",
        element: (
          <RequirePermission level="admin">
            <NewUserPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/list",
        element: (
          <RequirePermission level="admin">
            <ViewAllUsersPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/edit",
        element: (
          <RequirePermission level="admin">
            <EditUserPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/deactivate",
        element: (
          <RequirePermission level="admin">
            <DeactivateUserPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/:id",
        element: (
          <RequirePermission level="admin">
            <UserAdminPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users/:id/edit",
        element: (
          <RequirePermission level="admin">
            <NewUserPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients",
        element: (
          <RequirePermission level="admin">
            <AdminPatientsPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/new",
        element: (
          <RequirePermission level="admin">
            <NewPatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/list",
        element: (
          <RequirePermission level="admin">
            <ViewAllPatientsPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/:patientId",
        element: (
          <RequirePermission level="admin">
            <PatientAdminPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/:patientId/edit",
        element: (
          <RequirePermission level="admin">
            <EditPatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/:patientId/deactivate",
        element: (
          <RequirePermission level="admin">
            <DeactivatePatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/:patientId/activate",
        element: (
          <RequirePermission level="admin">
            <ActivatePatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/edit",
        element: (
          <RequirePermission level="admin">
            <EditPatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/deactivate",
        element: (
          <RequirePermission level="admin">
            <DeactivatePatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/patients/:id/edit",
        element: (
          <RequirePermission level="admin">
            <NewPatientPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations",
        element: (
          <RequirePermission level="admin">
            <AdminOrganisationsPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/new",
        element: (
          <RequirePermission level="admin">
            <CreateOrganisationPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/:id",
        element: (
          <RequirePermission level="admin">
            <OrganisationAdminPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/:id/edit",
        element: (
          <RequirePermission level="admin">
            <EditOrganisationPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/:id/add-staff",
        element: (
          <RequirePermission level="admin">
            <AddStaffToOrgPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/:id/add-patient",
        element: (
          <RequirePermission level="admin">
            <AddPatientToOrgPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/organisations/:id/features",
        element: (
          <RequirePermission level="admin">
            <OrgFeaturesPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/permissions",
        element: (
          <RequirePermission level="admin">
            <AdminPermissionsPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/teaching",
        element: (
          <RequirePermission level="admin">
            <AdminTeachingPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/teaching/settings",
        element: (
          <RequirePermission level="admin">
            <TeachingOrgSettingsPage />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/teaching/:bankId",
        element: (
          <RequirePermission level="admin">
            <AdminBankDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: "/settings",
        element: import("./pages/Settings").then((m) => <m.default />),
      },
      { path: "/settings/totp", element: <TotpSetup /> },
      { path: "/about", element: <About /> },

      // Teaching routes — gated by "teaching" feature flag
      {
        path: "/teaching",
        element: (
          <RequireFeature feature="teaching">
            <AssessmentDashboard />
          </RequireFeature>
        ),
      },
      {
        path: "/teaching/assessment/:id",
        element: (
          <RequireFeature feature="teaching">
            <AssessmentAttempt />
          </RequireFeature>
        ),
      },
      {
        path: "/teaching/assessment/:id/result",
        element: (
          <RequireFeature feature="teaching">
            <AssessmentResultPage />
          </RequireFeature>
        ),
      },
      {
        path: "/teaching/results",
        element: (
          <RequireFeature feature="teaching">
            <AllResults />
          </RequireFeature>
        ),
      },
      {
        path: "/teaching/sync",
        element: (
          <RequireFeature feature="teaching">
            <SyncStatus />
          </RequireFeature>
        ),
      },
    ],
  },

  // Fallback -> show 404 page instead of redirecting to home
  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme}>
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
