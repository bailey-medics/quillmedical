/**
 * How long an organisation's records outlast a closed account
 *
 * The number of months an organisation's training records are kept
 * after somebody's account is closed, before the nightly retention run
 * lists them for a decision. An operator reads and sets it; the
 * organisation's own admins do neither.
 */

import { api } from "@/lib/api";

/** The longest period that may be set, in months, as the API enforces */
export const MOST_MONTHS_KEPT = 600;

/** One organisation's period */
export interface RecordsKept {
  org_unit_id: number;
  organisation: string;
  /** The months, or null when its records are never listed */
  months: number | null;
}

/** The period in words, for a card or a message */
export function periodInWords(months: number | null): string {
  if (months === null) return "Not set";

  return `${months} ${months === 1 ? "month" : "months"}`;
}

export function getRecordsKept(orgUnitId: number): Promise<RecordsKept> {
  return api.get<RecordsKept>(`/retention/periods/${orgUnitId}`);
}

export function setRecordsKept(
  orgUnitId: number,
  months: number | null,
): Promise<RecordsKept> {
  return api.put<RecordsKept>(`/retention/periods/${orgUnitId}`, { months });
}
