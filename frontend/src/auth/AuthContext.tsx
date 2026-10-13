/**
 * Authentication Context Module
 *
 * Provides global authentication state management using React Context.
 * Handles user login, logout, session persistence, and automatic token refresh
 * via the API client. Wraps the entire application to provide auth state to
 * all components.
 */

/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, UNAUTHENTICATED_EVENT } from "../lib/api";
import { withoutSpaces } from "@/lib/oneTimeCode";
import { recordAuth } from "@lib/error-reporting/breadcrumbs";

/**
 * User
 *
 * Authenticated user profile information returned from GET /api/auth/me.
 */
export type User = {
  /** User database ID */
  id: string;
  /** Username */
  username: string;
  /** User email address */
  email: string;
  /** User display name (optional) */
  name?: string;
  /** Assigned role names (e.g., ["Clinician", "Administrator"]) */
  roles?: string[];
  /**
   * Whether this person operates Quill itself ("superadmin") or not
   * ("standard"). Replaced the four-rung `system_permissions` column,
   * now dropped - see docs/docs/plans/2026-09-09-platform-role-plan.md.
   */
  platform_role?: string;
  /** Features enabled on the user's primary organisation */
  enabled_features?: string[];
  /**
   * Whether they hold a clinician passport of their own. A holder may
   * always read and export it, even where `enabled_features` lacks the
   * passport, so this is what offers them the way in.
   */
  owns_passport?: boolean;
  /** Whether they are sent news and updates by email */
  marketing_emails?: boolean;
  /** Whether FHIR and EHRbase clinical services are available */
  clinical_services_enabled?: boolean;
  /** Resolved CBAC competency IDs for this user */
  competencies?: string[];
  /**
   * The patient record this account belongs to, where the same human is
   * both. Null for staff who are not patients here, so it is what marks
   * an account as a patient's own.
   *
   * A competency would be the natural test and cannot serve yet:
   * `access_patient_records` is held by eighteen staff professions as
   * well as by patients, because it names two different permissions.
   * See docs/docs/plans/2026-09-09-platform-role-plan.md.
   */
  fhir_patient_id?: string | null;
  /**
   * The competencies this person may grant to and remove from other
   * people, or null (or absent) for no limit. Empty for somebody who may
   * grant nothing. Worked out on the server from the whitelists in
   * `shared/competency-definitions/`; read through `useGrantScope`.
   */
  may_grant?: string[] | null;
  /** The base professions they may give somebody, read the same way. */
  may_assign_professions?: string[] | null;
};

/**
 * Authentication State
 *
 * Discriminated union representing the current authentication status.
 * - loading: Initial state while checking authentication
 * - unauthenticated: No valid session, user needs to log in
 * - authenticated: Valid session with user profile
 * - unreachable: The server could not be asked, so it is not known
 *   whether there is a session. Not the same as unauthenticated: being
 *   offline, or a 502 for the seconds of a deploy, ends nobody's
 *   session, and sending them to the login page would say it had.
 */
type State =
  | { status: "loading"; user: null; loggedOut?: false }
  | { status: "unauthenticated"; user: null; loggedOut?: boolean }
  | { status: "authenticated"; user: User; loggedOut?: false }
  | { status: "unreachable"; user: null; loggedOut?: false };

/** How long to wait before asking again while the server is out of reach. */
export const RETRY_UNREACHABLE_MS = 5_000;

/**
 * Auth Context Value
 *
 * Methods and state provided by AuthContext to consuming components.
 */
type Ctx = {
  /** Current authentication state */
  state: State;
  /** Authenticate user with username/password and optional TOTP code */
  login: (email: string, password: string, totp?: string) => Promise<User>;
  /** End user session and clear authentication state */
  logout: () => Promise<void>;
  /** Reload user profile from backend (re-check authentication) */
  reload: () => Promise<void>;
};

export const AuthContext = createContext<Ctx | undefined>(undefined);

/**
 * Auth Provider
 *
 * React context provider component that manages authentication state for the
 * entire application. Should wrap the root of the component tree.
 *
 * Automatically checks authentication on mount by calling GET /api/auth/me.
 * Provides login, logout, and reload methods to child components via useAuth hook.
 *
 * @param children - Child components that will have access to auth context
 */
/** Whether a failed request was refused for want of a session. */
function isUnauthenticated(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 401
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", user: null });

  /**
   * Ask the server who is signed in.
   *
   * Only a 401 means nobody is. Any other failure says nothing about
   * the session, so it changes nothing already known: somebody signed
   * in stays so. Somebody not yet known is `unreachable`, which the
   * guards show as "could not reach Quill" and which is tried again
   * until the server answers.
   */
  async function reload(): Promise<void> {
    try {
      const me = await api.get<User>("/auth/me");
      setState({ status: "authenticated", user: me });
    } catch (err) {
      if (isUnauthenticated(err)) {
        setState({ status: "unauthenticated", user: null });
        return;
      }

      // What is already known is kept, signed in or signed out. Only
      // somebody whose session was never established is left unknown.
      setState((current) =>
        current.status === "loading" || current.status === "unreachable"
          ? { status: "unreachable", user: null }
          : current,
      );
    }
  }

  async function login(
    username: string,
    password: string,
    totp?: string,
  ): Promise<User> {
    // Defensive programming: validate inputs
    if (!username || !username.trim()) {
      throw new Error("Username cannot be empty");
    }
    if (!password) {
      throw new Error("Password cannot be empty");
    }
    // As it is sent: an authenticator shows "123 456", and a code pasted
    // that way was once checked with its ends trimmed and then sent
    // with the space still in it, which the server refused.
    const code = totp === undefined ? "" : withoutSpaces(totp);

    if (code.length > 0 && code.length !== 6) {
      throw new Error("TOTP code must be 6 digits");
    }

    const body: Record<string, unknown> = {
      username: username.trim(),
      password,
    };
    if (code) body["totp_code"] = code;
    // Let errors bubble to the caller (LoginPage) so it can inspect
    // any structured `error_code` attached by the API helper.
    await api.post("/auth/login", body);
    recordAuth("login");
    const user = await api.get<User>("/auth/me");
    // Do NOT set state here. LoginPage performs a full-page navigation
    // (window.location.assign) after login, and the new page's
    // AuthProvider will call reload() to pick up the session. Setting
    // state would trigger GuestOnly's useEffect redirect to "/" which
    // races with LoginPage's own redirect destination.
    return user;
  }

  /**
   * End the session, and only then say it has ended.
   *
   * The server is what ends it: it clears the session cookies, which
   * this page cannot read or remove. So if the call fails, the cookies
   * are still there and the person is still signed in, whatever the
   * screen says. Showing the login page then, as this once did, left
   * the next person to reload on a shared computer signed in as the
   * last. A failure is thrown for the caller to show, and the state is
   * left as it was.
   *
   * A 401 is not a failure: the session was already over.
   *
   * @throws Error when the session could not be ended.
   */
  async function logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      if (!isUnauthenticated(err)) {
        throw new Error("Could not sign out", { cause: err });
      }
    }

    recordAuth("logout");
    setState({ status: "unauthenticated", user: null, loggedOut: true });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth check on mount
    void reload();
  }, []);

  // While the server is out of reach, keep asking: every few seconds,
  // and at once when the browser says the connection is back.
  const unreachable = state.status === "unreachable";

  useEffect(() => {
    if (!unreachable) return;

    const timer = window.setInterval(() => void reload(), RETRY_UNREACHABLE_MS);
    const whenOnline = () => void reload();
    window.addEventListener("online", whenOnline);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", whenOnline);
    };
  }, [unreachable]);

  // A request anywhere in the app came back 401 and the silent refresh did
  // not help, so the session has ended. Marking it here is all that is
  // needed: `RequireAuth` then sends somebody on a guarded page to
  // `/login`, remembering where they were, and a page with no guard is
  // left alone. Nothing else in the app navigates on a 401.
  useEffect(() => {
    function handleUnauthenticated() {
      setState((current) =>
        // Already signed out: keep the state as it is. After an explicit
        // logout it carries `loggedOut`, which stops the next person on
        // this tab being sent to the last person's page.
        current.status === "unauthenticated"
          ? current
          : { status: "unauthenticated", user: null },
      );
    }

    window.addEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);

    return () =>
      window.removeEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth Hook
 *
 * React hook for accessing authentication state and methods from any component
 * within the AuthProvider tree. Provides current user, login/logout functions,
 * and reload capability.
 *
 * @returns Auth context value with state and methods
 * @throws Error if called outside AuthProvider
 *
 * @example
 * function MyComponent() {
 *   const { state, login, logout } = useAuth();
 *   if (state.status === 'authenticated') {
 *     return <div>Welcome {state.user.email}</div>;
 *   }
 *   return <LoginForm onSubmit={login} />;
 * }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
