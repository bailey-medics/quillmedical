import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

export type User = {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
};

type State =
  | { status: "loading"; user: null }
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: User };

type Ctx = {
  state: State;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

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

  async function login(username: string, password: string) {
    await api.post("/auth/login", { username: username.trim(), password });
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
