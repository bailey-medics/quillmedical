/**
 * What to tell somebody whose registration did not work.
 *
 * The cases differ in whose problem it is, and saying so is the whole
 * point. A duplicate username is theirs to fix and the form should say
 * which field. A mail server that cannot be reached is ours, and
 * telling them "registration failed" invites them to check an email
 * address that was never wrong.
 *
 * **No account is created when the email cannot be sent.** The backend
 * sends the verification email before it commits, so a failed send
 * abandons the registration and leaves the address free. That is worth
 * saying out loud, because "we could not email you" otherwise reads as
 * though the account exists and the message is merely late.
 *
 * A pure function of the error, so every branch is testable without a
 * server, a render or a network.
 */

import type { FormStatusMessage } from "@/components/form/Form";

/** The shape `api.ts` throws: an Error carrying the HTTP status. */
interface ApiError extends Error {
  status?: number;
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof Error) {
    return (error as ApiError).status;
  }

  return undefined;
}

/**
 * Whether the message came from the backend rather than the network.
 *
 * `api.ts` puts the backend's `detail` into `Error.message`, so on a
 * 4xx that string is written for this person and is better than
 * anything here. On a transport failure it is a library's wording, and
 * it is not.
 */
function backendMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return undefined;
}

/**
 * Turn a failed registration into something worth reading.
 *
 * @param error - Whatever `api.post` threw.
 * @returns A title and description for the form's status message.
 */
export function registrationError(error: unknown): FormStatusMessage {
  const status = statusOf(error);

  // The verification email could not be sent, so nothing was saved.
  // Named separately from every other failure because the reassurance
  // is the useful part: their address is still free to register with.
  if (status === 502) {
    return {
      title: "We could not send your verification email",
      description:
        "Your account has not been created, so nothing is taken. " +
        "Please try again in a few minutes.",
    };
  }

  // Too many attempts for that address within the hour.
  if (status === 429) {
    return {
      title: "Too many attempts",
      description:
        "That email address has been tried several times recently. " +
        "Please wait a few minutes and try again.",
    };
  }

  // Their details: a username or email already taken, a password too
  // short. The backend says which, and its wording beats a guess.
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      title: backendMessage(error) ?? "Please check your details",
      description: "Something on the form could not be accepted.",
    };
  }

  // No status at all means the request never reached us: offline, DNS,
  // a proxy. Their details are not in question, so the message must not
  // imply they are.
  if (status === undefined) {
    return {
      title: "We could not reach Quill",
      description:
        "Your account has not been created. Please check your " +
        "connection and try again.",
    };
  }

  return {
    title: "Something went wrong",
    description:
      "Your account has not been created. Please try again, and " +
      "contact us if it keeps happening.",
  };
}
