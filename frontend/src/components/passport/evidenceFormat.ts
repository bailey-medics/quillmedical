/**
 * Non-component helpers for passport evidence.
 *
 * Separate from the components themselves because a file exporting both
 * a component and a constant breaks React Fast Refresh — the same reason
 * `mediaFormat.ts` sits beside the media card.
 */

/**
 * What evidence may be, mirroring `ALLOWED_EVIDENCE_TYPES` on the
 * backend.
 *
 * Checked in both places deliberately. This one spares the holder an
 * upload that was never going to be accepted; the backend's is the one
 * that decides, because a caller controls this list and the store must
 * not admit whatever it is handed.
 *
 * Deliberately short: a scan, a photograph of a logbook page, or a PDF
 * of a course certificate is what this is for.
 */
export const ACCEPTED_EVIDENCE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
];
