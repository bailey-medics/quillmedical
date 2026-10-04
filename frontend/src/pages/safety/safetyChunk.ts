/**
 * The safety mock-up's one lazy chunk: every page routed under `/safety`
 * in `routes.tsx`.
 *
 * The routes all load this module through `loadSafety` in
 * `featureChunks.ts`: one download on the way in and none after. Each
 * page file still exports `Component`, which is what its tests import. A
 * page added to safety is exported from here, never given a `lazy` of its
 * own.
 */

export { Component as SafetyCasePage } from "./SafetyCasePage";
export { Component as SafetyDocumentEditPage } from "./SafetyDocumentEditPage";
export { Component as SafetyDocumentPage } from "./SafetyDocumentPage";
export { Component as SafetyDocumentationPage } from "./SafetyDocumentationPage";
export { Component as SafetyHazardPage } from "./SafetyHazardPage";
export { Component as SafetyHazardsPage } from "./SafetyHazardsPage";
export { Component as SafetyIncidentPage } from "./SafetyIncidentPage";
export { Component as SafetyIncidentsPage } from "./SafetyIncidentsPage";
export { Component as SafetyOfficersPage } from "./SafetyOfficersPage";
export { Component as SafetyPage } from "./SafetyPage";
export { Component as SafetyPlaceholdersEditPage } from "./SafetyPlaceholdersEditPage";
export { Component as SafetyPlaceholdersPage } from "./SafetyPlaceholdersPage";
export { Component as SafetySignOffDetailPage } from "./SafetySignOffDetailPage";
export { Component as SafetySignOffPage } from "./SafetySignOffPage";
