/**
 * The admin area's one lazy chunk: every page routed under `/admin` in
 * `main.tsx`, the teaching admin pages included.
 *
 * The routes all load this module through `loadAdmin` in
 * `featureChunks.ts`, so admin is one download on the way in and none
 * after. Most people who sign in can never open it.
 *
 * `AdminPage`, `NewPatientPage` and `UserInfoUpdatePage` live outside this
 * folder but are routed only under `/admin`. A page added to the admin
 * area is exported from here, never given a `lazy` of its own.
 */

export { default as ActivatePatientPage } from "./patients/ActivatePatientPage";
export { default as AddPatientToOrgPage } from "./organisations/AddPatientToOrgPage";
export { default as AddSiteToOrgPage } from "./organisations/AddSiteToOrgPage";
export { default as AddStaffToOrgPage } from "./organisations/AddStaffToOrgPage";
export { default as AddStaffToSitePage } from "./sites/AddStaffToSitePage";
export { default as AdminAllDelegatesPage } from "./teaching/AdminAllDelegatesPage";
export { default as AdminBankDetailPage } from "./teaching/AdminBankDetailPage";
export { default as AdminBankOrgSettingsPage } from "./teaching/AdminBankOrgSettingsPage";
export { default as AdminFeedbackPage } from "./feedback/AdminFeedbackPage";
export { default as AdminOrganisationsPage } from "./organisations/AdminOrganisationsPage";
export { default as AdminPage } from "../AdminPage";
export { default as AdminPatientsPage } from "./patients/AdminPatientsPage";
export { default as AdminSitesPage } from "./sites/AdminSitesPage";
export { default as AdminTeachingDashboard } from "./teaching/AdminTeachingDashboard";
export { default as AdminTeachingPage } from "./teaching/AdminTeachingPage";
export { default as AdminUsersPage } from "./users/AdminUsersPage";
export { default as CreateOrganisationPage } from "./organisations/CreateOrganisationPage";
export { default as CreateSitePage } from "./sites/CreateSitePage";
export { default as DeactivatePatientPage } from "./patients/DeactivatePatientPage";
export { default as EditOrganisationPage } from "./organisations/EditOrganisationPage";
export { default as EditPatientPage } from "./patients/EditPatientPage";
export { default as EditSitePage } from "./sites/EditSitePage";
export { default as EditUserPage } from "./users/EditUserPage";
export { default as FeedbackDetailPage } from "./feedback/FeedbackDetailPage";
export { default as MemberPracticePage } from "./members/MemberPracticePage";
export { default as NewPatientPage } from "../NewPatientPage";
export { default as OrgFeaturesPage } from "./organisations/OrgFeaturesPage";
export { default as OrganisationAdminPage } from "./organisations/OrganisationAdminPage";
export { default as PatientAdminPage } from "./patients/PatientAdminPage";
export { default as SiteAdminPage } from "./sites/SiteAdminPage";
export { default as UserAdminPage } from "./users/UserAdminPage";
export { default as UserInfoUpdatePage } from "../UserInfoUpdatePage";
export { default as ViewAllPatientsPage } from "./patients/ViewAllPatientsPage";
