/**
 * The passport feature's one lazy chunk: every passport page routed in
 * `main.tsx`, the two public ones included (the invite landing and the
 * verify page a printed QR code opens), and `CpdDateRangesPage`, which
 * lives under `pages/settings/` but is routed inside the passport block.
 *
 * The routes all load this module through `loadPassport` in
 * `featureChunks.ts`: one download on the way in and none after. Each
 * page file still exports `Component`, which is what its tests import. A
 * page added to passport is exported from here, never given a `lazy` of
 * its own.
 */

export { Component as CpdDateRangesPage } from "../settings/CpdDateRangesPage";
export { Component as PassportAcceptInvitePage } from "./PassportAcceptInvitePage";
export { Component as PassportCertificatePage } from "./PassportCertificatePage";
export { Component as PassportCertificatesPage } from "./PassportCertificatesPage";
export { Component as PassportCpdEntryPage } from "./PassportCpdEntryPage";
export { Component as PassportCpdPage } from "./PassportCpdPage";
export { Component as PassportDownloadPage } from "./PassportDownloadPage";
export { Component as PassportInboxPage } from "./PassportInboxPage";
export { Component as PassportLogbookEntryPage } from "./PassportLogbookEntryPage";
export { Component as PassportLogbookPage } from "./PassportLogbookPage";
export { Component as PassportPage } from "./PassportPage";
export { Component as PassportReflectionPage } from "./PassportReflectionPage";
export { Component as PassportReflectionsPage } from "./PassportReflectionsPage";
export { Component as PassportSignOffDetailPage } from "./PassportSignOffDetailPage";
export { Component as PassportSignOffPage } from "./PassportSignOffPage";
export { Component as PassportSignOffsPage } from "./PassportSignOffsPage";
export { Component as PassportVerifyPage } from "./PassportVerifyPage";
