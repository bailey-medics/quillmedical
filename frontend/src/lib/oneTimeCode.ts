/**
 * A one-time code as it is sent to the server.
 *
 * Authenticator apps show the six digits with a space in the middle,
 * "123 456", and that is how a code is copied and pasted. The server
 * wants the digits alone, so every space is taken out before a code is
 * checked or sent, wherever one is typed.
 */

/** A code with every space, tab and line break taken out. */
export function withoutSpaces(code: string): string {
  return code.replace(/\s+/g, "");
}
