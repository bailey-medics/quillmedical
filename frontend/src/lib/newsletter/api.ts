/**
 * The Newsletter section's calls to the backend.
 *
 * A mailing list file is checked first, which changes nothing, and then
 * imported by sending the same file again with the fingerprint the check
 * gave back. The backend keeps nothing between the two.
 */

import { api } from "@/lib/api";

/** How many people a newsletter would reach now, by kind. */
export interface NewsletterAudience {
  /** Account holders who may be sent one */
  accounts: number;
  /** Mailing-list subscribers who may be sent one */
  subscribers: number;
  /** Mailing-list subscribers who have unsubscribed */
  unsubscribed: number;
}

/**
 * What importing a mailing list file would do, or did, in numbers. No
 * address and no name is ever in it.
 */
export interface MailingListSummary {
  /** Rows in the file, the header aside */
  rows: number;
  /** People not on the mailing list yet */
  new: number;
  /** People on it whom the file leaves as they are */
  already_there: number;
  /** People on it, subscribed, whom the file opts out */
  switched_off: number;
  /** People in the file opted in */
  opted_in: number;
  /** People in the file opted out */
  opted_out: number;
  /** People in the file who hold a verified account */
  have_accounts: number;
  /** Rows with no usable address, left out */
  no_address: number;
  /** Rows whose opt in or out could not be read, left out */
  unreadable_answer: number;
  /** Rows naming an address an earlier row had */
  repeated: number;
  /** Whether the file said who is opted in and out */
  has_opt_column: boolean;
  /** The numbers of the first rows with no usable address */
  no_address_rows: number[];
  /** The numbers of the first rows with an unreadable answer */
  unreadable_answer_rows: number[];
  /** What to send back to import this file for real */
  fingerprint: string;
  /** Whether this was the import and not only a check */
  imported: boolean;
}

/** How many people a newsletter would reach now. */
export function fetchAudience(): Promise<NewsletterAudience> {
  return api.get<NewsletterAudience>("/newsletter/audience");
}

/** Say what importing a file would do. Changes nothing. */
export function checkMailingList(file: File): Promise<MailingListSummary> {
  const form = new FormData();
  form.append("file", file);
  return api.post<MailingListSummary>("/newsletter/mailing-list/check", form);
}

/** Import a file that has just been checked. */
export function importMailingList(
  file: File,
  fingerprint: string,
): Promise<MailingListSummary> {
  const form = new FormData();
  form.append("file", file);
  form.append("fingerprint", fingerprint);
  return api.post<MailingListSummary>("/newsletter/mailing-list/import", form);
}
