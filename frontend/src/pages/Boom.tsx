/**
 * Deliberate crash, for verifying error reporting end to end
 *
 * TEMPORARY. This page exists to prove one thing that cannot be proved from a
 * browser console: that a React render error reaches Cloud Error Reporting
 * with React's component stack attached. That stack is the field that names
 * the failing part of the interface rather than an offset into a minified
 * bundle, and the error boundary is the only place it exists.
 *
 * Once a report from here has been seen in Error Reporting, this file and its
 * route are to be reverted. Deliberate-crash code does not belong in a
 * clinical codebase any longer than the verification takes, and the git
 * history is the durable record that the check happened.
 *
 * It sits inside `RootLayout`'s children, which are behind `RequireAuth`, so
 * only a signed-in user can reach it. Nothing links to it.
 */

export default function Boom(): never {
  throw new Error("Deliberate crash from /boom, verifying error reporting");
}
