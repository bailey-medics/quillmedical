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
import { api } from "../lib/api";

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
};

/**
 * Authentication State
 *
 * Discriminated union representing the current authentication status.
 * - loading: Initial state while checking authentication
 * - unauthenticated: No valid session, user needs to log in
 * - authenticated: Valid session with user profile
 */
type State =
  | { status: "loading"; user: null }
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: User };

/**
 * Auth Context Value
 *
 * Methods and state provided by AuthContext to consuming components.
 */
type Ctx = {
  /** Current authentication state */
  state: State;
  /** Authenticate user with username/password and optional TOTP code */
  login: (email: string, password: string, totp?: string) => Promise<void>;
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
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", user: null });

  async function reload() {
    try {
      const me = await api.get<User>("/auth/me");
      setState({ status: "authenticated", user: me });
    } catch {
      setState({ status: "unauthenticated", user: null });
    }
  }

  async function login(username: string, password: string, totp?: string) {
    // Defensive programming: validate inputs
    if (!username || !username.trim()) {
      throw new Error("Username cannot be empty");
    }
    if (!password) {
      throw new Error("Password cannot be empty");
    }
    if (
      totp !== undefined &&
      totp.trim().length > 0 &&
      totp.trim().length !== 6
    ) {
      throw new Error("TOTP code must be 6 digits");
    }

    const body: Record<string, unknown> = {
      username: username.trim(),
      password,
    };
    if (totp) body["totp_code"] = totp;
    // Let errors bubble to the caller (LoginPage) so it can inspect
    // any structured `error_code` attached by the API helper.
    await api.post("/auth/login", body);
    await reload();
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors, proceed to clear local state
    }
    setState({ status: "unauthenticated", user: null });
  }

  useEffect(() => {
    void reload();
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
