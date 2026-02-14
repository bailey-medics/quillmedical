/**
 * Mock Auth Provider for Storybook
 *
 * Provides a mock authenticated context for testing components that
 * depend on AuthContext without requiring a real backend connection.
 */

import React, { createContext, useContext, useState } from "react";
import type { User } from "@/auth/AuthContext";

/**
 * Authentication State
 */
type State =
  | { status: "loading"; user: null }
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: User };

/**
 * Auth Context Value
 */
type Ctx = {
  state: State;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const MockAuthContext = createContext<Ctx | undefined>(undefined);

/**
 * Mock Auth Provider
 *
 * Provides a mock authenticated user context for Storybook stories.
 * Simulates the real AuthProvider but with instant authentication.
 *
 * @param children - Child components
 * @param user - Optional custom user object
 */
export function MockAuthProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: User;
}) {
  const defaultUser: User = {
    id: "1",
    email: "mark.bailey@example.com",
    name: "Mark Bailey",
    roles: ["Clinician"],
  };

  const [state, setState] = useState<State>({
    status: "authenticated",
    user: user || defaultUser,
  });

  const login = async () => {
    setState({ status: "authenticated", user: user || defaultUser });
  };

  const logout = async () => {
    setState({ status: "unauthenticated", user: null });
  };

  const reload = async () => {
    setState({ status: "authenticated", user: user || defaultUser });
  };

  return (
    <MockAuthContext.Provider value={{ state, login, logout, reload }}>
      {children}
    </MockAuthContext.Provider>
  );
}

/**
 * Mock useAuth Hook
 *
 * Hook for accessing mock auth context in Storybook.
 * Note: In real app, components import useAuth from @/auth/AuthContext.
 * This is only used when explicitly imported from this file.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useMockAuth() {
  const ctx = useContext(MockAuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
