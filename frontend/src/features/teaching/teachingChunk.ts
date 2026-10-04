/**
 * The teaching feature's one lazy chunk: every learner page routed under
 * `/teaching` in `main.tsx`. The teaching admin pages are in the admin
 * chunk, not here.
 *
 * The routes all load this module through `loadTeaching` in
 * `featureChunks.ts`. It must stay one chunk. `AssessmentAttempt` and
 * `AssessmentResultPage` are not safe to reload, so no code may be fetched
 * between starting an exam and seeing its result: a fetch that failed
 * there could not be recovered without losing the attempt. A page added to
 * teaching is exported from here, never given a `lazy` of its own.
 */

export { default as AssessmentAttempt } from "./pages/AssessmentAttempt";
export { default as AssessmentQuestionResultsPage } from "./pages/AssessmentQuestionResultsPage";
export { default as AssessmentResultPage } from "./pages/AssessmentResultPage";
export { default as LearningDashboard } from "./pages/LearningDashboard";
export { default as SlideReader } from "./pages/SlideReader";
export { default as SyncStatus } from "./pages/SyncStatus";
export { default as TeachingDashboard } from "./pages/TeachingDashboard";
export { default as TeachingModuleMain } from "./pages/TeachingModuleMain";
