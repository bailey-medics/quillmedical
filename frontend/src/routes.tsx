/**
 * Route definitions
 *
 * Every page the app can show, and the guard and layout each sits
 * behind. Kept apart from `main.tsx`, which mounts the app, so that a
 * test can read the list without starting it: see
 * `navigation/navCoverage.test.tsx`, which walks every route here and
 * checks the side navigation says where it is.
 *
 * ## Two layout system
 *
 * Routes use one of two layouts:
 *
 * 1. **RootLayout → MainLayout** - the default for most authenticated pages.
 *    RootLayout renders MainLayout (side-nav, top ribbon, patient context) and
 *    exposes `useOutletContext<LayoutCtx>()` to child routes.
 *
 * 2. **TeachingLayout** - a standalone full-screen layout for teaching/learning
 *    pages. Each teaching page wraps itself in `<TeachingLayout>` (with optional
 *    sidebar/drawer props). These routes live OUTSIDE RootLayout's children
 *    array and supply their own `<RequireAuth>` + `<RequireFeature>` guards.
 *
 * ### Where to place new teaching routes
 *
 * Add to the "Teaching routes" `children` array below RootLayout. The page
 * component must wrap its content in `<TeachingLayout>`. The shared layout
 * route provides `<RequireAuth>` + `<RequireFeature>` guards once - individual
 * children do not need them.
 *
 * ## Route structure
 *
 * - Public routes: /login, /register, /forgot-password, /reset-password
 * - Open to anybody, signed in or not: /unsubscribe
 * - Protected routes (MainLayout): /, /patients, /messages, /settings, /admin
 * - Protected routes (TeachingLayout): /teaching, /teaching/:bankId,
 *   /teaching/learn/*, /teaching/assessment/*, /teaching/sync
 * - 404 fallback for unknown paths
 */

import { Navigate, Outlet } from "react-router-dom";
import type { ComponentType, ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import RootLayout from "./RootLayout";
import {
  loadAdmin,
  loadClinical,
  loadGuides,
  loadPassport,
  loadSafety,
  loadTeaching,
} from "./featureChunks";
import { lazyFrom } from "@lib/lazyRoute";
import ErrorBoundary from "@/components/error-boundary/ErrorBoundary";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";
import NotFound from "./pages/NotFound";
import RegisterPage from "./pages/RegisterPage";
import TotpSetup from "./pages/TotpSetup";
import AccountPage from "./pages/settings/AccountPage";
import GuestOnly from "./auth/GuestOnly";
import RequireAuth from "./auth/RequireAuth";
import RequireNewsletter from "./auth/RequireNewsletter";
import RequireOperator from "./auth/RequireOperator";
import RequireCompetency from "./auth/RequireCompetency";
import { RequireFeature } from "./auth/RequireFeature";
import { RequirePassport } from "./auth/RequirePassport";
import RequireClinical from "./auth/RequireClinical";
import { NoAccessLayout } from "@/components/layouts";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Settings from "./pages/Settings";
import YourFeedbackPage from "./pages/feedback/YourFeedbackPage";
import InboxPage from "./pages/inbox/InboxPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import VerifyEmailPendingPage from "./pages/VerifyEmailPendingPage";
import HomeRedirect from "./pages/HomeRedirect";
import GuideShell from "./pages/guides/GuideShell";

/**
 * A teaching page inside a module, behind the competency that opens
 * modules. Passed to `lazyFrom` so the page keeps its one route.
 */
function modulesOnly(Page: ComponentType): ReactElement {
  return (
    <RequireCompetency competency="take_teaching_modules">
      <Page />
    </RequireCompetency>
  );
}

export const routes: RouteObject[] = [
  // Public routes (login, register) - placed before protected routes so
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
  {
    path: "/verify-email",
    element: (
      <GuestOnly>
        <VerifyEmailPage />
      </GuestOnly>
    ),
  },
  // No guard, neither GuestOnly nor RequireAuth: the link in a newsletter
  // must work for somebody signed in and for somebody who is not. The
  // signed token in the link is what says whose preference it is.
  {
    path: "/unsubscribe",
    element: <UnsubscribePage />,
  },
  {
    path: "/verify-email-pending",
    element: (
      <GuestOnly>
        <VerifyEmailPendingPage />
      </GuestOnly>
    ),
  },

  // One guide. Outside RequireAuth because some guides are read before
  // there is an account to sign in to: how to join is the first. The
  // address is the same signed in or out, so there is one copy of each
  // guide to keep right; `GuideShell` chooses what goes round it, and the
  // page shows somebody signed out the guides marked `public` and a 404
  // for the rest. The list at `/guides` stays signed-in only.
  {
    path: "/guides/:slug",
    element: <GuideShell />,
    children: [
      {
        index: true,
        lazy: lazyFrom(loadGuides, "GuidePage"),
        handle: { safeForReload: true },
      },
    ],
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

      // Passport - gated twice: the organisation feature, or holding a
      // passport of your own, and the CBAC competency. Most people who
      // download the app can never open these, so the whole feature is
      // one lazy chunk, pages/passport/passportChunk.ts.
      {
        element: (
          <RequirePassport>
            <RequireCompetency competency="assess_clinician_passport">
              <Outlet />
            </RequireCompetency>
          </RequirePassport>
        ),
        children: [
          {
            path: "/passport",
            lazy: lazyFrom(loadPassport, "PassportPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/sign-offs",
            lazy: lazyFrom(loadPassport, "PassportSignOffsPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/sign-offs/:name",
            lazy: lazyFrom(loadPassport, "PassportSignOffDetailPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/download",
            lazy: lazyFrom(loadPassport, "PassportDownloadPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/logbook",
            lazy: lazyFrom(loadPassport, "PassportLogbookPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/logbook/:competencyId/:stem",
            lazy: lazyFrom(loadPassport, "PassportLogbookEntryPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/cpd",
            lazy: lazyFrom(loadPassport, "PassportCpdPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/cpd/:year/:stem",
            lazy: lazyFrom(loadPassport, "PassportCpdEntryPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/reflections",
            lazy: lazyFrom(loadPassport, "PassportReflectionsPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/reflections/:name",
            lazy: lazyFrom(loadPassport, "PassportReflectionPage"),
            handle: { safeForReload: true },
          },
          // Under Settings in the address and the navigation, but a
          // passport page in what it needs, so it sits inside the
          // passport's gates.
          {
            path: "/settings/cpd-date-ranges",
            lazy: lazyFrom(loadPassport, "CpdDateRangesPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/certificates",
            lazy: lazyFrom(loadPassport, "PassportCertificatesPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/passport/certificates/:name",
            lazy: lazyFrom(loadPassport, "PassportCertificatePage"),
            handle: { safeForReload: true },
          },
          {
            // An in-progress sign-off holds a half-written assessment,
            // so a silent reload would discard it.
            path: "/passport/sign-off/:signOffId",
            lazy: lazyFrom(loadPassport, "PassportSignOffPage"),
          },
          {
            // Reached from the inbox by a supervisor asked to confirm one
            // logbook entry. A reload loses only an unticked box.
            path: "/passport/logbook-confirmation/:requestId",
            lazy: lazyFrom(loadPassport, "PassportLogbookConfirmationPage"),
            handle: { safeForReload: true },
          },
        ],
      },

      // Safety - a throwaway mock-up with no backend, gated as the
      // passport is: the organisation feature and the competency the
      // safety professions carry. Lazily loaded like the
      // passport, and nothing holds form state, so every page is safe
      // to reload. See
      // docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
      {
        element: (
          <RequireFeature feature="safety">
            <RequireCompetency competency="view_safety_cases">
              <Outlet />
            </RequireCompetency>
          </RequireFeature>
        ),
        children: [
          {
            path: "/safety",
            lazy: lazyFrom(loadSafety, "SafetyPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId",
            lazy: lazyFrom(loadSafety, "SafetyCasePage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/documentation",
            lazy: lazyFrom(loadSafety, "SafetyDocumentationPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/documentation/:documentId",
            lazy: lazyFrom(loadSafety, "SafetyDocumentPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/documentation/:documentId/edit",
            lazy: lazyFrom(loadSafety, "SafetyDocumentEditPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/hazards",
            lazy: lazyFrom(loadSafety, "SafetyHazardsPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/hazards/:hazardId",
            lazy: lazyFrom(loadSafety, "SafetyHazardPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/incidents",
            lazy: lazyFrom(loadSafety, "SafetyIncidentsPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/incidents/:incidentId",
            lazy: lazyFrom(loadSafety, "SafetyIncidentPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/officers",
            lazy: lazyFrom(loadSafety, "SafetyOfficersPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/sign-off",
            lazy: lazyFrom(loadSafety, "SafetySignOffPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/sign-off/:sectionId",
            lazy: lazyFrom(loadSafety, "SafetySignOffDetailPage"),
            handle: { safeForReload: true },
          },
          {
            path: "/safety/:caseId/placeholders",
            lazy: lazyFrom(loadSafety, "SafetyPlaceholdersPage"),
            handle: { safeForReload: true },
          },
          {
            // A form, but one that starts from the stored values, so a
            // reload loses nothing that was not already lost.
            path: "/safety/:caseId/placeholders/edit",
            lazy: lazyFrom(loadSafety, "SafetyPlaceholdersEditPage"),
            handle: { safeForReload: true },
          },
        ],
      },

      // Clinical routes - require FHIR/EHRbase connectivity
      // One lazy chunk for the whole subtree, pages/clinical/clinicalChunk.ts.
      // A deployment with clinical services off never downloads it, and
      // opening a message thread, which cannot safely reload, never needs
      // a fetch of its own.
      {
        // Everything under here is patient data, and is deliberately not
        // counted. Declared on the subtree root rather than each leaf so a
        // clinical route added later inherits the exclusion rather than
        // needing somebody to remember it.
        handle: { clinical: true },
        element: (
          <RequireClinical>
            <Outlet />
          </RequireClinical>
        ),
        children: [
          {
            path: "/patients/:id",
            children: [
              {
                index: true,
                lazy: lazyFrom(loadClinical, "Patient"),
                handle: { safeForReload: true },
              },
              {
                path: "letters",
                lazy: lazyFrom(loadClinical, "PatientLetters"),
                handle: { safeForReload: true },
              },
              {
                path: "letters/:letterId",
                lazy: lazyFrom(loadClinical, "PatientLetterView"),
                handle: { safeForReload: true },
              },
              // Message routes have a reply/compose draft in progress -
              // not safe to silently reload.
              {
                path: "messages",
                lazy: lazyFrom(loadClinical, "PatientMessages"),
              },
              {
                path: "messages/:conversationId",
                lazy: lazyFrom(loadClinical, "PatientMessageThread"),
              },
              {
                path: "documents",
                lazy: lazyFrom(loadClinical, "PatientDocuments"),
                handle: { safeForReload: true },
              },
              {
                path: "documents/:documentId",
                lazy: lazyFrom(loadClinical, "PatientDocumentView"),
                handle: { safeForReload: true },
              },
              {
                path: "notes",
                lazy: lazyFrom(loadClinical, "PatientNotes"),
                handle: { safeForReload: true },
              },
              {
                path: "appointments",
                lazy: lazyFrom(loadClinical, "PatientAppointments"),
                handle: { safeForReload: true },
              },
            ],
          },
          // Compose/reply draft in progress - not safe to silently reload.
          { path: "/messages", lazy: lazyFrom(loadClinical, "Messages") },
          {
            path: "/messages/:conversationId",
            lazy: lazyFrom(loadClinical, "MessageThread"),
          },
        ],
      },

      // Guides - task instructions, open to anybody signed in. Which
      // guides somebody is shown is decided in the pages, for relevance
      // and not as a guard: see `lib/guides/useGuideTier.ts`. One lazy
      // chunk, pages/guides/guidesChunk.ts, which holds the words too.
      // One guide, `/guides/:slug`, is routed above, outside RequireAuth.
      {
        path: "/guides",
        lazy: lazyFrom(loadGuides, "GuidesPage"),
        handle: { safeForReload: true },
      },

      // Admin routes - require the competency the API itself requires.
      // One lazy chunk for the whole area, pages/admin/adminChunk.ts. Where
      // a page has a guard of its own, the guard is passed to `lazyFrom`
      // and wrapped round the page, so the route stays the leaf that
      // carries `handle`.
      // A scoped manager such as `manage_teaching` opens the area too, to
      // sign up people within its whitelist and manage their org_unit's
      // staff; the pages that are not theirs carry `manage_users` again
      // below, so they 404 rather than fail to load. See
      // docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md.
      {
        path: "/admin",
        element: (
          <RequireCompetency
            competency={["manage_users", ...SCOPED_MANAGER_IDS]}
          >
            <Outlet />
          </RequireCompetency>
        ),
        children: [
          {
            index: true,
            lazy: lazyFrom(loadAdmin, "AdminPage"),
            handle: { safeForReload: true },
          },
          {
            path: "users",
            lazy: lazyFrom(loadAdmin, "AdminUsersPage"),
            handle: { safeForReload: true },
          },
          // Wizard/edit forms - not safe to silently reload mid-entry.
          {
            path: "users/new",
            lazy: lazyFrom(loadAdmin, "UserInfoUpdatePage"),
          },
          { path: "users/edit", lazy: lazyFrom(loadAdmin, "EditUserPage") },
          {
            path: "users/:id",
            lazy: lazyFrom(loadAdmin, "UserAdminPage"),
            handle: { safeForReload: true },
          },
          {
            path: "users/:id/edit",
            lazy: lazyFrom(loadAdmin, "UserInfoUpdatePage"),
          },
          // Patients are not teaching's business.
          {
            element: (
              <RequireCompetency competency="manage_users">
                <Outlet />
              </RequireCompetency>
            ),
            children: [
              {
                path: "patients",
                lazy: lazyFrom(loadAdmin, "AdminPatientsPage"),
                handle: { safeForReload: true },
              },
              {
                path: "patients/new",
                lazy: lazyFrom(loadAdmin, "NewPatientPage"),
              },
              {
                path: "patients/list",
                lazy: lazyFrom(loadAdmin, "ViewAllPatientsPage"),
                handle: { safeForReload: true },
              },
              {
                path: "patients/:patientId",
                lazy: lazyFrom(loadAdmin, "PatientAdminPage"),
                handle: { safeForReload: true },
              },
              {
                path: "patients/:patientId/edit",
                lazy: lazyFrom(loadAdmin, "EditPatientPage"),
              },
              {
                path: "patients/:patientId/deactivate",
                lazy: lazyFrom(loadAdmin, "DeactivatePatientPage"),
              },
              {
                path: "patients/:patientId/activate",
                lazy: lazyFrom(loadAdmin, "ActivatePatientPage"),
              },
              {
                path: "patients/edit",
                lazy: lazyFrom(loadAdmin, "EditPatientPage"),
              },
              {
                path: "patients/deactivate",
                lazy: lazyFrom(loadAdmin, "DeactivatePatientPage"),
              },
              {
                path: "patients/:id/edit",
                lazy: lazyFrom(loadAdmin, "NewPatientPage"),
              },
            ],
          },
          {
            path: "organisations",
            lazy: lazyFrom(loadAdmin, "AdminOrganisationsPage"),
            handle: { safeForReload: true },
          },
          {
            path: "organisations/new",
            lazy: lazyFrom(loadAdmin, "CreateOrganisationPage", (Page) => (
              <RequireOperator>
                <Page />
              </RequireOperator>
            )),
          },
          {
            path: "organisations/:id",
            lazy: lazyFrom(loadAdmin, "OrganisationAdminPage"),
            handle: { safeForReload: true },
          },
          {
            path: "organisations/:id/edit",
            lazy: lazyFrom(loadAdmin, "EditOrganisationPage", (Page) => (
              <RequireCompetency competency="manage_users">
                <Page />
              </RequireCompetency>
            )),
          },
          {
            path: "organisations/:id/add-staff",
            lazy: lazyFrom(loadAdmin, "AddStaffToOrgPage"),
          },
          {
            path: "organisations/:id/add-patient",
            lazy: lazyFrom(loadAdmin, "AddPatientToOrgPage", (Page) => (
              <RequireCompetency competency="manage_users">
                <Page />
              </RequireCompetency>
            )),
          },
          {
            // The practice switches hold their changes until "Save changes" is
            // pressed, so a silent reload would drop them. Not safe to reload.
            path: "organisations/:id/members/:userId",
            lazy: lazyFrom(loadAdmin, "MemberPracticePage", (Page) => (
              <RequireCompetency
                competency={[
                  "manage_practising_competencies",
                  ...SCOPED_MANAGER_IDS,
                ]}
              >
                <Page />
              </RequireCompetency>
            )),
          },
          {
            // Adding a site takes `manage_users`, or a scoped manager
            // such as `manage_teaching`, who adds one inside their own
            // organisation. Editing the organisation stays `manage_users`.
            path: "organisations/:id/add-site",
            lazy: lazyFrom(loadAdmin, "AddSiteToOrgPage", (Page) => (
              <RequireCompetency
                competency={["manage_users", ...SCOPED_MANAGER_IDS]}
              >
                <Page />
              </RequireCompetency>
            )),
          },
          // The list of sites is open to all of Admin: the API answers
          // with the sites the caller administers, and for somebody who
          // administers a site but no organisation it is the only way
          // in. Creating one from it takes what the API asks of whoever
          // creates a site: `manage_users`, or a scoped manager such as
          // `manage_teaching`. The form offers only the org_units the
          // caller may put a site inside, and the API refuses any other.
          {
            path: "sites",
            lazy: lazyFrom(loadAdmin, "AdminSitesPage"),
            handle: { safeForReload: true },
          },
          {
            path: "sites/new",
            lazy: lazyFrom(loadAdmin, "CreateSitePage", (Page) => (
              <RequireCompetency
                competency={["manage_users", ...SCOPED_MANAGER_IDS]}
              >
                <Page />
              </RequireCompetency>
            )),
          },
          {
            path: "sites/:id",
            lazy: lazyFrom(loadAdmin, "SiteAdminPage"),
            handle: { safeForReload: true },
          },
          {
            // A scoped manager such as `manage_teaching` edits a site
            // they act at; the API refuses any other, and an organisation.
            path: "sites/:id/edit",
            lazy: lazyFrom(loadAdmin, "EditSitePage", (Page) => (
              <RequireCompetency
                competency={["manage_users", ...SCOPED_MANAGER_IDS]}
              >
                <Page />
              </RequireCompetency>
            )),
          },
          {
            path: "sites/:id/features",
            lazy: lazyFrom(loadAdmin, "OrgFeaturesPage", (Page) => (
              <RequireCompetency competency="manage_users">
                <Page parentPath="sites" />
              </RequireCompetency>
            )),
          },
          {
            path: "sites/:id/add-staff",
            lazy: lazyFrom(loadAdmin, "AddStaffToSitePage"),
          },
          {
            // The practice switches hold their changes until "Save changes" is
            // pressed, so a silent reload would drop them. Not safe to reload.
            path: "sites/:id/members/:userId",
            lazy: lazyFrom(loadAdmin, "MemberPracticePage", (Page) => (
              <RequireCompetency
                competency={[
                  "manage_practising_competencies",
                  ...SCOPED_MANAGER_IDS,
                ]}
              >
                <Page />
              </RequireCompetency>
            )),
          },
          // Operator-only: feedback comes from every organisation and may
          // hold patient data, so reading it is operating the deployment
          // rather than administering a place. The API refuses the same.
          {
            element: (
              <RequireOperator>
                <Outlet />
              </RequireOperator>
            ),
            children: [
              {
                path: "feedback",
                lazy: lazyFrom(loadAdmin, "AdminFeedbackPage"),
                handle: { safeForReload: true },
              },
              {
                path: "feedback/:id",
                lazy: lazyFrom(loadAdmin, "FeedbackDetailPage"),
                handle: { safeForReload: true },
              },
            ],
          },
          // The Newsletter section. Who may use it is decided in one
          // place, `mayUseNewsletter`, which the menu reads too; the API
          // has its own single gate.
          {
            element: (
              <RequireNewsletter>
                <Outlet />
              </RequireNewsletter>
            ),
            children: [
              {
                path: "newsletter",
                lazy: lazyFrom(loadAdmin, "AdminNewsletterPage"),
              },
            ],
          },
          {
            path: "organisations/:id/features",
            lazy: lazyFrom(loadAdmin, "OrgFeaturesPage", (Page) => (
              <RequireCompetency competency="manage_users">
                <Page />
              </RequireCompetency>
            )),
          },
          {
            path: "teaching",
            lazy: lazyFrom(loadAdmin, "AdminTeachingDashboard"),
            handle: { safeForReload: true },
          },
          {
            element: (
              <RequireOperator>
                <Outlet />
              </RequireOperator>
            ),
            children: [
              {
                path: "teaching/modules",
                lazy: lazyFrom(loadAdmin, "AdminTeachingPage"),
                handle: { safeForReload: true },
              },
              {
                path: "teaching/modules/:bankId",
                lazy: lazyFrom(loadAdmin, "AdminBankDetailPage"),
                handle: { safeForReload: true },
              },
              {
                path: "teaching/modules/:bankId/org/:orgId",
                lazy: lazyFrom(loadAdmin, "AdminBankOrgSettingsPage"),
              },
            ],
          },
          {
            path: "teaching/all-delegates",
            lazy: lazyFrom(loadAdmin, "AdminAllDelegatesPage"),
            handle: { safeForReload: true },
          },
        ],
      },

      // What the user has sent through the Feedback link, and its status.
      // Any signed-in user; the API returns only their own.
      {
        path: "/feedback",
        element: <YourFeedbackPage />,
        handle: { safeForReload: true },
      },
      // What is waiting on the person signed in, from every feature, and
      // what was lately dealt with. Any signed-in user; the API returns
      // only what is theirs. Reached from the envelope in the ribbon.
      {
        path: "/inbox",
        element: <InboxPage />,
        handle: { safeForReload: true },
      },
      // Settings
      {
        path: "/settings",
        element: <Settings />,
        handle: { safeForReload: true },
      },
      // Multi-step forms - not safe to silently reload mid-entry.
      { path: "/settings/totp", element: <TotpSetup /> },
      { path: "/settings/account", element: <AccountPage /> },
    ],
  },

  // Teaching routes - all use TeachingLayout (not MainLayout).
  // Shared layout route provides RequireAuth + RequireFeature guards once.
  //
  // One lazy chunk for all the learner pages,
  // features/teaching/teachingChunk.ts, and it must stay one. The exam and
  // its result cannot safely reload, so nothing may be fetched between
  // starting an attempt and seeing the result: with one chunk the result
  // page is already in memory when the exam begins.
  {
    path: "/teaching",
    element: (
      <RequireAuth>
        <RequireFeature
          feature="teaching"
          fallback={
            <TeachingLayout
              sidebar={<TeachingMainNav />}
              drawerContent={<TeachingMainNav />}
            >
              <NoAccessLayout feature="teaching" />
            </TeachingLayout>
          }
        >
          {/* The teaching pages sit outside RootLayout, so they need their
              own boundary. Without it a crash here fell through to React
              Router's built-in developer screen ("Hey developer"), shown in
              production as well, rather than the app's own fallback. */}
          {/* The outer door, as the API asks on the same pages: reaching
              teaching at all, and somebody's own results. Without it the
              pages loaded and then every request they made was refused. */}
          <RequireCompetency competency="view_teaching_results">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </RequireCompetency>
        </RequireFeature>
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        lazy: lazyFrom(loadTeaching, "TeachingDashboard"),
        handle: { safeForReload: true },
      },
      // The inner door: everything inside a module. Each page carries
      // the guard itself, through `lazyFrom`, so it stays the leaf route
      // and keeps its `handle`. The result pages below do not: a result
      // outlives the way into the module it came from.
      {
        path: ":bankId",
        lazy: lazyFrom(loadTeaching, "TeachingModuleMain", modulesOnly),
        handle: { safeForReload: true },
      },
      {
        path: "learn",
        lazy: lazyFrom(loadTeaching, "LearningDashboard", modulesOnly),
        handle: { safeForReload: true },
      },
      {
        path: "learn/:moduleId",
        element: (
          <RequireCompetency competency="take_teaching_modules">
            <Navigate to="slide/0" replace />
          </RequireCompetency>
        ),
      },
      {
        path: "learn/:moduleId/slide/:slideIndex",
        lazy: lazyFrom(loadTeaching, "SlideReader", modulesOnly),
        handle: { safeForReload: true },
      },
      // In-progress exam attempt - never safe to silently reload.
      {
        path: "assessment/:id",
        lazy: lazyFrom(loadTeaching, "AssessmentAttempt", modulesOnly),
      },
      // Reads location.state.fromExam - not reconstructible from URL alone.
      {
        path: "assessment/:id/result",
        lazy: lazyFrom(loadTeaching, "AssessmentResultPage"),
      },
      {
        path: "assessment/:id/question-results",
        lazy: lazyFrom(loadTeaching, "AssessmentQuestionResultsPage"),
        handle: { safeForReload: true },
      },
      {
        path: "sync",
        lazy: lazyFrom(loadTeaching, "SyncStatus"),
        handle: { safeForReload: true },
      },
    ],
  },

  // Passport - the one public page, in the same lazy chunk as the rest.
  //
  // It sits out here rather than inside RequireAuth: the invite landing,
  // which somebody with no Quill account at all must be able to open. It
  // authenticates on the signed token in the URL instead.
  //
  // `handle` stays on the route object, never inside the lazy module:
  // isRouteSafeForReload reads it synchronously, before the module has
  // loaded. Moving it would silently make every passport route
  // unsafe-by-default and stop it receiving updates.
  {
    path: "/passport/assessors/accept",
    lazy: lazyFrom(loadPassport, "PassportAcceptInvitePage"),
    handle: { safeForReload: true },
  },

  // Fallback -> show 404 page instead of redirecting to home
  { path: "*", element: <NotFound /> },
];
